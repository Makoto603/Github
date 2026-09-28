from .strategy import evaluate
from .config import settings
from .symbols import canonical_symbol

def opportunity_score(df, cfg, in_position=False):
    """
    0..100 score used only to rank opportunity.
    It is not allowed to bypass hard risk locks.
    """
    result = evaluate(df, cfg)
    if not result.get("ready"):
        return 0.0, result

    rsi = float(result.get("rsi") or 50)
    ef = float(result.get("ema_fast") or 0)
    es = float(result.get("ema_slow") or 0)
    atr = float(result.get("atr") or 0)
    px = float(result.get("price") or 0)

    score = 0.0

    # Trend: strongest component
    if ef > es and es > 0:
        spread = (ef / es - 1.0) * 100
        score += min(35.0, 20.0 + max(0.0, spread * 25))
    else:
        score += 5.0

    # RSI: favor controlled pullbacks, not extreme strength
    buy_thr = float(cfg["rsi_buy"])
    if rsi <= buy_thr:
        score += min(35.0, 25.0 + max(0.0, (buy_thr - rsi) * 0.8))
    elif rsi < 50:
        score += 18.0
    elif rsi < 60:
        score += 10.0
    else:
        score += 3.0

    # ATR opportunity: enough movement to matter, but penalize extremes
    atr_pct = (atr / px * 100) if px > 0 else 0
    if 0.15 <= atr_pct <= 2.5:
        score += 20.0
    elif 0.05 <= atr_pct <= 5.0:
        score += 10.0

    # Multi-timeframe context: ranking follows the same architecture as entry.
    mtf = result.get('mtf') or {}
    states = mtf.get('states') or {}
    s30 = (states.get('30m') or {}).get('state')
    s15 = (states.get('15m') or {}).get('state')
    s5 = (states.get('5m') or {}).get('state')

    score += {'BULLISH': 8.0, 'RECOVERING': 4.0, 'NEUTRAL': 1.0, 'BEARISH': -14.0}.get(s30, 0.0)
    score += {'BULLISH': 8.0, 'RECOVERING': 4.0, 'NEUTRAL': 1.0, 'BEARISH': -10.0}.get(s15, 0.0)
    score += {'BULLISH': 8.0, 'RECOVERING': 7.0, 'NEUTRAL': 0.0, 'BEARISH': -8.0}.get(s5, 0.0)

    if mtf.get('entry_ok'):
        score += 5.0

    # Existing positions get a small continuity bonus so the dashboard does not churn
    if in_position:
        score += 5.0

    return round(max(0.0, min(score, 100.0)), 1), result


def rank_markets(frames, cfg, held_symbols=None):
    held_symbols = {canonical_symbol(s) for s in (held_symbols or [])}
    rows = []

    for symbol, df in frames.items():
        score, result = opportunity_score(df, cfg, symbol in held_symbols)
        raw = result.get("signal", "HOLD")

        if raw == "BUY":
            display = "BUY" if symbol not in held_symbols else "HOLD"
        elif raw == "SELL":
            display = "SELL" if symbol in held_symbols else "WAIT"
        elif raw == "EXIT_WATCH":
            display = "EXIT WATCH" if symbol in held_symbols else "WAIT"
        else:
            display = "HOLD" if symbol in held_symbols else "WAIT"

        rows.append({
            "symbol": symbol,
            "score": score,
            "signal": display,
            "raw_signal": raw,
            "in_position": symbol in held_symbols,
            "price": result.get("price"),
            "rsi": result.get("rsi"),
            "ema_fast": result.get("ema_fast"),
            "ema_slow": result.get("ema_slow"),
            "trend": result.get("trend"),
            "atr": result.get("atr"),
            "mtf_ready": (result.get("mtf") or {}).get("ready", False),
            "mtf_entry_ok": (result.get("mtf") or {}).get("entry_ok", False),
            "mtf_5m": (((result.get("mtf") or {}).get("states") or {}).get("5m") or {}).get("state"),
            "mtf_15m": (((result.get("mtf") or {}).get("states") or {}).get("15m") or {}).get("state"),
            "mtf_30m": (((result.get("mtf") or {}).get("states") or {}).get("30m") or {}).get("state"),
            "reason": result.get("reason"),
            "ready": result.get("ready", False),
        })

    rows.sort(key=lambda x: (x["in_position"], x["score"]), reverse=True)
    return rows