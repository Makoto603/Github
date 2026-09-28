import asyncio
import time
from datetime import datetime, timezone

import httpx

from .config import settings

# Safety invariant: this project is PAPER only.
# There is intentionally no live trading base URL anywhere in this module.
PAPER_BASE = 'https://paper-api.alpaca.markets'
DATA_BASE = 'https://data.alpaca.markets'

_cache = {}
_locks = {}
_stats = {
    'cache_hits': 0,
    'network_requests': 0,
    'stale_served': 0,
    'rate_limit_events': 0,
}
_rate_limit_until = 0.0
_rate_limit_strikes = 0
_last_429_at = None
_last_network_error = None


class AlpacaRateLimitError(RuntimeError):
    pass


def headers():
    return {
        'APCA-API-KEY-ID': settings.alpaca_api_key,
        'APCA-API-SECRET-KEY': settings.alpaca_secret_key,
    }


def _check_keys():
    bad = {'', 'YOUR_PAPER_KEY', 'YOUR_PAPER_SECRET'}
    if settings.alpaca_api_key in bad or settings.alpaca_secret_key in bad:
        raise RuntimeError('Alpaca Paper API key/secret is not configured in .env')


def _lock_for(key):
    # All Alpaca calls now run on the FastAPI/background event loop.
    # Creating the lock lazily avoids binding it before the loop exists.
    lock = _locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _locks[key] = lock
    return lock


def _cache_age(key):
    row = _cache.get(key)
    if not row:
        return None
    return max(time.monotonic() - row['at'], 0.0)


def _fresh(key, ttl=None):
    row = _cache.get(key)
    if not row:
        return None
    ttl = float(
        settings.alpaca_snapshot_ttl_seconds
        if ttl is None else ttl
    )
    if time.monotonic() - row['at'] <= ttl:
        return row['value']
    return None


def _stale(key):
    row = _cache.get(key)
    if not row:
        return None
    max_age = float(settings.alpaca_stale_if_error_seconds)
    if time.monotonic() - row['at'] <= max_age:
        return row['value']
    return None


def _store(key, value):
    _cache[key] = {
        'value': value,
        'at': time.monotonic(),
        'wall_time': datetime.now(timezone.utc).isoformat(),
    }
    return value


def invalidate_trading_snapshot():
    """Invalidate account/position/order reads after an order mutation."""
    for key in list(_cache.keys()):
        if (
            key == 'account'
            or key == 'positions'
            or key.startswith('orders:')
        ):
            _cache.pop(key, None)


def _retry_after_seconds(response):
    raw = response.headers.get('Retry-After')
    if raw:
        try:
            return max(float(raw), 1.0)
        except Exception:
            pass

    # Conservative local backoff. Repeated 429s progressively increase it.
    base = max(float(settings.alpaca_rate_limit_backoff_seconds), 5.0)
    return min(base * (2 ** max(_rate_limit_strikes - 1, 0)), 60.0)


def _mark_429(response):
    global _rate_limit_until, _rate_limit_strikes, _last_429_at
    _rate_limit_strikes += 1
    wait = _retry_after_seconds(response)
    _rate_limit_until = max(_rate_limit_until, time.monotonic() + wait)
    _last_429_at = datetime.now(timezone.utc).isoformat()
    _stats['rate_limit_events'] += 1
    return wait


def _mark_success():
    global _rate_limit_strikes, _last_network_error
    _rate_limit_strikes = 0
    _last_network_error = None


async def _network_get(path, *, params=None):
    global _last_network_error
    _check_keys()
    _stats['network_requests'] += 1

    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(PAPER_BASE + path, headers=headers(), params=params)
    except Exception as e:
        _last_network_error = str(e)
        raise

    if r.status_code == 429:
        wait = _mark_429(r)
        raise AlpacaRateLimitError(
            f'Alpaca rate limited requests (HTTP 429). Backing off for about {wait:.0f}s.'
        )

    try:
        r.raise_for_status()
    except Exception as e:
        _last_network_error = str(e)
        raise

    _mark_success()
    return r.json()


