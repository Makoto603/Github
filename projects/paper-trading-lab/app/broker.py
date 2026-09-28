from .db import connect
from .config import settings

def positions():
    with connect() as c: return [dict(r) for r in c.execute('SELECT * FROM positions ORDER BY symbol')]

def mark(latest):
    with connect() as c:
        a=dict(c.execute('SELECT * FROM account WHERE id=1').fetchone()); ps=[dict(r) for r in c.execute('SELECT * FROM positions')]
        mv=sum(p['qty']*latest.get(p['symbol'],p['avg_price']) for p in ps); eq=a['cash']+mv; peak=max(a['peak_equity'],eq); dd=(peak-eq)/peak if peak else 0
        c.execute('UPDATE account SET peak_equity=? WHERE id=1',(peak,)); c.execute('INSERT INTO equity_history(equity,cash,drawdown) VALUES(?,?,?)',(eq,a['cash'],dd))
        return {'cash':a['cash'],'equity':eq,'drawdown':dd,'market_value':mv}

def buy(symbol,px,atr,cfg,reason,latest):
    with connect() as c:
        if c.execute('SELECT 1 FROM positions WHERE symbol=?',(symbol,)).fetchone(): return False,'already held'
        if c.execute('SELECT COUNT(*) n FROM positions').fetchone()['n']>=settings.max_positions: return False,'max positions'
        a=dict(c.execute('SELECT * FROM account WHERE id=1').fetchone()); ps=[dict(r) for r in c.execute('SELECT * FROM positions')]
        eq=a['cash']+sum(p['qty']*latest.get(p['symbol'],p['avg_price']) for p in ps); dd=(a['peak_equity']-eq)/a['peak_equity'] if a['peak_equity'] else 0
        if dd>=settings.max_drawdown_stop: return False,'drawdown stop'
        fill=px*(1+settings.slippage_bps/10000); alloc=min(eq*settings.max_symbol_weight,a['cash']); qty=alloc/fill; fee=qty*fill*settings.trading_fee_bps/10000; total=qty*fill+fee
        if total>a['cash']: return False,'cash'
        c.execute('UPDATE account SET cash=cash-? WHERE id=1',(total,)); c.execute('INSERT INTO positions(symbol,qty,avg_price,stop_price,take_profit_price) VALUES(?,?,?,?,?)',(symbol,qty,fill,fill-atr*cfg['atr_stop'],fill+atr*cfg['atr_take']))
        c.execute('INSERT INTO trades(symbol,side,qty,price,fee,reason) VALUES(?,?,?,?,?,?)',(symbol,'BUY',qty,fill,fee,reason)); return True,'bought'

def sell(symbol,px,reason):
    with connect() as c:
        p=c.execute('SELECT * FROM positions WHERE symbol=?',(symbol,)).fetchone()
        if not p: return False,'not held'
        fill=px*(1-settings.slippage_bps/10000); gross=p['qty']*fill; fee=gross*settings.trading_fee_bps/10000; pnl=(fill-p['avg_price'])*p['qty']-fee
        c.execute('UPDATE account SET cash=cash+? WHERE id=1',(gross-fee,)); c.execute('DELETE FROM positions WHERE symbol=?',(symbol,)); c.execute('INSERT INTO trades(symbol,side,qty,price,fee,realized_pnl,reason) VALUES(?,?,?,?,?,?,?)',(symbol,'SELL',p['qty'],fill,fee,pnl,reason)); return True,'sold'

def check_stops(latest):
    for p in positions():
        px=latest.get(p['symbol'])
        if px is None: continue
        if p['stop_price'] and px<=p['stop_price']: sell(p['symbol'],px,'ATR stop')
        elif p['take_profit_price'] and px>=p['take_profit_price']: sell(p['symbol'],px,'ATR take')