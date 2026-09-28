from datetime import datetime, timezone, timedelta
import random
import httpx
from .config import settings


class DemoProvider:
    def __init__(self):
        self.prices = {
            'BTC/USD': 110000, 'ETH/USD': 4500, 'SOL/USD': 220, 'DOGE/USD': 0.25,
            'LTC/USD': 120, 'AVAX/USD': 38, 'LINK/USD': 24, 'BCH/USD': 620,
            'AAPL': 220, 'MSFT': 505, 'NVDA': 180, 'AMZN': 230,
            'GOOGL': 205, 'META': 760, 'AMD': 165, 'SPY': 650,
        }

    async def latest_bars(self, symbols):
        ts = datetime.now(timezone.utc).replace(second=0, microsecond=0).isoformat()
        out = {}
        for s in symbols:
            old = float(self.prices.get(s, 100))
            sigma = 0.0035 if '/' in s else 0.0025
            close = max(0.00000001, old * (1 + random.gauss(0.00003, sigma)))
            high = max(old, close) * (1 + abs(random.gauss(0, sigma / 4)))
            low = min(old, close) * (1 - abs(random.gauss(0, sigma / 4)))
            self.prices[s] = close
            out[s] = {
                'symbol': s, 'ts': ts, 'open': old, 'high': high,
                'low': low, 'close': close, 'volume': random.randint(1, 50000),
            }
        return out

    async def historical_bars(self, symbol, limit=240):
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        px = float(self.prices.get(symbol, 100))
        rows = []
        sigma = 0.0035 if '/' in symbol else 0.0025
        for i in range(limit, 0, -1):
            old = px
            px = max(0.00000001, px * (1 + random.gauss(0.00003, sigma)))
            rows.append({
                'symbol': symbol,
                'ts': (now - timedelta(minutes=i)).isoformat(),
                'open': old,
                'high': max(old, px) * (1 + sigma / 6),
                'low': min(old, px) * (1 - sigma / 6),
                'close': px,
                'volume': random.randint(1, 50000),
            })
        self.prices[symbol] = px
        return rows


class AlpacaProvider:
    DATA_BASE = 'https://data.alpaca.markets'

    def _headers(self):
        bad = {'', 'YOUR_PAPER_KEY', 'YOUR_PAPER_SECRET'}
        if settings.alpaca_api_key in bad or settings.alpaca_secret_key in bad:
            raise RuntimeError('Alpaca Market Data API key is not configured')
        return {
            'APCA-API-KEY-ID': settings.alpaca_api_key,
            'APCA-API-SECRET-KEY': settings.alpaca_secret_key,
        }

    async def latest_bars(self, symbols):
        symbols = list(dict.fromkeys(symbols))
        if not symbols:
            return {}

        if settings.is_crypto:
            size = max(1, int(settings.crypto_latest_batch_size))
            data = {}
            async with httpx.AsyncClient(timeout=30) as c:
                for i in range(0, len(symbols), size):
                    chunk = symbols[i:i + size]
                    params = {'symbols': ','.join(chunk)}
                    r = await c.get(
                        f'{self.DATA_BASE}/v1beta3/crypto/{settings.crypto_location}/latest/bars',
                        headers=self._headers(), params=params,
                    )
                    r.raise_for_status()
                    data.update(r.json().get('bars', {}))
        else:
            params = {'symbols': ','.join(symbols), 'feed': settings.alpaca_data_feed}
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.get(
                    self.DATA_BASE + '/v2/stocks/bars/latest',
                    headers=self._headers(), params=params,
                )
                r.raise_for_status()
                data = r.json().get('bars', {})

        return {
            s: {
                'symbol': s, 'ts': b['t'], 'open': float(b['o']),
                'high': float(b['h']), 'low': float(b['l']),
                'close': float(b['c']), 'volume': float(b.get('v', 0) or 0),
            }
            for s, b in data.items()
        }

    async def historical_bars_batch(self, symbols, limit=240):
        symbols = list(dict.fromkeys(symbols))
        if not symbols:
            return {}
        if not settings.is_crypto:
            out = {}
            for symbol in symbols:
                out[symbol] = await self.historical_bars(symbol, limit)
            return out

        start = (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat().replace('+00:00', 'Z')
        size = max(1, int(settings.crypto_history_batch_size))
        out = {}
        async with httpx.AsyncClient(timeout=45) as c:
            for i in range(0, len(symbols), size):
                chunk = symbols[i:i + size]
                params = {
                    'symbols': ','.join(chunk),
                    'timeframe': '1Min',
                    'start': start,
                    'limit': 10000,
                    'sort': 'desc',
                }
                r = await c.get(
                    f'{self.DATA_BASE}/v1beta3/crypto/{settings.crypto_location}/bars',
                    headers=self._headers(), params=params,
                )
                r.raise_for_status()
                payload = r.json().get('bars', {})
                for symbol in chunk:
                    bars = list(reversed(payload.get(symbol, [])[:limit]))
                    out[symbol] = [
                        {
                            'symbol': symbol, 'ts': b['t'], 'open': float(b['o']),
                            'high': float(b['h']), 'low': float(b['l']),
                            'close': float(b['c']), 'volume': float(b.get('v', 0) or 0),
                        }
                        for b in bars
                    ]
        return out

    async def historical_bars(self, symbol, limit=240):
        if settings.is_crypto:
            # Crypto is 24/7. Pull a compact recent window; no stock-market calendar needed.
            start = (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat().replace('+00:00', 'Z')
            params = {
                'symbols': symbol,
                'timeframe': '1Min',
                'start': start,
                'limit': min(max(limit, 1), 10000),
                'sort': 'desc',
            }
            async with httpx.AsyncClient(timeout=30) as c:
                r = await c.get(
                    f'{self.DATA_BASE}/v1beta3/crypto/{settings.crypto_location}/bars',
                    headers=self._headers(), params=params,
                )
                r.raise_for_status()
                payload = r.json()
                bars = payload.get('bars', {}).get(symbol, [])
        else:
            start = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat().replace('+00:00', 'Z')
            params = {
                'timeframe': '1Min',
                'start': start,
                'limit': min(max(limit, 1), 10000),
                'adjustment': 'raw',
                'feed': settings.alpaca_data_feed,
                'sort': 'desc',
            }
            async with httpx.AsyncClient(timeout=30) as c:
                r = await c.get(
                    f'{self.DATA_BASE}/v2/stocks/{symbol}/bars',
                    headers=self._headers(), params=params,
                )
                r.raise_for_status()
                bars = r.json().get('bars', [])

        bars = list(reversed(bars[:limit]))
        return [
            {
                'symbol': symbol, 'ts': b['t'], 'open': float(b['o']),
                'high': float(b['h']), 'low': float(b['l']),
                'close': float(b['c']), 'volume': float(b.get('v', 0) or 0),
            }
            for b in bars
        ]


def build_provider():
    return AlpacaProvider() if settings.market_provider.lower() == 'alpaca' else DemoProvider()