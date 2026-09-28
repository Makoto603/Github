from contextlib import asynccontextmanager
import asyncio
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import FastAPI, Body
from fastapi.responses import HTMLResponse
from .db import init_db, connect, meta_get, meta_set
from .config import settings
from .engine import run_cycle, ensure_history, frame, universe_recorder_snapshot
from .metrics import calculate_metrics, calculate_metrics_since
from .reviewer import current_config, current_config_audit, nightly_review, ai_conference
from .race import race_summary, ensure_race_epoch, race_epoch_info
from .experiment import (experiment_status, archive_pretest, reset_current_race_for_official,
                         create_official_experiment, active_experiment)
from .strategy import evaluate
from .scanner import rank_markets
from .prescan import cached_prescan_symbols, prescan_snapshot
from .alpaca import (get_account, get_positions, get_orders, get_crypto_assets,
                     alpaca_cache_status)
from .universe import (refresh_universe, cached_tradable_symbols, universe_snapshot,
                       list_blacklist, add_blacklist, remove_blacklist)
from .symbols import canonical_symbol

bg = None
last_review_date = None
last_cycle_error = None


async def loop():
    global last_review_date, last_cycle_error
    while True:
        try:
            await run_cycle()
            last_cycle_error = None
            now = datetime.now(ZoneInfo('Asia/Tokyo'))
            today = now.date().isoformat()
            if ((now.hour, now.minute) >= (settings.nightly_hour_jst, settings.nightly_minute_jst)
                    and last_review_date != today):
                await nightly_review()
                last_review_date = today
        except Exception as e:
            last_cycle_error = str(e)
            print('cycle error:', e)
        await asyncio.sleep(settings.poll_seconds)


@asynccontextmanager
async def lifespan(app):
    global bg
    init_db()
    try:
        await refresh_universe()
    except Exception as e:
        print('startup universe refresh error:', e)
    # The first background cycle performs the 5-minute pre-scan and only then
    # backfills the detailed candidate set. Avoid full-universe history storms.
    bg = asyncio.create_task(loop())
    yield
    if bg:
        bg.cancel()


app = FastAPI(title=settings.app_name, lifespan=lifespan)


@app.get('/', response_class=HTMLResponse)
def home():
    return Path('app/static/index.html').read_text(encoding='utf-8')



@app.get('/scanner', response_class=HTMLResponse)
def scanner_page():
    return Path('app/static/scanner.html').read_text(encoding='utf-8')

@app.get('/api/status')
async def status():
    out = {
        'paper_only': True,
        'paper_base': 'paper-api.alpaca.markets',
        'market_provider': settings.market_provider,
        'symbols': cached_tradable_symbols(),
        'ollama_enabled': settings.ollama_enabled,
        'ollama_model': settings.ollama_model if settings.ollama_enabled else None,
        'last_cycle_error': last_cycle_error,
    }
    out['asset_mode'] = settings.asset_mode
    out['crypto_24_7'] = settings.is_crypto
    out['clock'] = {'is_open': True, 'mode': 'crypto_24_7'} if settings.is_crypto else {'is_open': True}
    try:
        await get_account()
        out['alpaca_connected'] = True
        if settings.is_crypto:
            active = await refresh_universe()
            out['tradable_symbols'] = active
            out['universe'] = universe_snapshot()
            out['prescan'] = prescan_snapshot()
    except Exception as e:
        out['alpaca_connected'] = False
        out['alpaca_error'] = str(e)
    detail_symbols = cached_prescan_symbols(cached_tradable_symbols())
    with connect() as c:
        out['history_counts'] = {
            s: c.execute('SELECT COUNT(*) AS n FROM prices WHERE symbol=?', (s,)).fetchone()['n']
            for s in detail_symbols
        }
    out['alpaca_cache'] = alpaca_cache_status()
    out['recorder'] = universe_recorder_snapshot()
    return out


@app.get('/api/portfolio')
async def portfolio():
    try:
        account = await get_account()
        current_equity = float(account.get('equity') or 0)
        return {'ok': True, 'account': account, 'metrics': calculate_metrics(), 'experiment': experiment_status(current_equity)}
    except Exception as e:
        return {'ok': False, 'error': str(e), 'account': None, 'metrics': calculate_metrics(), 'experiment': experiment_status(None)}


