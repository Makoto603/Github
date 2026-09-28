from .db import connect, meta_get
from .symbols import canonical_symbol

def _roundtrip_records(fills, contexts):
    inventory = {}
    realized = []

    for f in fills:
        s = canonical_symbol(f['symbol'])
        side = str(f['side']).lower()
        qty = float(f['qty'])
        px = float(f['price'])

        st = inventory.setdefault(s, {'qty': 0.0, 'cost': 0.0})

        if side == 'buy':
            total = st['cost'] * st['qty'] + px * qty
            st['qty'] += qty
            st['cost'] = total / st['qty'] if st['qty'] else 0.0

        elif side == 'sell' and st['qty'] > 0:
            closing = min(qty, st['qty'])
            pnl = (px - st['cost']) * closing
            ctx = contexts.get(f['order_id'], {})
            realized.append({
                'order_id': f['order_id'],
                'symbol': s,
                'pnl': pnl,
                'reason': ctx.get('reason') or 'LEGACY_UNKNOWN',
                'filled_at': f['filled_at'],
            })
            st['qty'] -= closing
            if st['qty'] <= 1e-12:
                inventory[s] = {'qty': 0.0, 'cost': 0.0}

    return realized

def _quality(pnls, max_drawdown):
    wins = [x for x in pnls if x > 0]
    losses = [x for x in pnls if x < 0]

    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    avg_win = sum(wins) / len(wins) if wins else 0.0
    avg_loss = sum(losses) / len(losses) if losses else 0.0
    avg_loss_abs = abs(avg_loss)

    win_rate = len(wins) / len(pnls) if pnls else None
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0)
    payoff_ratio = avg_win / avg_loss_abs if avg_loss_abs > 0 else (999.0 if avg_win > 0 else 0.0)
    expectancy = sum(pnls) / len(pnls) if pnls else 0.0
    denom = avg_win + avg_loss_abs
    breakeven_win_rate = avg_loss_abs / denom if denom > 0 else None

    if not pnls:
        quality_label = 'COLLECTING DATA'
        quality_reason = 'No closed trades yet.'
    elif expectancy <= 0:
        quality_label = 'NEGATIVE EXPECTANCY'
        quality_reason = 'Average closed trade is losing money.'
    elif profit_factor < 1:
        quality_label = 'LOSSES DOMINATE'
        quality_reason = 'Gross losses exceed gross profits.'
    elif payoff_ratio < 1:
        quality_label = 'LOSS SIZE RISK'
        quality_reason = 'Average loss is larger than average win.'
    elif max_drawdown >= 0.10:
        quality_label = 'DRAWDOWN HIGH'
        quality_reason = 'Positive expectancy, but drawdown is high.'
    elif len(pnls) < 20:
        quality_label = 'EARLY POSITIVE'
        quality_reason = 'Positive so far, but the sample is still small.'
    else:
        quality_label = 'HEALTHY'
        quality_reason = 'Positive expectancy with acceptable loss structure.'

    return {
        'trades_closed': len(pnls),
        'wins': len(wins),
        'losses': len(losses),
        'win_rate': win_rate,
        'avg_win': avg_win,
        'avg_loss': avg_loss,
        'payoff_ratio': payoff_ratio,
        'gross_profit': gross_profit,
        'gross_loss': gross_loss,
        'profit_factor': profit_factor,
        'expectancy': expectancy,
        'breakeven_win_rate': breakeven_win_rate,
        'quality_label': quality_label,
        'quality_reason': quality_reason,
    }

def _symbol_breakdown(records):
    out = {}
    for rec in records:
        symbol = rec['symbol']
        b = out.setdefault(symbol, {
            'symbol': symbol, 'count': 0, 'wins': 0, 'losses': 0, 'total_pnl': 0.0,
        })
        b['count'] += 1
        b['total_pnl'] += float(rec['pnl'])
        if rec['pnl'] > 0:
            b['wins'] += 1
        elif rec['pnl'] < 0:
            b['losses'] += 1
    for b in out.values():
        b['avg_pnl'] = b['total_pnl'] / b['count'] if b['count'] else 0.0
        b['win_rate'] = b['wins'] / b['count'] if b['count'] else None
    return sorted(out.values(), key=lambda x: (x['total_pnl'], -x['count']))


