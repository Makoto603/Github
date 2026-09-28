import json
import re
import httpx
from .db import connect, meta_get, meta_set
from .metrics import calculate_metrics
from .config import settings
from .universe import add_blacklist, blacklist_set, cached_tradable_symbols, universe_snapshot
from .symbols import canonical_symbol
from .alpaca import get_positions
from .experiment import knowledge_context, experiment_mode, current_race_learning_context
from .strategy import (STRATEGY_ARCHITECTURE_VERSION, REGIME_SLOPE_BARS,
                       MTF_FAST, MTF_SLOW, MTF_RSI, MTF_SLOPE_BARS)

BOUNDS = {
    'ema_fast': (5, 30),
    'ema_slow': (20, 80),
    'rsi_period': (7, 30),
    'rsi_buy': (20, 48),
    'rsi_sell': (52, 85),
    'atr_period': (7, 30),
    'atr_stop': (0.8, 4),
    'atr_take': (1, 6),
    'ema_exit_confirm_bars': (2, 6),
    'ema_entry_min_spread_bps': (0, 20),
}
MIN_TRADES_FOR_AUTO_APPLY = 20

def current_config():
    with connect() as c:
        r = c.execute('SELECT * FROM strategy_config WHERE id=1').fetchone()
        return {k: r[k] for k in BOUNDS}


def current_config_audit():
    """Identify the current parameter set and where it most recently came from."""
    cfg = current_config()
    source = 'CURRENT / UNMATCHED'
    applied_at = None
    conference_id = None

    with connect() as c:
        rows = c.execute(
            """SELECT id,ts,source,candidate_config_json
            FROM ai_conferences
            WHERE approved=1
            ORDER BY id DESC LIMIT 50"""
        ).fetchall()

    def same(candidate):
        if not isinstance(candidate, dict):
            return False
        for key in BOUNDS:
            if key not in candidate:
                return False
            a = candidate[key]
            b = cfg[key]
            if isinstance(b, int):
                if int(a) != int(b):
                    return False
            else:
                if abs(float(a) - float(b)) > 1e-9:
                    return False
        return True

    for row in rows:
        try:
            candidate = json.loads(row['candidate_config_json'] or '{}')
        except Exception:
            continue
        if same(candidate):
            conference_id = int(row['id'])
            source = str(row['source'] or 'AI CONFERENCE')
            applied_at = row['ts']
            break

    return {
        'config': cfg,
        'config_version': f'AI#{conference_id}' if conference_id else 'CURRENT',
        'source': source,
        'applied_at': applied_at,
        'architecture_version': STRATEGY_ARCHITECTURE_VERSION,
        'architecture_rules': [
            '30m strong bearish regime blocks new BUY',
            '15m confirmed bearish trend blocks new BUY',
            '5m must be BULLISH or RECOVERING',
            'at least 30m or 15m must be BULLISH',
            '1m EMA fast > EMA slow',
            '1m EMA spread >= configured minimum',
            '1m RSI <= configured BUY threshold',
            f'1m slow EMA rising over {REGIME_SLOPE_BARS} bars',
            '1m price above slow EMA',
            '1m RSI recovering vs previous bar',
            f'HTF state uses EMA {MTF_FAST}/{MTF_SLOW}, RSI {MTF_RSI}, slope {MTF_SLOPE_BARS} bars',
        ],
        'exit_rules': [
            'persistent ATR stop',
            'persistent ATR take profit',
            'RSI exit',
            'confirmed EMA-down exit',
        ],
    }