@app.get('/api/positions')
async def pos():
    try:
        items = await get_positions()
        out = []
        for p in items:
            out.append({
                **p,
                'api_symbol': p.get('symbol'),
                'symbol': canonical_symbol(p.get('symbol')),
            })
        return {'ok': True, 'items': out}
    except Exception as e:
        return {'ok': False, 'error': str(e), 'items': []}


@app.get('/api/orders')
async def orders():
    try:
        return {'ok': True, 'items': await get_orders('all', 100)}
    except Exception as e:
        return {'ok': False, 'error': str(e), 'items': []}


@app.get('/api/universe')
async def universe_api():
    try:
        active = await refresh_universe()
        snap = universe_snapshot()
        return {'ok': True, **snap, 'active_symbols': active}
    except Exception as e:
        return {'ok': False, 'error': str(e), **universe_snapshot()}


@app.get('/api/blacklist')
def blacklist_api():
    return {'ok': True, 'items': list_blacklist()}


@app.post('/api/blacklist')
def blacklist_add_api(payload: dict = Body(...)):
    try:
        symbol = add_blacklist(
            payload.get('symbol'),
            source='manual',
            reason=payload.get('reason') or 'Manual blacklist',
        )
        return {'ok': True, 'symbol': symbol, 'items': list_blacklist()}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


@app.delete('/api/blacklist/{symbol:path}')
def blacklist_remove_api(symbol: str):
    try:
        symbol = remove_blacklist(symbol)
        return {'ok': True, 'symbol': symbol, 'items': list_blacklist()}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


@app.get('/api/market-recorder')
def market_recorder():
    return {'ok': True, **universe_recorder_snapshot()}


@app.get('/api/config')
def config():
    return current_config()


@app.get('/api/strategy-audit')
def strategy_audit():
    return {'ok': True, **current_config_audit()}


@app.get('/api/reviews')
def reviews():
    with connect() as c:
        return [dict(r) for r in c.execute('SELECT * FROM nightly_reviews ORDER BY id DESC LIMIT 30')]




@app.get('/api/market-series')
def market_series():
    """
    Chart-only series:
    - duplicate/non-positive rows removed
    - isolated bad ticks removed
    - session/time gaps marked so the UI does not draw a false vertical bridge
    """
    from datetime import datetime, timezone

    def parse_ts(value):
        s = str(value).replace('Z', '+00:00')
        try:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            return None

    out = {}
    with connect() as c:
        for symbol in cached_prescan_symbols(cached_tradable_symbols()):
            rows = [dict(r) for r in c.execute(
                'SELECT ts, close FROM prices WHERE symbol=? '
                'ORDER BY ts DESC LIMIT ?',
                (symbol, max(settings.chart_bars * 3, settings.chart_bars + 60)),
            )]
            rows.reverse()

            clean = []
            seen = set()
            for r in rows:
                ts = str(r['ts'])
                try:
                    close = float(r['close'])
                except Exception:
                    continue
                if ts in seen or close <= 0:
                    continue
                dt = parse_ts(ts)
                if dt is None:
                    continue
                seen.add(ts)
                clean.append({'ts': ts, 'dt': dt, 'close': close})

            # Remove isolated feed spikes only. Legitimate session gaps are preserved.
            if len(clean) >= 3:
                filtered = [clean[0]]
                for i in range(1, len(clean) - 1):
                    prev = filtered[-1]['close']
                    cur = clean[i]['close']
                    nxt = clean[i + 1]['close']
                    j1 = abs(cur / prev - 1) if prev else 0
                    j2 = abs(nxt / cur - 1) if cur else 0
                    back = abs(nxt / prev - 1) if prev else 0
                    if j1 > 0.08 and j2 > 0.08 and back < 0.03:
                        continue
                    filtered.append(clean[i])
                filtered.append(clean[-1])
                clean = filtered

            clean = clean[-settings.chart_bars:]

            if not clean:
                out[symbol] = {'points': [], 'last': None, 'change_pct': None}
                continue

            # Return is calculated inside the latest continuous session segment,
            # not across an overnight/weekend gap.
            segment_start = 0
            for i in range(1, len(clean)):
                gap_min = (clean[i]['dt'] - clean[i - 1]['dt']).total_seconds() / 60.0
                if gap_min > 5:
                    segment_start = i

            base = float(clean[segment_start]['close'])
            last = float(clean[-1]['close'])
            points = []

            prev_dt = None
            for r in clean:
                gap = False
                if prev_dt is not None:
                    gap_min = (r['dt'] - prev_dt).total_seconds() / 60.0
                    gap = gap_min > 5
                close = float(r['close'])
                normalized = ((close / base) - 1.0) * 100 if base else 0.0
                points.append({
                    'ts': r['ts'],
                    'close': close,
                    'normalized_pct': normalized,
                    'gap_before': gap,
                })
                prev_dt = r['dt']

            out[symbol] = {
                'points': points,
                'last': last,
                'change_pct': ((last / base) - 1.0) * 100 if base else 0.0,
                'segment_start_index': segment_start,
            }
    return out