def calculate_metrics():
    with connect() as c:
        eq = [dict(r) for r in c.execute(
            'SELECT equity,drawdown FROM equity_history ORDER BY id'
        )]
        fills = [dict(r) for r in c.execute(
            'SELECT * FROM alpaca_fills ORDER BY filled_at,order_id'
        )]
        contexts = {
            r['order_id']: dict(r)
            for r in c.execute('SELECT * FROM bot_order_context')
        }

    records = _roundtrip_records(fills, contexts)
    pnls = [x['pnl'] for x in records]

    max_drawdown = max(
        [float(x['drawdown']) for x in eq],
        default=0.0
    )

    start = float(meta_get('alpaca_starting_equity', 0) or 0)
    current = float(eq[-1]['equity']) if eq else start
    total_return = (current / start - 1) if start else 0.0

    breakdown = {}
    for rec in records:
        b = breakdown.setdefault(
            rec['reason'],
            {
                'reason': rec['reason'],
                'count': 0,
                'wins': 0,
                'losses': 0,
                'total_pnl': 0.0,
            }
        )
        b['count'] += 1
        b['total_pnl'] += rec['pnl']
        if rec['pnl'] > 0:
            b['wins'] += 1
        elif rec['pnl'] < 0:
            b['losses'] += 1

    for b in breakdown.values():
        b['avg_pnl'] = b['total_pnl'] / b['count'] if b['count'] else 0.0
        b['win_rate'] = b['wins'] / b['count'] if b['count'] else None

    return {
        **_quality(pnls, max_drawdown),
        'max_drawdown': max_drawdown,
        'total_return': total_return,
        'current_equity': current,
        'exit_breakdown': sorted(
            breakdown.values(),
            key=lambda x: x['count'],
            reverse=True
        ),
        'symbol_breakdown': _symbol_breakdown(records),
        'recent_closed_trades': records[-20:],
    }


def _parse_dt(value):
    from datetime import datetime, timezone
    if not value:
        return None
    s = str(value).strip().replace('Z', '+00:00')
    try:
        dt = datetime.fromisoformat(s)
    except Exception:
        try:
            dt = datetime.strptime(s, '%Y-%m-%d %H:%M:%S')
        except Exception:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def calculate_metrics_since(epoch_ts, starting_equity, current_equity=None):
    epoch = _parse_dt(epoch_ts)
    start = float(starting_equity or 0)

    with connect() as c:
        eq_all = [dict(r) for r in c.execute(
            'SELECT id,ts,equity FROM equity_history ORDER BY id'
        )]
        fills = [dict(r) for r in c.execute(
            'SELECT * FROM alpaca_fills ORDER BY filled_at,order_id'
        )]
        contexts = {
            r['order_id']: dict(r)
            for r in c.execute('SELECT * FROM bot_order_context')
        }

    records_all = _roundtrip_records(fills, contexts)
    records = []
    for rec in records_all:
        dt = _parse_dt(rec.get('filled_at'))
        if epoch is None or (dt is not None and dt >= epoch):
            records.append(rec)

    pnls = [float(x['pnl']) for x in records]

    eq_values = []
    for row in eq_all:
        dt = _parse_dt(row.get('ts'))
        if epoch is None or (dt is not None and dt >= epoch):
            eq_values.append(float(row['equity']))

    cur = float(current_equity) if current_equity is not None else (
        eq_values[-1] if eq_values else start
    )

    peak = start if start > 0 else (eq_values[0] if eq_values else cur)
    max_dd = 0.0
    for value in eq_values:
        peak = max(peak, value)
        if peak > 0:
            max_dd = max(max_dd, (peak - value) / peak)
    if peak > 0:
        max_dd = max(max_dd, (peak - cur) / peak)

    breakdown = {}
    for rec in records:
        b = breakdown.setdefault(
            rec['reason'],
            {'reason': rec['reason'], 'count': 0, 'wins': 0, 'losses': 0, 'total_pnl': 0.0}
        )
        b['count'] += 1
        b['total_pnl'] += rec['pnl']
        if rec['pnl'] > 0:
            b['wins'] += 1
        elif rec['pnl'] < 0:
            b['losses'] += 1

    for b in breakdown.values():
        b['avg_pnl'] = b['total_pnl'] / b['count'] if b['count'] else 0.0
        b['win_rate'] = b['wins'] / b['count'] if b['count'] else None

    return {
        **_quality(pnls, max_dd),
        'max_drawdown': max_dd,
        'total_return': (cur / start - 1.0) if start else 0.0,
        'current_equity': cur,
        'starting_equity': start,
        'pnl': cur - start,
        'exit_breakdown': sorted(
            breakdown.values(), key=lambda x: x['count'], reverse=True
        ),
        'symbol_breakdown': _symbol_breakdown(records),
        'recent_closed_trades': records[-20:],
    }