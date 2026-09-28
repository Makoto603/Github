from datetime import datetime, timezone, timedelta
import json
import math

from .config import settings
from .db import meta_get, meta_set
from .symbols import canonical_symbol


def _utcnow():
    return datetime.now(timezone.utc)


def _parse_iso(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def _decode_rows(raw):
    if not raw:
        return []
    try:
        rows = json.loads(raw)
        return rows if isinstance(rows, list) else []
    except Exception:
        return []


def prescan_due():
    last = _parse_iso(meta_get('crypto_prescan_last_refresh'))
    ttl = timedelta(minutes=max(int(settings.crypto_prescan_refresh_minutes), 1))
    return not last or (_utcnow() - last) >= ttl


def cached_prescan_rows():
    rows = _decode_rows(meta_get('crypto_prescan_rows'))
    out = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        symbol = canonical_symbol(row.get('symbol'))
        if not symbol or '/' not in symbol:
            continue
        out.append({**row, 'symbol': symbol})
    return out


def cached_prescan_symbols(fallback=None):
    rows = cached_prescan_rows()
    if rows:
        return [x['symbol'] for x in rows]
    fallback = fallback or []
    limit = max(int(settings.crypto_prescan_limit), 1)
    return list(dict.fromkeys(canonical_symbol(x) for x in fallback if x))[:limit]


def _rough_metrics(bar):
    o = float(bar.get('open') or 0)
    h = float(bar.get('high') or 0)
    l = float(bar.get('low') or 0)
    c = float(bar.get('close') or 0)
    v = float(bar.get('volume') or 0)
    if min(o, h, l, c) <= 0:
        return None

    change_pct = ((c / o) - 1.0) * 100.0
    range_pct = ((h - l) / o) * 100.0
    notional = max(c * v, 0.0)

    # Lightweight score only. It chooses what receives full 1-minute EMA/RSI/ATR
    # evaluation; it never bypasses the actual strategy or risk locks.
    movement = min(abs(change_pct) * 18.0 + range_pct * 10.0, 70.0)
    liquidity = min(max(math.log10(notional + 1.0) - 2.0, 0.0) * 7.5, 30.0)
    upward_bonus = min(max(change_pct, 0.0) * 2.0, 5.0)
    score = min(movement + liquidity + upward_bonus, 100.0)

    return {
        'change_pct': change_pct,
        'range_pct': range_pct,
        'notional_volume': notional,
        'prescan_score': score,
        'price': c,
    }


def update_prescan(latest_bars, universe_symbols):
    universe = {canonical_symbol(s) for s in universe_symbols}
    candidates = []
    for symbol, bar in (latest_bars or {}).items():
        cs = canonical_symbol(symbol)
        if cs not in universe:
            continue
        m = _rough_metrics(bar)
        if not m:
            continue
        candidates.append({'symbol': cs, **m})

    limit = max(int(settings.crypto_prescan_limit), 1)
    if not candidates:
        # Preserve the last good list on a transient data failure.
        old = cached_prescan_rows()
        if old:
            return old
        rows = [{'symbol': s, 'prescan_score': 0.0} for s in sorted(universe)[:limit]]
    else:
        # A blended shortlist prevents BTC/ETH-style liquidity dominance from
        # crowding out smaller coins that are actually moving now.
        by_move = sorted(
            candidates,
            key=lambda x: (abs(float(x['change_pct'])), float(x['range_pct'])),
            reverse=True,
        )
        by_liquidity = sorted(
            candidates,
            key=lambda x: float(x['notional_volume']),
            reverse=True,
        )
        by_score = sorted(
            candidates,
            key=lambda x: float(x['prescan_score']),
            reverse=True,
        )

        selected = []
        seen = set()
        movement_quota = max(1, limit // 2)
        liquidity_quota = max(1, limit // 4)

        for row in by_move[:movement_quota]:
            if row['symbol'] not in seen:
                selected.append(row); seen.add(row['symbol'])
        for row in by_liquidity[:liquidity_quota]:
            if len(selected) >= limit:
                break
            if row['symbol'] not in seen:
                selected.append(row); seen.add(row['symbol'])
        for row in by_score:
            if len(selected) >= limit:
                break
            if row['symbol'] not in seen:
                selected.append(row); seen.add(row['symbol'])

        rows = sorted(selected, key=lambda x: float(x.get('prescan_score', 0)), reverse=True)

    meta_set('crypto_prescan_rows', json.dumps(rows, ensure_ascii=False))
    meta_set('crypto_prescan_last_refresh', _utcnow().isoformat())
    meta_set('crypto_prescan_count', len(rows))
    return rows


def prescan_snapshot():
    rows = cached_prescan_rows()
    return {
        'refresh_minutes': int(settings.crypto_prescan_refresh_minutes),
        'limit': int(settings.crypto_prescan_limit),
        'candidate_count': len(rows),
        'last_refresh_utc': meta_get('crypto_prescan_last_refresh'),
        'symbols': [x['symbol'] for x in rows],
        'rows': rows,
    }