import json
from copy import deepcopy
from datetime import datetime, timezone

from .db import connect, meta_get, meta_set
from .strategy import evaluate
from .config import settings
from .symbols import canonical_symbol

RACE_VERSION = 'v0.29.3-mtf-v3'
CHALLENGER_IDS = ['challenger_a', 'challenger_b', 'challenger_c']


def _mutate(base, fast_delta=0, slow_delta=0, rsi_buy_delta=0, rsi_sell_delta=0,
            atr_stop_delta=0, atr_take_delta=0, exit_confirm_delta=0, entry_spread_delta=0):
    c = deepcopy(base)
    c['ema_fast'] = max(5, int(c['ema_fast'] + fast_delta))
    c['ema_slow'] = max(c['ema_fast'] + 2, int(c['ema_slow'] + slow_delta))
    c['rsi_buy'] = max(20.0, min(48.0, float(c['rsi_buy'] + rsi_buy_delta)))
    c['rsi_sell'] = max(52.0, min(85.0, float(c['rsi_sell'] + rsi_sell_delta)))
    c['atr_stop'] = max(0.8, min(4.0, float(c['atr_stop'] + atr_stop_delta)))
    c['atr_take'] = max(1.0, min(6.0, float(c['atr_take'] + atr_take_delta)))
    c['ema_exit_confirm_bars'] = max(2, min(6, int(c.get('ema_exit_confirm_bars', 3) + exit_confirm_delta)))
    c['ema_entry_min_spread_bps'] = max(
        0.0, min(20.0, float(c.get('ema_entry_min_spread_bps', 2.0) + entry_spread_delta))
    )
    return c


def _variants(current_cfg):
    return {
        'challenger_a': (
            'Challenger A', 'SHADOW',
            _mutate(current_cfg, fast_delta=-2, rsi_buy_delta=-2,
                    atr_take_delta=0.2, exit_confirm_delta=1),
            'Faster entry + stricter pullback + 4-bar EMA exit confirmation'
        ),
        'challenger_b': (
            'Challenger B', 'SHADOW',
            _mutate(current_cfg, slow_delta=4, rsi_sell_delta=2,
                    atr_stop_delta=-0.15, entry_spread_delta=1.0),
            'Slower trend + tighter ATR stop + stronger EMA spread filter'
        ),
        'challenger_c': (
            'Challenger C', 'SHADOW',
            _mutate(current_cfg, fast_delta=2, rsi_buy_delta=2,
                    atr_take_delta=0.35, exit_confirm_delta=1),
            'More selective trend timing + wider take profit'
        ),
    }


def race_epoch_info():
    return {
        'version': meta_get('race_epoch_version'),
        'epoch_ts': meta_get('race_epoch_ts'),
        'starting_equity': float(meta_get('race_start_equity', 0) or 0),
        'alpaca_cash_at_start': float(meta_get('race_alpaca_cash_at_start', 0) or 0),
        'shadow_start_cash': float(meta_get('race_shadow_start_cash', 0) or 0),
        'seed_position_value': float(meta_get('race_seed_position_value', 0) or 0),
        'seed_position_count': int(float(meta_get('race_seed_position_count', 0) or 0)),
        'cash_adjustment': float(meta_get('race_cash_adjustment', 0) or 0),
    }


