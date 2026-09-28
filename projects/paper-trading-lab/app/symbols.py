from .config import settings

def canonical_symbol(symbol: str) -> str:
    """
    Normalize Alpaca crypto position symbology:
      BTCUSD -> BTC/USD
      BTC/USD -> BTC/USD

    Uses configured crypto pairs first, so USD/USDT/etc are handled safely.
    """
    s = str(symbol or "").upper().strip()
    if not s:
        return s
    if "/" in s:
        return s

    if settings.is_crypto:
        for pair in settings.symbol_list:
            compact = pair.replace("/", "")
            if s == compact:
                return pair

        # Safe fallback for common crypto quote currencies. Longest first.
        for quote in ('USDT', 'USDC', 'USD', 'BTC', 'ETH'):
            if s.endswith(quote) and len(s) > len(quote):
                return s[:-len(quote)] + '/' + quote

    return s

def compact_symbol(symbol: str) -> str:
    return str(symbol or "").upper().replace("/", "").strip()