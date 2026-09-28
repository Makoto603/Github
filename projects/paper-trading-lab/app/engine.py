import uuid
import json
import pandas as pd
from .market import build_provider
from .config import settings
from .db import connect, meta_get, meta_set
from .reviewer import current_config, current_config_audit
from .strategy import evaluate
from .race import run_shadow_cycle
from .scanner import rank_markets
from .prescan import prescan_due, cached_prescan_symbols, update_prescan, prescan_snapshot
from .symbols import canonical_symbol
from .universe import refresh_universe, cached_tradable_symbols
from .alpaca import (
    get_account, get_positions, get_orders,
    submit_market_buy, submit_market_sell,
)

provider = build_provider()
backfill_done = False


def frame(symbol, limit=420):
    with connect() as c:
        rows = [dict(r) for r in c.execute(
            'SELECT ts,open,high,low,close,volume FROM prices '
            'WHERE symbol=? ORDER BY ts DESC LIMIT ?', (symbol, limit)
        )]
    return pd.DataFrame(list(reversed(rows)))


def _store_bars(bars):
    with connect() as c:
        for b in bars:
            c.execute(
                'INSERT OR REPLACE INTO prices(symbol,ts,open,high,low,close,volume) '
                'VALUES(?,?,?,?,?,?,?)',
                (b['symbol'], b['ts'], b['open'], b['high'], b['low'], b['close'], b['volume']),
            )



def _history_counts(symbols):
    symbols = list(dict.fromkeys(canonical_symbol(s) for s in symbols if s))
    if not symbols:
        return {}

    qs = ','.join('?' for _ in symbols)
    sql = (
        'SELECT symbol,COUNT(*) AS n '
        'FROM prices '
        f'WHERE symbol IN ({qs}) '
        'GROUP BY symbol'
    )
    with connect() as c:
        rows = c.execute(sql, tuple(symbols)).fetchall()

    counts = {canonical_symbol(r['symbol']): int(r['n']) for r in rows}
    for symbol in symbols:
        counts.setdefault(symbol, 0)
    return counts


def universe_recorder_snapshot():
    raw = meta_get('crypto_universe_recorder_snapshot')
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            pass
    return {
        'enabled': bool(settings.crypto_record_all_universe),
        'universe_count': 0,
        'latest_recorded_count': 0,
        'covered_360_count': 0,
        'min_bars': 0,
        'last_cycle_utc': None,
        'last_error': None,
    }


def _save_recorder_snapshot(symbols, latest_count=0, error=None):
    counts = _history_counts(symbols)
    minimum = min(counts.values()) if counts else 0
    required = max(
        int(settings.crypto_recorder_min_history_bars),
        int(settings.historical_bars),
        360,
    )
    covered = sum(1 for n in counts.values() if int(n) >= required)

    snap = {
        'enabled': bool(settings.crypto_record_all_universe),
        'universe_count': len(counts),
        'latest_recorded_count': int(latest_count),
        'covered_360_count': int(covered),
        'required_history_bars': int(required),
        'min_bars': int(minimum),
        'last_cycle_utc': pd.Timestamp.utcnow().isoformat(),
        'last_error': str(error) if error else None,
    }
    meta_set(
        'crypto_universe_recorder_snapshot',
        json.dumps(snap, ensure_ascii=False),
    )
    return snap