def ensure_race_epoch(current_cfg, account, actual_positions, frames=None):
    """Start a fair race with a strict accounting invariant.

    Shadow Cash + Seeded Position Value == Race Starting Equity

    Alpaca cash is not copied blindly because cash may be reduced by reserved
    or pending orders even when those assets are not positions yet.
    """
    info = race_epoch_info()
    if info['version'] == RACE_VERSION and info['starting_equity'] > 0:
        return info

    frames = frames or {}
    start_equity = float(account.get('equity') or 0)
    alpaca_cash = float(account.get('cash') or 0)

    if start_equity <= 0:
        raise RuntimeError('Cannot initialize strategy race: Alpaca equity is not positive')

    epoch_ts = datetime.now(timezone.utc).isoformat()

    # Normalize actual long positions into one snapshot.
    seeds = []
    for p in actual_positions:
        qty = float(p.get('qty') or 0)
        if qty <= 0:
            continue

        symbol = canonical_symbol(p.get('symbol'))
        market_value = abs(float(p.get('market_value') or 0))

        current_price = float(
            p.get('current_price')
            or ((market_value / qty) if qty and market_value > 0 else 0)
            or p.get('avg_entry_price')
            or 0
        )
        if current_price <= 0:
            continue

        position_value = qty * current_price
        if position_value <= 0:
            continue

        seeds.append({
            'symbol': symbol,
            'qty': qty,
            'price': current_price,
            'value': position_value,
        })

    seed_total = sum(x['value'] for x in seeds)

    # Long-only/no-leverage defensive guard.
    # If the snapshot is inconsistent, use a cash-only fair start instead of
    # manufacturing a large negative return.
    if seed_total > start_equity * 1.001:
        seeds = []
        seed_total = 0.0

    shadow_cash = max(start_equity - seed_total, 0.0)

    # Floating-point correction: exact accounting equality.
    shadow_cash += start_equity - (shadow_cash + seed_total)
    cash_adjustment = shadow_cash - alpaca_cash

    with connect() as c:
        # v0.27.2 intentionally creates one new clean epoch because v0.27.1
        # could initialize Challengers with an artificial cash deficit.
        c.execute('DELETE FROM strategy_race_positions')
        c.execute('DELETE FROM strategy_race_trades')
        c.execute('DELETE FROM strategy_race_equity')
        c.execute('DELETE FROM strategy_race_configs')
        c.execute('DELETE FROM strategy_race_accounts')

        for sid, (name, role, cfg, reason) in _variants(current_cfg).items():
            c.execute(
                '''INSERT INTO strategy_race_accounts
                (strategy_id,name,role,starting_equity,cash,peak_equity,realized_pnl)
                VALUES(?,?,?,?,?,?,0)''',
                (sid, name, role, start_equity, shadow_cash, start_equity)
            )

            c.execute(
                '''INSERT INTO strategy_race_configs
                (strategy_id,config_json,generated_reason)
                VALUES(?,?,?)''',
                (sid, json.dumps(cfg), reason)
            )

            for seed in seeds:
                symbol = seed['symbol']
                current_price = seed['price']
                qty = seed['qty']

                df = frames.get(symbol)
                atr_now = 0.0
                if df is not None and not df.empty:
                    sig = evaluate(df, cfg)
                    atr_now = float(sig.get('atr') or 0)

                stop = current_price - atr_now * float(cfg['atr_stop']) if atr_now > 0 else None
                take = current_price + atr_now * float(cfg['atr_take']) if atr_now > 0 else None

                c.execute(
                    '''INSERT INTO strategy_race_positions
                    (strategy_id,symbol,qty,avg_price,stop_price,take_profit_price)
                    VALUES(?,?,?,?,?,?)''',
                    (sid, symbol, qty, current_price, stop, take)
                )

            initial_mv = sum(seed['value'] for seed in seeds)
            initial_equity = shadow_cash + initial_mv

            if abs(initial_equity - start_equity) > 0.01:
                raise RuntimeError(
                    f'Race accounting invariant failed: '
                    f'{initial_equity:.2f} != {start_equity:.2f}'
                )

            c.execute(
                '''INSERT INTO strategy_race_equity(strategy_id,equity,drawdown)
                VALUES(?,?,0)''',
                (sid, initial_equity)
            )

    meta_set('race_epoch_version', RACE_VERSION)
    meta_set('race_epoch_ts', epoch_ts)
    meta_set('race_start_equity', start_equity)
    meta_set('race_alpaca_cash_at_start', alpaca_cash)
    meta_set('race_shadow_start_cash', shadow_cash)
    meta_set('race_seed_position_value', seed_total)
    meta_set('race_seed_position_count', len(seeds))
    meta_set('race_cash_adjustment', cash_adjustment)

    return race_epoch_info()


def _strategy_cfg(strategy_id):
    with connect() as c:
        r = c.execute(
            'SELECT config_json FROM strategy_race_configs WHERE strategy_id=?',
            (strategy_id,)
        ).fetchone()
        return json.loads(r['config_json']) if r else None


