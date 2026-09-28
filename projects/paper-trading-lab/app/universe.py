from datetime import datetime, timezone, timedelta
import json

from .alpaca import get_crypto_assets
from .config import settings
from .db import connect, meta_get, meta_set
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


def _env_blacklist():
    out = set()
    for raw in str(settings.crypto_blacklist or '').split(','):
        raw = raw.strip()
        if raw:
            out.add(canonical_symbol(raw))
    return out


def list_blacklist():
    rows = []
    seen = set()
    for symbol in sorted(_env_blacklist()):
        rows.append({
            'symbol': symbol,
            'source': 'env',
            'reason': 'CRYPTO_BLACKLIST in .env',
            'active': True,
            'removable': False,
        })
        seen.add(symbol)

    with connect() as c:
        dbrows = [dict(r) for r in c.execute(
            'SELECT symbol,source,reason,active,created_at,updated_at '
            'FROM crypto_blacklist WHERE active=1 ORDER BY symbol'
        )]

    for row in dbrows:
        symbol = canonical_symbol(row['symbol'])
        if symbol in seen:
            continue
        rows.append({
            **row,
            'symbol': symbol,
            'active': bool(row.get('active')),
            'removable': True,
        })
        seen.add(symbol)
    return rows


def blacklist_set():
    return {x['symbol'] for x in list_blacklist() if x.get('active')}


def add_blacklist(symbol, source='manual', reason=''):
    symbol = canonical_symbol(symbol)
    if not symbol or '/' not in symbol:
        raise ValueError('Crypto symbol must look like BTC/USD')
    source = str(source or 'manual').lower().strip()
    if source not in {'manual', 'ai'}:
        source = 'manual'
    reason = str(reason or '').strip()[:500]

    with connect() as c:
        c.execute(
            """INSERT INTO crypto_blacklist(symbol,source,reason,active)
               VALUES(?,?,?,1)
               ON CONFLICT(symbol) DO UPDATE SET
                 source=excluded.source,reason=excluded.reason,active=1,
                 updated_at=CURRENT_TIMESTAMP""",
            (symbol, source, reason),
        )
    return symbol


def remove_blacklist(symbol):
    symbol = canonical_symbol(symbol)
    if symbol in _env_blacklist():
        raise ValueError('This symbol is locked by CRYPTO_BLACKLIST in .env')
    with connect() as c:
        c.execute(
            'UPDATE crypto_blacklist SET active=0,updated_at=CURRENT_TIMESTAMP WHERE symbol=?',
            (symbol,),
        )
    return symbol


def cached_tradable_symbols(include_blacklisted=False):
    if not settings.is_crypto or not settings.crypto_universe_auto:
        base = list(settings.symbol_list)
    else:
        with connect() as c:
            base = [r['symbol'] for r in c.execute(
                'SELECT symbol FROM crypto_universe '
                'WHERE tradable=1 AND status=? ORDER BY symbol',
                ('active',),
            )]
        if not base:
            base = list(settings.symbol_list)

    base = [canonical_symbol(x) for x in base]
    if include_blacklisted:
        return sorted(set(base))
    blocked = blacklist_set()
    return sorted({x for x in base if x not in blocked})


def universe_snapshot():
    all_symbols = cached_tradable_symbols(include_blacklisted=True)
    blocked_rows = list_blacklist()
    blocked = {x['symbol'] for x in blocked_rows}
    active = [s for s in all_symbols if s not in blocked]
    return {
        'auto': bool(settings.crypto_universe_auto),
        'all_tradable_count': len(all_symbols),
        'active_count': len(active),
        'blacklist_count': len(blocked_rows),
        'active_symbols': active,
        'blacklist': blocked_rows,
        'last_refresh_utc': meta_get('crypto_universe_last_refresh'),
    }


async def refresh_universe(force=False):
    if not settings.is_crypto or not settings.crypto_universe_auto:
        return cached_tradable_symbols()

    last = _parse_iso(meta_get('crypto_universe_last_refresh'))
    max_age = timedelta(minutes=max(int(settings.crypto_universe_refresh_minutes), 1))
    if not force and last and (_utcnow() - last) < max_age:
        cached = cached_tradable_symbols()
        if cached:
            return cached

    try:
        assets = await get_crypto_assets()
    except Exception:
        # Do not stop trading just because universe discovery temporarily fails.
        # Use the last cached universe (or the legacy fixed list on first boot).
        cached = cached_tradable_symbols()
        if cached:
            return cached
        raise

    seen = []
    with connect() as c:
        # Assets missing from the latest active/tradable snapshot must not linger.
        c.execute("UPDATE crypto_universe SET tradable=0,status='stale'")
        for a in assets:
            status = str(a.get('status') or '').lower()
            tradable = bool(a.get('tradable', False))
            symbol = canonical_symbol(a.get('symbol'))
            if not symbol or '/' not in symbol:
                continue
            c.execute(
                """INSERT INTO crypto_universe(symbol,name,status,tradable,raw_json,last_seen_at)
                   VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
                   ON CONFLICT(symbol) DO UPDATE SET
                     name=excluded.name,status=excluded.status,tradable=excluded.tradable,
                     raw_json=excluded.raw_json,last_seen_at=CURRENT_TIMESTAMP""",
                (
                    symbol,
                    str(a.get('name') or ''),
                    status,
                    1 if tradable else 0,
                    json.dumps(a, ensure_ascii=False, default=str),
                ),
            )
            if status == 'active' and tradable:
                seen.append(symbol)

    meta_set('crypto_universe_last_refresh', _utcnow().isoformat())
    meta_set('crypto_universe_last_count', len(seen))
    return cached_tradable_symbols()