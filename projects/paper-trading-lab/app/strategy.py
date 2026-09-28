import math
import pandas as pd

from .indicators import ema, rsi, atr

STRATEGY_ARCHITECTURE_VERSION = 'multi-timeframe-trend-pullback-recovery-v3'

# 1-minute entry structure retained from v2.
REGIME_SLOPE_BARS = 5

# Higher-timeframe filters are deliberately short-period because they are
# constructed from local 1-minute history. This avoids extra Alpaca API calls.
MTF_FAST = 3
MTF_SLOW = 6
MTF_RSI = 7
MTF_SLOPE_BARS = 2
MTF_MIN_ONE_MINUTE_BARS = 360
MTF_TIMEFRAMES = (5, 15, 30)


def _down_streak(fast, slow):
    n = 0
    for f, s in zip(reversed(fast.tolist()), reversed(slow.tolist())):
        if float(f) < float(s):
            n += 1
        else:
            break
    return n


def _clean_1m(df):
    if df is None or df.empty or 'ts' not in df.columns:
        return pd.DataFrame()

    x = df.copy()
    # Alpaca timestamps are ISO-8601 but fractional-second precision can vary
    # between rows.  Explicit ISO8601 parsing avoids pandas' per-element
    # dateutil fallback and the repeated "Could not infer format" warning.
    try:
        x['ts'] = pd.to_datetime(
            x['ts'],
            format='ISO8601',
            utc=True,
            errors='coerce',
        )
    except (TypeError, ValueError):
        # Compatibility fallback for older pandas releases.
        x['ts'] = pd.to_datetime(
            x['ts'],
            utc=True,
            errors='coerce',
        )
    for col in ('open', 'high', 'low', 'close', 'volume'):
        x[col] = pd.to_numeric(x[col], errors='coerce')

    x = (
        x.dropna(subset=['ts', 'open', 'high', 'low', 'close'])
        .sort_values('ts')
        .drop_duplicates('ts', keep='last')
    )
    return x


def _closed_timeframe_bars(one_minute, minutes):
    """
    Build CLOSED higher-timeframe bars locally.

    The current incomplete 5m/15m/30m bucket is excluded, so the filter does
    not flip based on a partially formed candle.
    """
    x = _clean_1m(one_minute)
    if x.empty:
        return pd.DataFrame()

    freq = f'{int(minutes)}min'
    x['bucket'] = x['ts'].dt.floor(freq)

    grouped = x.groupby('bucket', sort=True)
    agg = grouped.agg(
        open=('open', 'first'),
        high=('high', 'max'),
        low=('low', 'min'),
        close=('close', 'last'),
        volume=('volume', 'sum'),
        count=('close', 'count'),
        last_ts=('ts', 'max'),
    ).reset_index()

    # Require the final minute of a bucket to be present. This is stricter than
    # merely requiring N observations and reliably drops the live partial bar.
    agg['expected_last_ts'] = (
        agg['bucket'] + pd.to_timedelta(int(minutes) - 1, unit='m')
    )
    min_count = max(2, int(math.ceil(int(minutes) * 0.70)))
    agg = agg[
        (agg['count'] >= min_count)
        & (agg['last_ts'] >= agg['expected_last_ts'])
    ].copy()

    return agg[['bucket', 'open', 'high', 'low', 'close', 'volume']]


def _timeframe_state(one_minute, minutes):
    bars = _closed_timeframe_bars(one_minute, minutes)
    need = MTF_SLOW + MTF_SLOPE_BARS

    if len(bars) < need:
        return {
            'minutes': minutes,
            'ready': False,
            'state': 'NOT_READY',
            'bars': len(bars),
            'need_bars': need,
            'ema_fast': None,
            'ema_slow': None,
            'spread_bps': None,
            'spread_delta_bps': None,
            'slow_slope_bps': None,
            'rsi': None,
            'rsi_delta': None,
            'price_above_slow': False,
        }

    close = bars['close'].astype(float)
    fast = ema(close, MTF_FAST)
    slow = ema(close, MTF_SLOW)
    rv = rsi(close, MTF_RSI)

    f = float(fast.iloc[-1])
    s = float(slow.iloc[-1])
    prev_f = float(fast.iloc[-2])
    prev_s = float(slow.iloc[-2])
    px = float(close.iloc[-1])

    spread = ((f / s) - 1.0) * 10000 if s else 0.0
    prev_spread = ((prev_f / prev_s) - 1.0) * 10000 if prev_s else 0.0
    spread_delta = spread - prev_spread

    slow_then = float(slow.iloc[-1 - MTF_SLOPE_BARS])
    slow_slope = ((s / slow_then) - 1.0) * 10000 if slow_then else 0.0

    r = float(rv.iloc[-1])
    prev_r = float(rv.iloc[-2])
    rsi_delta = r - prev_r
    price_above = px > s

    # Strong directional classifications require agreement between EMA,
    # slow-EMA slope and price location. Otherwise the state stays neutral.
    if f > s and slow_slope > 0 and price_above:
        state = 'BULLISH'
    elif f < s and slow_slope < 0 and not price_above:
        state = 'BEARISH'
    elif spread_delta > 0 and rsi_delta >= 0:
        state = 'RECOVERING'
    else:
        state = 'NEUTRAL'

    return {
        'minutes': minutes,
        'ready': True,
        'state': state,
        'bars': len(bars),
        'need_bars': need,
        'ema_fast': f,
        'ema_slow': s,
        'spread_bps': spread,
        'spread_delta_bps': spread_delta,
        'slow_slope_bps': slow_slope,
        'rsi': r,
        'rsi_delta': rsi_delta,
        'price_above_slow': price_above,
    }