async def _bootstrap_universe_history(symbols, exclude=None):
    # Gradually fill full-Universe history without a startup request storm.
    if not settings.crypto_record_all_universe:
        return {'attempted': 0, 'filled': 0}

    exclude = {canonical_symbol(x) for x in (exclude or [])}
    symbols = [
        canonical_symbol(s)
        for s in symbols
        if s and canonical_symbol(s) not in exclude
    ]
    symbols = list(dict.fromkeys(symbols))
    if not symbols:
        return {'attempted': 0, 'filled': 0}

    required = max(
        int(settings.crypto_recorder_min_history_bars),
        int(settings.historical_bars),
        360,
    )
    counts = _history_counts(symbols)
    needs = [s for s in symbols if int(counts.get(s, 0)) < required]

    per_cycle = max(int(settings.crypto_recorder_bootstrap_per_cycle), 1)
    batch = needs[:per_cycle]
    if not batch:
        return {'attempted': 0, 'filled': 0}

    filled = 0
    try:
        if hasattr(provider, 'historical_bars_batch'):
            payload = await provider.historical_bars_batch(batch, required)
            for symbol, bars in payload.items():
                if bars:
                    _store_bars(bars)
                    filled += 1
        else:
            for symbol in batch:
                try:
                    bars = await provider.historical_bars(symbol, required)
                    if bars:
                        _store_bars(bars)
                        filled += 1
                except Exception:
                    continue
    except Exception:
        return {'attempted': len(batch), 'filled': filled}

    return {'attempted': len(batch), 'filled': filled}


async def ensure_history(symbols=None):
    """Backfill enough one-minute history for the current dynamic universe.

    v3 needs enough local 1m bars to build CLOSED 5m/15m/30m filters without
    making additional higher-timeframe Alpaca requests.
    """
    if symbols is None:
        symbols = await refresh_universe()
    symbols = list(dict.fromkeys(symbols))
    result = {}
    needs = []
    required_bars = max(int(settings.historical_bars), 360)

    for symbol in symbols:
        with connect() as c:
            count = c.execute(
                'SELECT COUNT(*) AS n FROM prices WHERE symbol=?', (symbol,)
            ).fetchone()['n']
        if int(count) < required_bars:
            needs.append(symbol)
        else:
            result[symbol] = int(count)

    if needs:
        if hasattr(provider, 'historical_bars_batch'):
            try:
                batches = await provider.historical_bars_batch(needs, required_bars)
                for symbol, bars in batches.items():
                    if bars:
                        _store_bars(bars)
            except Exception:
                for symbol in needs:
                    try:
                        bars = await provider.historical_bars(symbol, required_bars)
                        _store_bars(bars)
                    except Exception as e:
                        result[symbol] = f'ERROR: {e}'
        else:
            for symbol in needs:
                try:
                    bars = await provider.historical_bars(symbol, required_bars)
                    _store_bars(bars)
                except Exception as e:
                    result[symbol] = f'ERROR: {e}'

    for symbol in symbols:
        if symbol in result and isinstance(result[symbol], str):
            continue
        with connect() as c:
            result[symbol] = c.execute(
                'SELECT COUNT(*) AS n FROM prices WHERE symbol=?', (symbol,)
            ).fetchone()['n']

    return {
        'ok': all(isinstance(v, int) and v >= 30 for v in result.values()),
        'counts': result,
        'universe_count': len(symbols),
    }


def _record_account(account):
    equity = float(account.get('equity', 0) or 0)
    cash = float(account.get('cash', 0) or 0)

    if not meta_get('alpaca_starting_equity') and equity > 0:
        meta_set('alpaca_starting_equity', equity)

    peak = float(meta_get('alpaca_peak_equity', equity) or equity)
    peak = max(peak, equity)
    meta_set('alpaca_peak_equity', peak)

    dd = (peak - equity) / peak if peak > 0 else 0.0

    with connect() as c:
        c.execute(
            'INSERT INTO equity_history(equity,cash,drawdown) VALUES(?,?,?)',
            (equity, cash, dd),
        )
    return dd


def _sync_filled_orders(orders):
    with connect() as c:
        for o in orders:
            if o.get('status') != 'filled' or not o.get('filled_at'):
                continue

            qty = float(o.get('filled_qty') or 0)
            px = float(o.get('filled_avg_price') or 0)
            if qty <= 0 or px <= 0:
                continue

            c.execute(
                'INSERT OR IGNORE INTO alpaca_fills'
                '(order_id,filled_at,symbol,side,qty,price) '
                'VALUES(?,?,?,?,?,?)',
                (o['id'], o['filled_at'], o['symbol'], o['side'], qty, px),
            )