def _positions(strategy_id):
    with connect() as c:
        return [dict(r) for r in c.execute(
            'SELECT * FROM strategy_race_positions WHERE strategy_id=?',
            (strategy_id,)
        ).fetchall()]


def _mark(strategy_id, latest):
    with connect() as c:
        acc = c.execute(
            'SELECT * FROM strategy_race_accounts WHERE strategy_id=?',
            (strategy_id,)
        ).fetchone()
        ps = c.execute(
            'SELECT * FROM strategy_race_positions WHERE strategy_id=?',
            (strategy_id,)
        ).fetchall()

        mv = sum(
            float(p['qty']) * latest.get(p['symbol'], float(p['avg_price']))
            for p in ps
        )
        equity = float(acc['cash']) + mv
        peak = max(float(acc['peak_equity']), equity)
        dd = (peak - equity) / peak if peak > 0 else 0.0

        c.execute(
            '''UPDATE strategy_race_accounts
            SET peak_equity=?,updated_at=CURRENT_TIMESTAMP WHERE strategy_id=?''',
            (peak, strategy_id)
        )
        c.execute(
            '''INSERT INTO strategy_race_equity(strategy_id,equity,drawdown)
            VALUES(?,?,?)''',
            (strategy_id, equity, dd)
        )


def _buy(strategy_id, symbol, price, atr, cfg, latest, reason):
    with connect() as c:
        acc = c.execute(
            'SELECT * FROM strategy_race_accounts WHERE strategy_id=?',
            (strategy_id,)
        ).fetchone()
        ps = c.execute(
            'SELECT * FROM strategy_race_positions WHERE strategy_id=?',
            (strategy_id,)
        ).fetchall()

        if c.execute(
            'SELECT 1 FROM strategy_race_positions WHERE strategy_id=? AND symbol=?',
            (strategy_id, symbol)
        ).fetchone():
            return

        if len(ps) >= settings.effective_max_positions:
            return

        mv = sum(
            float(p['qty']) * latest.get(p['symbol'], float(p['avg_price']))
            for p in ps
        )
        equity = float(acc['cash']) + mv
        gross_limit = equity * min(settings.effective_max_gross_exposure_ratio, 0.80)
        available = max(min(float(acc['cash']), gross_limit - mv), 0.0)
        notional = min(equity * settings.max_symbol_weight, available)

        if notional < 5 or price <= 0:
            return

        qty = notional / price
        stop = price - atr * cfg['atr_stop'] if atr > 0 else None
        take = price + atr * cfg['atr_take'] if atr > 0 else None

        c.execute(
            '''UPDATE strategy_race_accounts
            SET cash=cash-?,updated_at=CURRENT_TIMESTAMP WHERE strategy_id=?''',
            (notional, strategy_id)
        )
        c.execute(
            '''INSERT INTO strategy_race_positions
            (strategy_id,symbol,qty,avg_price,stop_price,take_profit_price)
            VALUES(?,?,?,?,?,?)''',
            (strategy_id, symbol, qty, price, stop, take)
        )
        c.execute(
            '''INSERT INTO strategy_race_trades
            (strategy_id,symbol,side,qty,price,reason)
            VALUES(?,?,?,?,?,?)''',
            (strategy_id, symbol, 'BUY', qty, price, reason)
        )


def _sell(strategy_id, symbol, price, reason):
    with connect() as c:
        p = c.execute(
            '''SELECT * FROM strategy_race_positions
            WHERE strategy_id=? AND symbol=?''',
            (strategy_id, symbol)
        ).fetchone()
        if not p:
            return

        qty = float(p['qty'])
        proceeds = qty * price
        pnl = (price - float(p['avg_price'])) * qty

        c.execute(
            '''UPDATE strategy_race_accounts
            SET cash=cash+?,realized_pnl=realized_pnl+?,updated_at=CURRENT_TIMESTAMP
            WHERE strategy_id=?''',
            (proceeds, pnl, strategy_id)
        )
        c.execute(
            'DELETE FROM strategy_race_positions WHERE strategy_id=? AND symbol=?',
            (strategy_id, symbol)
        )
        c.execute(
            '''INSERT INTO strategy_race_trades
            (strategy_id,symbol,side,qty,price,realized_pnl,reason)
            VALUES(?,?,?,?,?,?,?)''',
            (strategy_id, symbol, 'SELL', qty, price, pnl, reason)
        )