def _mtf_snapshot(df):
    states = {
        '5m': _timeframe_state(df, 5),
        '15m': _timeframe_state(df, 15),
        '30m': _timeframe_state(df, 30),
    }

    ready = all(x['ready'] for x in states.values())
    if not ready:
        return {
            'ready': False,
            'states': states,
            'entry_ok': False,
            'checks': {
                '30m_not_bearish': False,
                '15m_not_bearish': False,
                '5m_momentum_ok': False,
                'higher_tf_bullish': False,
            },
        }

    s5 = states['5m']['state']
    s15 = states['15m']['state']
    s30 = states['30m']['state']

    checks = {
        # 30m is a broad veto: only a clearly bearish regime blocks.
        '30m_not_bearish': s30 != 'BEARISH',

        # 15m is also a veto against a confirmed bearish intermediate trend.
        '15m_not_bearish': s15 != 'BEARISH',

        # 5m must show actual momentum or recovery before 1m is allowed to fire.
        '5m_momentum_ok': s5 in ('BULLISH', 'RECOVERING'),

        # If 30m is neutral, require 15m to be bullish. If 30m is bullish,
        # a neutral/recovering 15m is acceptable.
        'higher_tf_bullish': (s30 == 'BULLISH' or s15 == 'BULLISH'),
    }

    return {
        'ready': True,
        'states': states,
        'entry_ok': all(checks.values()),
        'checks': checks,
    }