async def _cached_get(key, path, *, params=None, ttl=None, force=False):
    # Fast path: all dashboard endpoints share the same short-lived snapshot.
    if not force:
        value = _fresh(key, ttl)
        if value is not None:
            _stats['cache_hits'] += 1
            return value

    now = time.monotonic()

    # During a rate-limit backoff never hammer Alpaca. Keep the UI alive from
    # the last good snapshot when possible.
    if not force and now < _rate_limit_until:
        value = _stale(key)
        if value is not None:
            _stats['stale_served'] += 1
            return value
        raise AlpacaRateLimitError(
            f'Alpaca rate-limit backoff active for {_rate_limit_until - now:.1f}s.'
        )

    async with _lock_for(key):
        # Single-flight recheck: another simultaneous endpoint may already have
        # refreshed this resource while we were waiting for the lock.
        if not force:
            value = _fresh(key, ttl)
            if value is not None:
                _stats['cache_hits'] += 1
                return value

        now = time.monotonic()
        if not force and now < _rate_limit_until:
            value = _stale(key)
            if value is not None:
                _stats['stale_served'] += 1
                return value
            raise AlpacaRateLimitError(
                f'Alpaca rate-limit backoff active for {_rate_limit_until - now:.1f}s.'
            )

        try:
            value = await _network_get(path, params=params)
            return _store(key, value)
        except AlpacaRateLimitError:
            value = _stale(key)
            if value is not None:
                _stats['stale_served'] += 1
                return value
            raise
        except Exception:
            # Short API/network hiccups should not blank the Dashboard/Race.
            value = _stale(key)
            if value is not None:
                _stats['stale_served'] += 1
                return value
            raise


async def get_account(force=False):
    return await _cached_get(
        'account',
        '/v2/account',
        force=force,
    )


async def get_positions(force=False):
    return await _cached_get(
        'positions',
        '/v2/positions',
        force=force,
    )


async def get_orders(status='open', limit=100, direction='desc', force=False):
    key = f'orders:{status}:{int(limit)}:{direction}'
    return await _cached_get(
        key,
        '/v2/orders',
        params={
            'status': status,
            'limit': limit,
            'direction': direction,
            'nested': 'false',
        },
        force=force,
    )


async def get_clock(force=False):
    return await _cached_get(
        'clock',
        '/v2/clock',
        ttl=60,
        force=force,
    )


async def submit_market_buy(symbol, notional, client_order_id):
    global _last_network_error
    _check_keys()
    body = {
        'symbol': symbol,
        'notional': f'{notional:.2f}',
        'side': 'buy',
        'type': 'market',
        'time_in_force': 'gtc',
        'client_order_id': client_order_id,
    }

    # Never retry a mutation automatically after an ambiguous failure.
    # The client_order_id remains the idempotency reference for diagnostics.
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            PAPER_BASE + '/v2/orders',
            headers={**headers(), 'Content-Type': 'application/json'},
            json=body,
        )

    if r.status_code == 429:
        wait = _mark_429(r)
        raise AlpacaRateLimitError(
            f'Alpaca rate limited BUY submission (HTTP 429). Backoff ~{wait:.0f}s.'
        )

    try:
        r.raise_for_status()
    except Exception as e:
        _last_network_error = str(e)
        raise

    _mark_success()
    invalidate_trading_snapshot()
    return r.json()


async def submit_market_sell(symbol, qty, client_order_id):
    global _last_network_error
    _check_keys()
    body = {
        'symbol': symbol,
        'qty': str(qty),
        'side': 'sell',
        'type': 'market',
        'time_in_force': 'gtc',
        'client_order_id': client_order_id,
    }

    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            PAPER_BASE + '/v2/orders',
            headers={**headers(), 'Content-Type': 'application/json'},
            json=body,
        )

    if r.status_code == 429:
        wait = _mark_429(r)
        raise AlpacaRateLimitError(
            f'Alpaca rate limited SELL submission (HTTP 429). Backoff ~{wait:.0f}s.'
        )

    try:
        r.raise_for_status()
    except Exception as e:
        _last_network_error = str(e)
        raise

    _mark_success()
    invalidate_trading_snapshot()
    return r.json()


async def get_crypto_assets(force=False):
    # Universe membership changes slowly and universe.py already has a 15m
    # schedule. This extra cache prevents concurrent status/scanner calls from
    # duplicating the same REST request.
    return await _cached_get(
        'crypto_assets',
        '/v2/assets',
        params={'asset_class': 'crypto', 'status': 'active'},
        ttl=max(int(settings.crypto_universe_refresh_minutes) * 60, 60),
        force=force,
    )


def alpaca_cache_status():
    now = time.monotonic()
    remaining = max(_rate_limit_until - now, 0.0)
    return {
        'rate_limited': remaining > 0,
        'backoff_remaining_seconds': remaining,
        'last_429_at': _last_429_at,
        'last_network_error': _last_network_error,
        'snapshot_ttl_seconds': int(settings.alpaca_snapshot_ttl_seconds),
        'stale_if_error_seconds': int(settings.alpaca_stale_if_error_seconds),
        'cache_ages_seconds': {
            key: round(age, 1)
            for key in (
                'account',
                'positions',
                'orders:open:100:desc',
                'orders:all:100:desc',
                'orders:all:500:desc',
            )
            if (age := _cache_age(key)) is not None
        },
        'stats': dict(_stats),
    }