@app.get('/api/scanner')
async def scanner():
    cfg = current_config()
    positions_by_symbol = {}

    try:
        ps = await get_positions()
        for p in ps:
            cs = canonical_symbol(p.get('symbol'))
            qty = float(p.get('qty') or 0)
            if qty > 0:
                positions_by_symbol[cs] = {
                    **p,
                    'symbol': cs,
                    'api_symbol': p.get('symbol'),
                }
        held = set(positions_by_symbol.keys())
    except Exception:
        held = set()

    active_universe = await refresh_universe()
    detailed_candidates = cached_prescan_symbols(active_universe)
    scan_symbols = sorted(set(detailed_candidates) | held)
    frames = {s: frame(s) for s in scan_symbols}
    items = rank_markets(frames, cfg, held)
    active_set = set(active_universe)
    blacklist_rows = {x['symbol']: x for x in list_blacklist()}
    for row in items:
        row['blacklisted'] = row['symbol'] not in active_set
        if row['blacklisted']:
            row['blacklist_source'] = blacklist_rows.get(row['symbol'], {}).get('source')
            row['blacklist_reason'] = blacklist_rows.get(row['symbol'], {}).get('reason')
            if not row.get('in_position'):
                row['signal'] = 'WAIT'

    # Add actual Alpaca position data to scanner rows.
    for row in items:
        p = positions_by_symbol.get(row['symbol'])
        if p:
            row['in_position'] = True
            row['position_qty'] = float(p.get('qty') or 0)
            row['avg_entry_price'] = float(p.get('avg_entry_price') or 0)
            row['current_price'] = float(p.get('current_price') or row.get('price') or 0)
            row['market_value'] = float(p.get('market_value') or 0)
            row['unrealized_pl'] = float(p.get('unrealized_pl') or 0)
            row['unrealized_plpc'] = float(p.get('unrealized_plpc') or 0)

            raw = row.get('raw_signal')
            if raw == 'SELL':
                row['signal'] = 'SELL'
            else:
                row['signal'] = 'HOLD'
        elif row.get('signal') == 'HOLD':
            # No position + neutral strategy state should read as WAIT on the UI.
            row['signal'] = 'WAIT'

    return {
        'ok': True,
        'count': len(items),
        'position_count': len(positions_by_symbol),
        'max_positions': settings.effective_max_positions,
        'reserve_cash_ratio': settings.reserve_cash_ratio,
        'universe': universe_snapshot(),
        'prescan': prescan_snapshot(),
        'items': items,
    }


@app.get('/api/top8')
async def top8():
    data = await scanner()
    items = data['items']

    # HARD UI RULE:
    # Every actual Alpaca position must be visible before any watch-only candidate.
    held = [x for x in items if x.get('in_position')]
    held.sort(key=lambda x: x.get('unrealized_pl', 0), reverse=True)

    others = [x for x in items if not x.get('in_position')]
    others.sort(key=lambda x: x.get('score', 0), reverse=True)

    selected = held[:settings.effective_max_positions]
    used = {x['symbol'] for x in selected}

    for x in others:
        if len(selected) >= settings.effective_max_positions:
            break
        if x['symbol'] not in used:
            selected.append(x)
            used.add(x['symbol'])

    return {
        'ok': True,
        'items': selected,
        'position_count': len(held),
        'max_positions': settings.effective_max_positions,
    }