def evaluate(df, cfg):
    """
    Architecture v3.

    30m: market-regime veto
    15m: intermediate-trend veto/confirmation
    5m : short-term momentum/recovery confirmation
    1m : precise pullback + recovery entry

    Higher timeframes are generated from locally stored 1-minute bars, so this
    architecture adds NO extra Alpaca REST calls.

    Exit logic remains ATR stop/take in engine plus RSI/confirmed EMA exits.
    """
    confirm = int(cfg.get('ema_exit_confirm_bars', 3))
    min_spread_bps = float(cfg.get('ema_entry_min_spread_bps', 2.0))

    need = max(
        int(MTF_MIN_ONE_MINUTE_BARS),
        max(cfg['ema_slow'], cfg['rsi_period'], cfg['atr_period'])
        + max(6, confirm, REGIME_SLOPE_BARS + 1),
    )

    if len(df) < need:
        return {
            'signal': 'HOLD',
            'reason': f'not_enough_data_for_mtf: {len(df)}/{need} 1m bars',
            'ready': False,
            'bars': len(df),
            'need_bars': need,
            'architecture_version': STRATEGY_ARCHITECTURE_VERSION,
            'ema_fast': None,
            'ema_slow': None,
            'trend': 'UNKNOWN',
            'rsi': None,
            'atr': None,
            'rsi_buy_threshold': cfg['rsi_buy'],
            'rsi_sell_threshold': cfg['rsi_sell'],
            'ema_exit_confirm_bars': confirm,
            'ema_down_streak': 0,
            'ema_entry_spread_bps': None,
            'ema_entry_min_spread_bps': min_spread_bps,
            'regime_slope_bars': REGIME_SLOPE_BARS,
            'slow_ema_slope_bps': None,
            'rsi_recovering': False,
            'price_above_slow': False,
            'mtf': _mtf_snapshot(df),
            'buy_checks': {
                'trend_up': False,
                'rsi_low_enough': False,
                'spread_ok': False,
                'slow_ema_rising': False,
                'price_above_slow': False,
                'rsi_recovering': False,
                'mtf_alignment_ok': False,
            },
            'sell_checks': {
                'trend_down': False,
                'trend_down_confirmed': False,
                'rsi_high_enough': False,
            },
        }

    fast = ema(df['close'], cfg['ema_fast'])
    slow = ema(df['close'], cfg['ema_slow'])
    rv = rsi(df['close'], cfg['rsi_period'])
    av = atr(df, cfg['atr_period'])

    px = float(df['close'].iloc[-1])
    f = float(fast.iloc[-1])
    s = float(slow.iloc[-1])
    r = float(rv.iloc[-1])
    prev_r = float(rv.iloc[-2])
    a = float(av.iloc[-1])

    trend_up = f > s
    trend_down = f < s
    rsi_low = r <= float(cfg['rsi_buy'])
    rsi_high = r >= float(cfg['rsi_sell'])

    spread_bps = ((f / s) - 1.0) * 10000 if s else 0.0
    spread_ok = spread_bps >= min_spread_bps

    slow_then = float(slow.iloc[-1 - REGIME_SLOPE_BARS])
    slow_slope_bps = ((s / slow_then) - 1.0) * 10000 if slow_then else 0.0
    slow_rising = slow_slope_bps > 0.0
    price_above_slow = px > s
    rsi_recovering = r > prev_r

    mtf = _mtf_snapshot(df)
    mtf_alignment_ok = bool(mtf.get('ready') and mtf.get('entry_ok'))

    streak = _down_streak(fast, slow)
    down_confirmed = streak >= confirm

    buy_checks = {
        'trend_up': trend_up,
        'rsi_low_enough': rsi_low,
        'spread_ok': spread_ok,
        'slow_ema_rising': slow_rising,
        'price_above_slow': price_above_slow,
        'rsi_recovering': rsi_recovering,
        'mtf_alignment_ok': mtf_alignment_ok,
    }

    common = {
        'ready': True,
        'bars': len(df),
        'need_bars': need,
        'architecture_version': STRATEGY_ARCHITECTURE_VERSION,
        'price': px,
        'ema_fast': f,
        'ema_slow': s,
        'trend': 'UP' if trend_up else ('DOWN' if trend_down else 'FLAT'),
        'rsi': r,
        'rsi_prev': prev_r,
        'rsi_buy_threshold': float(cfg['rsi_buy']),
        'rsi_sell_threshold': float(cfg['rsi_sell']),
        'atr': a,
        'ema_exit_confirm_bars': confirm,
        'ema_down_streak': streak,
        'ema_entry_spread_bps': spread_bps,
        'ema_entry_min_spread_bps': min_spread_bps,
        'regime_slope_bars': REGIME_SLOPE_BARS,
        'slow_ema_slope_bps': slow_slope_bps,
        'rsi_recovering': rsi_recovering,
        'price_above_slow': price_above_slow,
        'mtf': mtf,
        'buy_checks': buy_checks,
        'sell_checks': {
            'trend_down': trend_down,
            'trend_down_confirmed': down_confirmed,
            'rsi_high_enough': rsi_high,
        },
    }

    if all(buy_checks.values()):
        s5 = mtf['states']['5m']['state']
        s15 = mtf['states']['15m']['state']
        s30 = mtf['states']['30m']['state']
        return {
            **common,
            'signal': 'BUY',
            'reason': (
                f'BUY v3: MTF 30m={s30}, 15m={s15}, 5m={s5}; '
                f'1m pullback recovered, spread {spread_bps:.2f}bps, '
                f'RSI {prev_r:.1f}->{r:.1f}'
            ),
        }

    if rsi_high:
        return {
            **common,
            'signal': 'SELL',
            'exit_reason': 'RSI_EXIT',
            'reason': f'SELL: RSI {r:.1f} >= {cfg["rsi_sell"]}',
        }

    if down_confirmed:
        return {
            **common,
            'signal': 'SELL',
            'exit_reason': 'EMA_DOWN_CONFIRMED',
            'reason': f'SELL: EMA down confirmed {streak}/{confirm} bars',
        }

    if trend_down:
        return {
            **common,
            'signal': 'EXIT_WATCH',
            'reason': f'EXIT WATCH: EMA down {streak}/{confirm}; waiting for confirmation',
        }

    blockers = []
    if not mtf_alignment_ok:
        states = mtf.get('states', {})
        blockers.append(
            'MTF block '
            f'30m={states.get("30m", {}).get("state", "NOT_READY")} / '
            f'15m={states.get("15m", {}).get("state", "NOT_READY")} / '
            f'5m={states.get("5m", {}).get("state", "NOT_READY")}'
        )
    if not trend_up:
        blockers.append('1m EMA trend not up')
    if not rsi_low:
        blockers.append(f'1m RSI {r:.1f} > BUY {cfg["rsi_buy"]}')
    if not spread_ok:
        blockers.append(
            f'1m EMA spread {spread_bps:.2f}bps < {min_spread_bps:.2f}bps'
        )
    if not slow_rising:
        blockers.append(
            f'1m slow EMA not rising ({slow_slope_bps:.2f}bps/{REGIME_SLOPE_BARS} bars)'
        )
    if not price_above_slow:
        blockers.append('1m price below slow EMA')
    if not rsi_recovering:
        blockers.append(f'1m RSI still falling ({prev_r:.1f}->{r:.1f})')

    return {
        **common,
        'signal': 'HOLD',
        'reason': 'HOLD: ' + (' / '.join(blockers) if blockers else 'waiting'),
    }