def validate(x, old):
    clean = {}
    errors = []
    integer_keys = {'ema_fast','ema_slow','rsi_period','atr_period','ema_exit_confirm_bars'}
    for k, (lo, hi) in BOUNDS.items():
        if k not in x:
            errors.append('missing ' + k)
            continue
        try:
            v = int(x[k]) if k in integer_keys else float(x[k])
        except Exception:
            errors.append('type ' + k)
            continue
        clean[k] = v
        if not lo <= v <= hi:
            errors.append('range ' + k)
        if k == 'ema_exit_confirm_bars':
            if abs(v - int(old[k])) > 1:
                errors.append('change ' + k)
        elif k == 'ema_entry_min_spread_bps':
            if abs(v - float(old[k])) > 2.0:
                errors.append('change ' + k)
        elif abs(v - float(old[k])) / max(abs(float(old[k])), 1e-9) > 0.20:
            errors.append('change ' + k)
    if clean.get('ema_fast', 99) >= clean.get('ema_slow', 0):
        errors.append('EMA order')
    return not errors, clean, errors

async def _ask(prompt):
    async with httpx.AsyncClient(timeout=180) as h:
        r = await h.post(
            settings.ollama_url + '/api/generate',
            json={'model': settings.ollama_model, 'prompt': prompt, 'stream': False},
        )
        r.raise_for_status()
        return r.json()['response']

def _base_context(m, cfg):
    return (
        'PAPER TRADING ONLY. No real-money recommendations.\n'
        + 'Metrics: ' + json.dumps(m, ensure_ascii=False) + '\n'
        + 'Current parameters: ' + json.dumps(cfg, ensure_ascii=False) + '\n'
        + 'Strategy architecture: ' + STRATEGY_ARCHITECTURE_VERSION + '. Entry is multi-timeframe: 30m is a bearish-regime veto, 15m is an intermediate bearish veto, 5m must be BULLISH/RECOVERING, at least 30m or 15m must be BULLISH, then the existing 1m pullback-recovery checks must all pass. Higher timeframes are derived from local 1m bars and add no Alpaca requests. ATR stop/take are enforced; EMA-down exit needs consecutive confirmation. These architecture safety gates are code rules and AI must not disable them.\n'
        + 'Crypto universe: ' + json.dumps(universe_snapshot(), ensure_ascii=False) + '\n'
        + 'AI blacklist rule: blacklist only when repeated symbol-specific evidence supports exclusion; '
          'never blacklist merely because one trade lost. Maximum 3 additions per approved conference.\n'
        + 'Experiment mode: ' + json.dumps(experiment_mode(), ensure_ascii=False) + '\n'
        + 'Archived Paper knowledge: ' + json.dumps(knowledge_context(), ensure_ascii=False) + '\n'
        + 'Current Shadow Race evidence: ' + json.dumps(current_race_learning_context(), ensure_ascii=False) + '\n'
    )