def _long_market_value(positions):
    """Long positions only. Shorts are not counted as available capacity."""
    total = 0.0
    for p in positions:
        qty = float(p.get('qty') or 0)
        mv = float(p.get('market_value') or 0)
        if qty > 0:
            total += max(mv, 0.0)
    return total


def _pending_buy_notional(open_orders):
    total = 0.0
    for o in open_orders:
        if str(o.get('side', '')).lower() != 'buy':
            continue
        if o.get('notional'):
            total += float(o['notional'])
        elif o.get('qty') and o.get('limit_price'):
            total += float(o['qty']) * float(o['limit_price'])
    return total


def _risk_budget(account, positions, open_orders):
    """
    HARD LEVERAGE LOCK.

    Buying Power is deliberately ignored.
    New buy capacity is bounded by BOTH:
      1) actual positive cash
      2) equity - current gross long exposure - pending buys

    Therefore the BOT itself cannot create gross long exposure above equity.
    """
    equity = max(float(account.get('equity', 0) or 0), 0.0)
    cash = max(float(account.get('cash', 0) or 0), 0.0)

    gross_long = _long_market_value(positions)
    pending_buys = _pending_buy_notional(open_orders)

    gross_limit = equity * min(settings.effective_max_gross_exposure_ratio, 0.80)
    gross_capacity = max(gross_limit - gross_long - pending_buys, 0.0)

    available = max(min(cash, gross_capacity), 0.0)

    return {
        'equity': equity,
        'cash': cash,
        'gross_long': gross_long,
        'pending_buys': pending_buys,
        'gross_limit': gross_limit,
        'available_for_new_buys': available,
        'buying_power_ignored': True,
        'leverage_enabled': False,
        'shorting_enabled': False,
    }



def _save_order_context(order, symbol, side, reason, signal):
    oid = order.get('id') if isinstance(order, dict) else None
    if not oid:
        return

    audit = current_config_audit()
    payload = {
        **(signal or {}),
        'strategy_config': audit.get('config'),
        'strategy_config_version': audit.get('config_version'),
        'strategy_config_source': audit.get('source'),
        'strategy_architecture_version': audit.get('architecture_version'),
    }

    with connect() as c:
        c.execute(
            'INSERT OR REPLACE INTO bot_order_context(order_id,symbol,side,reason,signal_json) VALUES(?,?,?,?,?)',
            (
                oid,
                canonical_symbol(symbol),
                side,
                reason,
                json.dumps(payload, default=str),
            )
        )

def _position_exit_state(symbol, position, sig, px, cfg):
    """Persistent ATR levels for actual Alpaca Paper positions."""
    entry = float(position.get('avg_entry_price') or px)
    atr_now = float(sig.get('atr') or 0)

    with connect() as c:
        row = c.execute(
            'SELECT * FROM champion_position_state WHERE symbol=?',
            (symbol,)
        ).fetchone()

        if not row:
            stop = entry - atr_now * float(cfg['atr_stop'])
            take = entry + atr_now * float(cfg['atr_take'])
            c.execute(
                'INSERT OR REPLACE INTO champion_position_state(symbol,entry_price,entry_atr,stop_price,take_profit_price) VALUES(?,?,?,?,?)',
                (symbol, entry, atr_now, stop, take)
            )
            row = {
                'entry_price': entry,
                'entry_atr': atr_now,
                'stop_price': stop,
                'take_profit_price': take
            }
        else:
            row = dict(row)

    if px <= float(row['stop_price']):
        return 'ATR_STOP', f'ATR stop: {px:.8g} <= {float(row["stop_price"]):.8g}'
    if px >= float(row['take_profit_price']):
        return 'ATR_TAKE', f'ATR take: {px:.8g} >= {float(row["take_profit_price"]):.8g}'
    if sig.get('signal') == 'SELL':
        return sig.get('exit_reason', 'STRATEGY_EXIT'), sig.get('reason', 'strategy exit')

    return None, None