def run_shadow_cycle(frames, latest, current_cfg, account, actual_positions, entry_symbols=None):
    ensure_race_epoch(current_cfg, account, actual_positions, frames)
    entry_symbols = set(entry_symbols or frames.keys())

    for sid in CHALLENGER_IDS:
        cfg = _strategy_cfg(sid)
        if not cfg:
            continue

        ps = {p['symbol']: p for p in _positions(sid)}

        for symbol, p in list(ps.items()):
            px = latest.get(symbol)
            if px is None:
                continue
            if p['stop_price'] is not None and px <= float(p['stop_price']):
                _sell(sid, symbol, px, 'shadow ATR stop')
                ps.pop(symbol, None)
            elif p['take_profit_price'] is not None and px >= float(p['take_profit_price']):
                _sell(sid, symbol, px, 'shadow ATR take')
                ps.pop(symbol, None)

        for symbol, df in frames.items():
            if df is None or df.empty or symbol not in latest:
                continue
            sig = evaluate(df, cfg)
            if sig['signal'] == 'BUY' and symbol not in ps and symbol in entry_symbols:
                _buy(
                    sid, symbol, latest[symbol], float(sig.get('atr') or 0),
                    cfg, latest, sig['reason']
                )
                ps = {p['symbol']: p for p in _positions(sid)}
            elif sig['signal'] == 'SELL' and symbol in ps:
                _sell(sid, symbol, latest[symbol], sig['reason'])
                ps.pop(symbol, None)

        _mark(sid, latest)


def _shadow_summary(strategy_id):
    with connect() as c:
        acc = c.execute(
            'SELECT * FROM strategy_race_accounts WHERE strategy_id=?',
            (strategy_id,)
        ).fetchone()
        cfgrow = c.execute(
            'SELECT * FROM strategy_race_configs WHERE strategy_id=?',
            (strategy_id,)
        ).fetchone()

        if not acc:
            return None

        sells = c.execute(
            '''SELECT realized_pnl FROM strategy_race_trades
            WHERE strategy_id=? AND side='SELL' AND realized_pnl IS NOT NULL''',
            (strategy_id,)
        ).fetchall()
        eq = c.execute(
            '''SELECT equity,drawdown FROM strategy_race_equity
            WHERE strategy_id=? ORDER BY id''',
            (strategy_id,)
        ).fetchall()
        open_positions = c.execute(
            'SELECT COUNT(*) AS n FROM strategy_race_positions WHERE strategy_id=?',
            (strategy_id,)
        ).fetchone()['n']

    pnls = [float(x['realized_pnl']) for x in sells]
    wins = [x for x in pnls if x > 0]
    losses = [x for x in pnls if x < 0]

    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    avg_win = sum(wins) / len(wins) if wins else 0.0
    avg_loss = sum(losses) / len(losses) if losses else 0.0
    avg_loss_abs = abs(avg_loss)

    profit_factor = gross_profit / gross_loss if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0)
    payoff_ratio = avg_win / avg_loss_abs if avg_loss_abs > 0 else (999.0 if avg_win > 0 else 0.0)
    expectancy = sum(pnls) / len(pnls) if pnls else 0.0
    denom = avg_win + avg_loss_abs
    breakeven_win_rate = avg_loss_abs / denom if denom > 0 else None

    start = float(acc['starting_equity'])
    current_equity = float(eq[-1]['equity']) if eq else float(acc['cash'])
    max_drawdown = max([float(x['drawdown']) for x in eq], default=0.0)

    return {
        'strategy_id': strategy_id,
        'name': acc['name'],
        'role': 'SHADOW',
        'source': 'LOCAL SHADOW',
        'equity': current_equity,
        'pnl': current_equity - start,
        'return': (current_equity / start - 1.0) if start else 0.0,
        'trades': len(pnls),
        'wins': len(wins),
        'losses': len(losses),
        'win_rate': len(wins) / len(pnls) if pnls else None,
        'avg_win': avg_win,
        'avg_loss': avg_loss,
        'payoff_ratio': payoff_ratio,
        'profit_factor': profit_factor,
        'expectancy': expectancy,
        'breakeven_win_rate': breakeven_win_rate,
        'max_drawdown': max_drawdown,
        'open_positions': open_positions,
        'config': json.loads(cfgrow['config_json']) if cfgrow else {},
        'reason': cfgrow['generated_reason'] if cfgrow else '',
    }