async def ai_conference(source='manual', bypass_sample_gate=False, override_key='paper_ai_apply_override_used', override_label='ONE-TIME PAPER OVERRIDE'):
    # Normal/nightly conferences require 20 closed trades for auto-apply.
    # PAPER apply-once bypasses ONLY that sample-size gate. Parameter validation
    # and all execution Hard Locks remain mandatory.
    if bypass_sample_gate:
        if meta_get(override_key, '0') == '1':
            raise RuntimeError(f'{override_label} has already been used')

    m = calculate_metrics()
    old = current_config()
    ctx = _base_context(m, old)

    if bypass_sample_gate:
        ctx += (
            'SPECIAL PAPER TEST: the user explicitly authorized ONE conservative '
            'parameter application before the normal 20-closed-trade gate. '
            'This bypasses sample size only. All validation limits remain mandatory. '
            'Do not compensate for the small sample with large parameter changes.\n'
        )

    if not settings.ollama_enabled:
        raise RuntimeError('Ollama is disabled')

    quant = await _ask(
        'You are QUANT ANALYST in a strict trading-system review.\n' + ctx +
        'Analyze only observed evidence. Focus on expectancy, payoff, profit factor, '
        'break-even win rate, drawdown, and exit-reason breakdown. Separate small-sample '
        'uncertainty from clear defects. Compare the Champion evidence with Current Shadow Race evidence, but treat 0-4 closed trades as low sample and never copy a one-trade winner blindly. Use symbol_breakdown to identify repeated symbol-specific underperformance, but never infer a blacklist from a single loss. Max 180 words.'
    )

    risk = await _ask(
        'You are RISK MANAGER. Be adversarial.\n' + ctx +
        'QUANT ANALYST:\n' + quant + '\n'
        'Identify whether losses are too large, exits too sensitive, exposure too high, '
        'or the sample too small. Never suggest leverage or raising the 80% exposure cap. '
        'Max 180 words.'
    )

    engineer = await _ask(
        'You are STRATEGY ENGINEER.\n' + ctx +
        'QUANT:\n' + quant + '\nRISK:\n' + risk + '\n'
        'Propose conservative parameter changes only if supported. Pay special attention '
        'to EMA exit confirmation, ATR stop/take, and EMA entry spread. Do not optimize '
        'win rate alone. IMPORTANT validation limits per conference: ema_exit_confirm_bars '
        'may change by at most 1; ema_entry_min_spread_bps by at most 2.0; every other '
        'parameter by at most 20 percent from its current value. You may suggest blacklist_add only for symbols with at least 3 closed trades and repeated negative evidence; max 3 symbols. Max 180 words.'
    )

    chair = await _ask(
        'You are CHAIR of the AI conference. Synthesize the three reviewers.\n' + ctx +
        'QUANT:\n' + quant + '\nRISK:\n' + risk + '\nENGINEER:\n' + engineer + '\n'
        'Return exactly ONE JSON object, no markdown, with keys: decision, ema_fast, '
        'ema_slow, rsi_period, rsi_buy, rsi_sell, atr_period, atr_stop, atr_take, '
        'ema_exit_confirm_bars, ema_entry_min_spread_bps, blacklist_add, blacklist_reason, reason. decision must be '
        'PROPOSE or NO_CHANGE. Keep every change conservative. Mandatory per-conference '
        'change limits: ema_exit_confirm_bars <= 1 step; ema_entry_min_spread_bps <= 2.0; '
        'all other parameters <= 20 percent from current. blacklist_add must be a JSON list of symbol strings (use [] when none); blacklist_reason must be a short evidence-based string. Return values inside these limits.'
    )

    matches = re.findall(r'\{[\s\S]*?\}', chair)
    if not matches:
        raise ValueError('Chair response has no JSON object')

    js = json.loads(matches[-1])
    decision = str(js.get('decision', 'NO_CHANGE')).upper()
    ok, cand, errs = validate(js, old)

    # AI can add to the blacklist only with repeated symbol-specific evidence.
    # It cannot remove manual/env/AI blacklist entries.
    proposed_blacklist = js.get('blacklist_add') or []
    if isinstance(proposed_blacklist, str):
        proposed_blacklist = [x.strip() for x in proposed_blacklist.split(',') if x.strip()]
    proposed_blacklist = [canonical_symbol(x) for x in proposed_blacklist][:3]
    blacklist_reason = str(js.get('blacklist_reason') or js.get('reason') or '')[:500]

    tradable = set(cached_tradable_symbols(include_blacklisted=True))
    already_blocked = blacklist_set()
    try:
        held_items = await get_positions()
        held_symbols = {
            canonical_symbol(p.get('symbol'))
            for p in held_items if float(p.get('qty') or 0) > 0
        }
    except Exception:
        held_symbols = None
    evidence = {x['symbol']: x for x in m.get('symbol_breakdown', [])}
    accepted_blacklist = []
    blacklist_rejections = []
    for symbol in proposed_blacklist:
        if symbol not in tradable:
            blacklist_rejections.append(f'blacklist unknown {symbol}')
            continue
        if symbol in already_blocked:
            continue
        if held_symbols is None:
            blacklist_rejections.append(f'blacklist position-check unavailable {symbol}')
            continue
        if symbol in held_symbols:
            blacklist_rejections.append(f'blacklist held {symbol}')
            continue
        ev = evidence.get(symbol, {})
        if int(ev.get('count') or 0) < 3:
            blacklist_rejections.append(f'blacklist evidence {symbol}<3 trades')
            continue
        accepted_blacklist.append(symbol)

    enough = m['trades_closed'] >= MIN_TRADES_FOR_AUTO_APPLY
    sample_gate_passed = enough or bypass_sample_gate
    approved = decision == 'PROPOSE' and ok and sample_gate_passed

    blockers = []
    if decision != 'PROPOSE':
        blockers.append('chair selected NO_CHANGE')
    blockers.extend(errs)
    if not enough and not bypass_sample_gate:
        blockers.append(
            f'proposal only: closed trades {m["trades_closed"]}/{MIN_TRADES_FOR_AUTO_APPLY}'
        )

    gate_note = ''
    if bypass_sample_gate and not enough:
        gate_note = (
            f'{override_label}: sample gate bypassed '
            f'{m["trades_closed"]}/{MIN_TRADES_FOR_AUTO_APPLY}'
        )

    block = ', '.join(blockers) if blockers else ''

    if approved:
        with connect() as c:
            c.execute(
                '''UPDATE strategy_config SET
                ema_fast=?,ema_slow=?,rsi_period=?,rsi_buy=?,rsi_sell=?,
                atr_period=?,atr_stop=?,atr_take=?,ema_exit_confirm_bars=?,
                ema_entry_min_spread_bps=?,updated_at=CURRENT_TIMESTAMP WHERE id=1''',
                (
                    cand['ema_fast'], cand['ema_slow'], cand['rsi_period'],
                    cand['rsi_buy'], cand['rsi_sell'], cand['atr_period'],
                    cand['atr_stop'], cand['atr_take'],
                    cand['ema_exit_confirm_bars'], cand['ema_entry_min_spread_bps']
                )
            )

        for symbol in accepted_blacklist:
            add_blacklist(symbol, source='ai', reason=blacklist_reason)

        if bypass_sample_gate:
            meta_set(override_key, '1')
            meta_set(override_key + '_at', source)

    with connect() as c:
        c.execute(
            '''INSERT INTO ai_conferences(
            source,metrics_json,exit_breakdown_json,current_config_json,
            quant_text,risk_text,engineer_text,chair_text,candidate_config_json,
            approved,apply_block_reason)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)''',
            (
                source, json.dumps(m), json.dumps(m.get('exit_breakdown', [])),
                json.dumps(old), quant, risk, engineer, chair, json.dumps({**cand, 'blacklist_add': accepted_blacklist, 'blacklist_proposed': proposed_blacklist, 'blacklist_reason': blacklist_reason}),
                1 if approved else 0, block if block else gate_note
            )
        )
        text = (
            'AI CONFERENCE\nQUANT: ' + quant + '\nRISK: ' + risk +
            '\nENGINEER: ' + engineer + '\nCHAIR: ' + chair
        )
        if gate_note:
            text += '\n' + gate_note
        if blacklist_rejections:
            text += '\nBLACKLIST IGNORED: ' + ', '.join(blacklist_rejections)
        if block:
            text += '\nREJECTED: ' + block
        c.execute(
            '''INSERT INTO nightly_reviews(
            metrics_json,current_config_json,candidate_config_json,approved,review_text)
            VALUES(?,?,?,?,?)''',
            (json.dumps(m), json.dumps(old), json.dumps({**cand, 'blacklist_add': accepted_blacklist, 'blacklist_proposed': proposed_blacklist, 'blacklist_reason': blacklist_reason}), 1 if approved else 0, text)
        )

    return {
        'ok': True, 'metrics': m, 'current': old, 'candidate': cand,
        'approved': approved, 'apply_block_reason': block,
        'sample_gate_bypassed': bool(bypass_sample_gate and not enough),
        'one_time_override_used': meta_get(override_key, '0') == '1',
        'blacklist_added': accepted_blacklist if approved else [],
        'blacklist_rejections': blacklist_rejections,
        'quant': quant, 'risk': risk, 'engineer': engineer, 'chair': chair,
    }

async def nightly_review():
    return await ai_conference(source='nightly')