def _cleanup_position_states(held_symbols):
    with connect() as c:
        if held_symbols:
            qs = ','.join('?' for _ in held_symbols)
            c.execute(
                f'DELETE FROM champion_position_state WHERE symbol NOT IN ({qs})',
                tuple(held_symbols)
            )
        else:
            c.execute('DELETE FROM champion_position_state')


async def run_cycle():
    # Layer 1: tradable Universe refresh (slow-changing membership, default 15m).
    # entry_universe excludes Blacklist from new-entry discovery.
    entry_universe = await refresh_universe()

    # Recorder includes Blacklisted symbols too. Blacklist blocks trading,
    # not historical evidence collection.
    recording_universe = (
        cached_tradable_symbols(include_blacklisted=True)
        if settings.crypto_record_all_universe
        else list(entry_universe)
    )

    account = await get_account()
    positions = await get_positions()
    open_orders = await get_orders('open', 100)
    all_orders = await get_orders('all', 500)

    held_symbols = {
        canonical_symbol(p.get('symbol'))
        for p in positions
        if float(p.get('qty') or 0) > 0
    }

    # v0.29.4: record one latest 1m bar for every tradable symbol on every
    # normal BOT cycle. Provider batching keeps this to a few requests, not
    # one request per coin.
    broad_bars = {}
    recorder_error = None
    if recording_universe:
        try:
            broad_bars = await provider.latest_bars(recording_universe)
            if broad_bars:
                _store_bars(list(broad_bars.values()))
        except Exception as e:
            recorder_error = e
            broad_bars = {}

    # Layer 2: 5-minute Pre-scan reuses the already-recorded all-Universe bars.
    if prescan_due() or not cached_prescan_symbols():
        active_set = set(entry_universe)
        update_prescan(
            {s: b for s, b in broad_bars.items() if s in active_set},
            entry_universe,
        )

    detailed_entries = cached_prescan_symbols(entry_universe)

    # Held positions are always evaluated every minute, even if they leave the
    # shortlist or are blacklisted later.
    cycle_symbols = sorted(set(detailed_entries) | held_symbols)

    # Detailed/held symbols get full history immediately.
    await ensure_history(cycle_symbols)

    # Remaining Universe history is filled gradually in small batches.
    await _bootstrap_universe_history(
        recording_universe,
        exclude=set(cycle_symbols),
    )

    # The broad fetch normally contains all detail symbols. Recover only any
    # symbols missing from a partial provider response.
    bars = {s: b for s, b in broad_bars.items() if s in cycle_symbols}
    missing = [s for s in cycle_symbols if s not in bars]
    if missing:
        try:
            detail_bars = await provider.latest_bars(missing)
            bars.update(detail_bars)
            if detail_bars:
                _store_bars(list(detail_bars.values()))
        except Exception:
            pass

    recorder = _save_recorder_snapshot(
        recording_universe,
        latest_count=len(broad_bars),
        error=recorder_error,
    )

    _sync_filled_orders(all_orders)
    dd = _record_account(account)

    held = {canonical_symbol(p['symbol']): {**p, 'symbol': canonical_symbol(p['symbol'])} for p in positions}
    _cleanup_position_states(set(held.keys()))
    pending_symbols = {canonical_symbol(o['symbol']) for o in open_orders}
    cfg = current_config()
    events = []

    risk = _risk_budget(account, positions, open_orders)

    if settings.leverage_enabled:
        raise RuntimeError('Safety lock violation: LEVERAGE_ENABLED must remain false')
    if settings.shorting_enabled:
        raise RuntimeError('Safety lock violation: SHORTING_ENABLED must remain false')
    if settings.effective_max_gross_exposure_ratio > 1.0:
        raise RuntimeError('Safety lock violation: MAX_GROSS_EXPOSURE_RATIO cannot exceed 1.0')

    frames_for_race = {s: frame(s) for s in cycle_symbols if s in bars}
    if float(account.get('equity', 0) or 0) > 0:
        run_shadow_cycle(
            frames_for_race,
            {s: float(b['close']) for s, b in bars.items()},
            cfg,
            account,
            positions,
            entry_symbols=set(detailed_entries),
        )

    # Crypto experiment runs 24/7. There is intentionally no equity-market clock gate.
    market_open = True

    # Rank all markets first. This avoids "first symbol wins" behavior.
    all_frames = {s: frame(s) for s in cycle_symbols if s in bars}
    ranked = rank_markets(all_frames, cfg, held.keys())

    # Existing positions are still evaluated for exits. New entries are considered
    # in Opportunity Score order and hard-capped at 8 positions / 80% gross exposure.
    for row in ranked:
        s = row["symbol"]
        if s not in bars or s in pending_symbols:
            continue

        sig = evaluate(all_frames[s], cfg)

        if sig['signal'] == 'BUY' and s not in held:
            if s not in set(detailed_entries):
                continue
            if len([p for p in held.values() if float(p.get('qty', 0) or 0) > 0]) >= settings.effective_max_positions:
                continue
            if dd >= settings.max_drawdown_stop:
                continue

            risk = _risk_budget(account, list(held.values()), open_orders)
            available = risk['available_for_new_buys']
            per_symbol_cap = risk['equity'] * settings.max_symbol_weight
            notional = min(per_symbol_cap, available)

            if notional < 5:
                continue

            oid = 'ptl-' + uuid.uuid4().hex[:24]
            try:
                o = await submit_market_buy(s, notional, oid)
                _save_order_context(o, s, 'buy', 'ENTRY', sig)
                events.append({
                    'symbol': s,
                    'action': 'BUY',
                    'order_id': o.get('id'),
                    'status': o.get('status'),
                    'notional': notional,
                    'score': row['score'],
                    'reason': sig['reason'],
                    'risk_rule': 'top-ranked + cash/equity only; buying_power ignored',
                })

                account = dict(account)
                account['cash'] = str(max(float(account.get('cash', 0) or 0) - notional, 0))
                held[s] = {'symbol': s, 'qty': 0.000001, 'market_value': str(notional)}
                open_orders = list(open_orders) + [{'symbol': s, 'side': 'buy', 'notional': str(notional)}]
            except Exception as e:
                events.append({'symbol': s, 'action': 'BUY', 'error': str(e)})

        elif s in held:
            qty = float(held[s].get('qty') or 0)
            if qty <= 0:
                continue

            px = float(bars[s]['close'])
            exit_reason, exit_detail = _position_exit_state(
                s, held[s], sig, px, cfg
            )
            if not exit_reason:
                continue

            oid = 'ptl-' + uuid.uuid4().hex[:24]
            try:
                o = await submit_market_sell(s, qty, oid)
                _save_order_context(
                    o, s, 'sell', exit_reason,
                    {**sig, 'exit_detail': exit_detail}
                )
                events.append({
                    'symbol': s,
                    'action': 'SELL',
                    'order_id': o.get('id'),
                    'status': o.get('status'),
                    'score': row['score'],
                    'reason': exit_reason,
                    'detail': exit_detail,
                })
            except Exception as e:
                events.append({
                    'symbol': s,
                    'action': 'SELL',
                    'error': str(e),
                })

    return {
        'ok': True,
        'market_open': True,
        'market_mode': 'CRYPTO_24_7' if settings.is_crypto else 'ALWAYS_ON',
        'account': account,
        'positions': positions,
        'events': events,
        'universe_count': len(entry_universe),
        'recording_universe_count': len(recording_universe),
        'detailed_candidate_count': len(detailed_entries),
        'prescan': prescan_snapshot(),
        'recorder': recorder,
        'risk': _risk_budget(account, positions, open_orders),
    }