@app.get('/api/signals')
async def signals():
    cfg = current_config()

    # Position-aware display state:
    # raw strategy signal may say SELL, but if nothing is held that means
    # "do not enter", not an actual sell action.
    try:
        held_items = await get_positions()
        held = {
            canonical_symbol(p.get('symbol'))
            for p in held_items
            if float(p.get('qty') or 0) > 0
        }
    except Exception:
        held = set()

    items = []
    signal_symbols = sorted(set(cached_prescan_symbols(cached_tradable_symbols())) | held)
    for symbol in signal_symbols:
        try:
            df = frame(symbol)
            result = evaluate(df, cfg)
            with connect() as c:
                last = c.execute(
                    'SELECT ts,close FROM prices WHERE symbol=? ORDER BY ts DESC LIMIT 1',
                    (symbol,)
                ).fetchone()

            raw_signal = result.get('signal', 'HOLD')
            in_position = symbol in held

            if raw_signal == 'BUY':
                display_signal = 'BUY' if not in_position else 'HOLD'
                display_reason = result.get('reason', '')
                if in_position:
                    display_reason = 'HOLD: already in position'
            elif raw_signal == 'SELL':
                if in_position:
                    display_signal = 'SELL'
                    display_reason = result.get('reason', '')
                else:
                    display_signal = 'WAIT'
                    display_reason = 'WAIT: bearish/exit condition, but no position is held'
            elif raw_signal == 'EXIT_WATCH':
                display_signal = 'EXIT WATCH' if in_position else 'WAIT'
                display_reason = (
                    result.get('reason', '')
                    if in_position
                    else 'WAIT: EMA exit watch, but no position is held'
                )
            else:
                display_signal = 'HOLD' if in_position else 'WAIT'
                display_reason = result.get('reason', '')

            items.append({
                'symbol': symbol,
                'last_evaluated_at': last['ts'] if last else None,
                'last_price': float(last['close']) if last else None,
                'raw_signal': raw_signal,
                'display_signal': display_signal,
                'in_position': in_position,
                'display_reason': display_reason,
                **result,
            })
        except Exception as e:
            items.append({
                'symbol': symbol,
                'signal': 'ERROR',
                'display_signal': 'ERROR',
                'reason': str(e),
                'display_reason': str(e),
                'ready': False,
                'last_evaluated_at': None,
                'in_position': False,
            })
    return {
        'ok': True,
        'config': cfg,
        'items': items,
    }

@app.get('/api/risk')
async def risk():
    try:
        account = await get_account()
        positions = await get_positions()
        open_orders = await get_orders('open', 100)

        equity = max(float(account.get('equity', 0) or 0), 0.0)
        cash = max(float(account.get('cash', 0) or 0), 0.0)

        gross_long = sum(
            max(float(p.get('market_value') or 0), 0.0)
            for p in positions
            if float(p.get('qty') or 0) > 0
        )

        pending_buys = 0.0
        for o in open_orders:
            if str(o.get('side', '')).lower() != 'buy':
                continue
            if o.get('notional'):
                pending_buys += float(o['notional'])

        limit_value = equity * min(settings.effective_max_gross_exposure_ratio, 0.80)
        available = max(min(cash, limit_value - gross_long - pending_buys), 0.0)

        return {
            'ok': True,
            'leverage_locked': True,
            'shorting_locked': True,
            'buying_power_used_for_orders': False,
            'equity': equity,
            'cash': cash,
            'gross_long': gross_long,
            'pending_buys': pending_buys,
            'gross_limit': limit_value,
            'available_for_new_buys': available,
            'max_symbol_weight': settings.max_symbol_weight,
        }
    except Exception as e:
        return {'ok': False, 'error': str(e)}



@app.get('/api/conferences')
def conferences():
    with connect() as c:
        return [
            dict(r)
            for r in c.execute(
                'SELECT * FROM ai_conferences ORDER BY id DESC LIMIT 20'
            )
        ]

@app.get('/api/strategy-race')
async def strategy_race():
    init_db()
    try:
        account = await get_account()
        positions = await get_positions()
        cfg = current_config()
        active = await refresh_universe()
        held_symbols = {
            canonical_symbol(p.get('symbol'))
            for p in positions if float(p.get('qty') or 0) > 0
        }
        race_symbols = sorted(set(active) | held_symbols)
        frames = {s: frame(s) for s in race_symbols}
        info = ensure_race_epoch(cfg, account, positions, frames)

        metrics = calculate_metrics_since(
            info['epoch_ts'],
            info['starting_equity'],
            float(account.get('equity') or 0),
        )

        result = race_summary(
            metrics,
            cfg,
            sum(1 for p in positions if float(p.get('qty') or 0) > 0),
        )
        return {'ok': True, **result}
    except Exception as e:
        return {
            'ok': False,
            'error': str(e),
            'epoch': race_epoch_info(),
            'items': [],
        }