def race_summary(champion_metrics, current_cfg, champion_open_positions):
    info = race_epoch_info()

    champion = {
        'strategy_id': 'champion',
        'name': 'Champion',
        'role': 'LIVE PAPER',
        'source': 'ALPACA PAPER',
        'equity': champion_metrics['current_equity'],
        'pnl': champion_metrics['pnl'],
        'return': champion_metrics['total_return'],
        'trades': champion_metrics['trades_closed'],
        'wins': champion_metrics['wins'],
        'losses': champion_metrics['losses'],
        'win_rate': champion_metrics['win_rate'],
        'avg_win': champion_metrics['avg_win'],
        'avg_loss': champion_metrics['avg_loss'],
        'payoff_ratio': champion_metrics['payoff_ratio'],
        'profit_factor': champion_metrics['profit_factor'],
        'expectancy': champion_metrics['expectancy'],
        'breakeven_win_rate': champion_metrics['breakeven_win_rate'],
        'max_drawdown': champion_metrics['max_drawdown'],
        'open_positions': champion_open_positions,
        'config': current_cfg,
        'reason': 'Actual Alpaca Paper account. Not a local shadow simulation.',
    }

    items = [champion]
    for sid in CHALLENGER_IDS:
        row = _shadow_summary(sid)
        if row:
            items.append(row)

    # Race maturity:
    #   0 closes  -> UNRATED
    #   1-4       -> LOW SAMPLE (never receives the leader star)
    #   5+        -> RATED
    # A leader must also be economically positive: Return > 0, PF > 1,
    # Expectancy > 0. A strategy is not a "leader" merely because it loses least.
    rated = [x for x in items if int(x.get('trades') or 0) >= 5]
    low_sample = [x for x in items if 1 <= int(x.get('trades') or 0) < 5]
    unrated = [x for x in items if int(x.get('trades') or 0) <= 0]

    score_key = lambda x: (
        float(x.get('return') or 0),
        float(x.get('expectancy') or 0),
        float(x.get('profit_factor') or 0),
    )
    rated.sort(key=score_key, reverse=True)
    low_sample.sort(key=score_key, reverse=True)
    unrated.sort(key=lambda x: 0 if x.get('strategy_id') == 'champion' else 1)

    qualified = [
        x for x in rated
        if float(x.get('return') or 0) > 0
        and float(x.get('profit_factor') or 0) > 1.0
        and float(x.get('expectancy') or 0) > 0
    ]
    qualified_id = qualified[0]['strategy_id'] if qualified else None

    for idx, item in enumerate(rated, 1):
        item['rank'] = idx
        item['leader'] = item['strategy_id'] == qualified_id
        item['rated'] = True
        item['leader_qualified'] = item['leader']
        item['rating_label'] = 'RATED' if score_key(item)[0] >= 0 else 'RATED / NEGATIVE'

    for item in low_sample:
        item['rank'] = None
        item['leader'] = False
        item['rated'] = False
        item['leader_qualified'] = False
        item['rating_label'] = 'LOW SAMPLE'

    for item in unrated:
        item['rank'] = None
        item['leader'] = False
        item['rated'] = False
        item['leader_qualified'] = False
        item['rating_label'] = 'UNRATED'

    ordered = rated + low_sample + unrated
    return {
        'epoch': info,
        'leader_strategy_id': qualified_id,
        'leader_status': 'QUALIFIED' if qualified_id else 'NO QUALIFIED LEADER',
        'leader_rule': '5+ closes AND return>0 AND PF>1 AND expectancy>0',
        'items': ordered,
    }