@app.get('/api/experiments')
async def experiments_api():
    try:
        account = await get_account()
        return experiment_status(float(account.get('equity') or 0))
    except Exception as e:
        out = experiment_status(None)
        out['ok'] = False
        out['error'] = str(e)
        return out


@app.get('/api/pretest-final-tune-status')
def pretest_final_tune_status():
    used = meta_get('pretest_final_tune_used', '0') == '1'
    active = active_experiment()
    return {'ok': True, 'paper_only': True, 'available': (not used) and active is None, 'used': used, 'official_active': active is not None}


@app.post('/api/ai-conference/pretest-final-tune')
async def pretest_final_tune():
    try:
        if active_experiment() is not None:
            return {'ok': False, 'error': 'Official experiment is already active; PRETEST tuning is closed.'}
        if meta_get('pretest_final_tune_used', '0') == '1':
            return {'ok': False, 'error': 'PRETEST FINAL AI TUNE has already been applied.'}
        return await ai_conference(source='pretest_final_tune', bypass_sample_gate=True, override_key='pretest_final_tune_used', override_label='PRETEST FINAL AI TUNE')
    except Exception as e:
        return {'ok': False, 'error': str(e)}


@app.post('/api/experiments/start-official')
async def start_official_experiment():
    try:
        existing = active_experiment()
        if existing:
            return {'ok': False, 'error': f"{existing['name']} is already active."}

        account = await get_account()
        positions = [p for p in await get_positions() if float(p.get('qty') or 0) > 0]
        open_orders = await get_orders('open', 100)
        if positions:
            symbols = ', '.join(canonical_symbol(p.get('symbol')) for p in positions)
            return {'ok': False, 'error': 'Official measurement requires a flat portfolio so PRETEST cost basis does not leak into the experiment. Open positions: ' + symbols}
        if open_orders:
            return {'ok': False, 'error': 'Official measurement requires no open/pending orders. Wait for or cancel them before starting.'}

        cfg = current_config()
        active_symbols = await refresh_universe()
        frames = {s: frame(s) for s in active_symbols}

        pre_info = ensure_race_epoch(cfg, account, [], frames)
        pre_metrics = calculate_metrics_since(pre_info['epoch_ts'], pre_info['starting_equity'], float(account.get('equity') or 0))
        pre_race = race_summary(pre_metrics, cfg, 0)
        archive_pretest(start_ts=pre_info.get('epoch_ts'), start_equity=pre_info.get('starting_equity'), end_equity=float(account.get('equity') or 0), start_config=cfg, end_config=cfg, summary=pre_metrics, race_snapshot=pre_race)

        reset_current_race_for_official()
        official_info = ensure_race_epoch(cfg, account, [], frames)
        exp = create_official_experiment(started_at=official_info['epoch_ts'], start_equity=official_info['starting_equity'], start_config=cfg)
        return {'ok': True, 'message': f"{exp['name']} started.", 'experiment': experiment_status(float(account.get('equity') or 0)), 'pretest_archived': True}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


@app.post('/api/run-cycle')
async def cycle():
    try:
        return await run_cycle()
    except Exception as e:
        return {'ok': False, 'error': str(e)}


@app.post('/api/ai-conference')
async def conference():
    try:
        return await ai_conference(source='manual')
    except Exception as e:
        return {'ok': False, 'error': str(e)}


@app.get('/api/ai-apply-once-status')
def ai_apply_once_status():
    used = meta_get('paper_ai_apply_override_used', '0') == '1'
    return {'ok': True, 'paper_only': True, 'available': not used, 'used': used}


@app.post('/api/ai-conference/apply-once')
async def conference_apply_once():
    try:
        if meta_get('paper_ai_apply_override_used', '0') == '1':
            return {'ok': False, 'error': 'One-time Paper AI apply override has already been used'}
        return await ai_conference(source='manual_apply_once', bypass_sample_gate=True)
    except Exception as e:
        return {'ok': False, 'error': str(e)}


@app.post('/api/nightly-review')
async def review():
    try:
        return await nightly_review()
    except Exception as e:
        return {'ok': False, 'error': str(e)}