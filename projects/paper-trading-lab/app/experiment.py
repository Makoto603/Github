import json
from datetime import datetime, timezone

from .db import connect, meta_get, meta_set
from .metrics import calculate_metrics_since


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _loads(value, default):
    if value is None:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _conference_bounds():
    with connect() as c:
        row = c.execute(
            'SELECT MIN(id) AS first_id, MAX(id) AS last_id FROM ai_conferences'
        ).fetchone()
    return (
        int(row['first_id']) if row and row['first_id'] is not None else None,
        int(row['last_id']) if row and row['last_id'] is not None else None,
    )


def active_experiment():
    with connect() as c:
        row = c.execute(
            '''SELECT * FROM paper_experiments
            WHERE status='ACTIVE'
            ORDER BY experiment_no DESC, id DESC LIMIT 1'''
        ).fetchone()
    return dict(row) if row else None


def list_experiments(limit=20):
    with connect() as c:
        rows = c.execute(
            '''SELECT * FROM paper_experiments
            ORDER BY experiment_no DESC, id DESC LIMIT ?''',
            (int(limit),),
        ).fetchall()
    out=[]
    for row in rows:
        x=dict(row)
        x['summary']=_loads(x.pop('summary_json',None),{})
        x['start_config']=_loads(x.pop('start_config_json',None),{})
        x['end_config']=_loads(x.pop('end_config_json',None),{})
        x['race_snapshot']=_loads(x.pop('race_snapshot_json',None),{})
        out.append(x)
    return out


def experiment_mode():
    active=active_experiment()
    if active:
        return {'phase':'OFFICIAL','label':active['name'],'experiment_no':int(active['experiment_no'])}
    return {'phase':'PRETEST','label':'PRETEST','experiment_no':0}


def official_metrics(current_equity=None):
    active=active_experiment()
    if not active:
        return None
    metrics=calculate_metrics_since(active['started_at'],float(active['start_equity']),current_equity)
    return {
        'experiment_id':active['id'],
        'experiment_no':int(active['experiment_no']),
        'name':active['name'],
        'started_at':active['started_at'],
        'start_equity':float(active['start_equity']),
        **metrics,
    }


def archive_pretest(start_ts,start_equity,end_equity,start_config,end_config,summary,race_snapshot,note='Pretest archived before Official Experiment #1'):
    first_ai,last_ai=_conference_bounds()
    with connect() as c:
        existing=c.execute("SELECT id FROM paper_experiments WHERE phase='PRETEST' AND status='ARCHIVED' ORDER BY id DESC LIMIT 1").fetchone()
        if existing:
            return int(existing['id'])
        cur=c.execute(
            '''INSERT INTO paper_experiments(
            experiment_no,name,phase,status,started_at,ended_at,
            start_equity,end_equity,start_config_json,end_config_json,
            summary_json,race_snapshot_json,ai_conference_from_id,
            ai_conference_to_id,note)
            VALUES(0,'PRETEST','PRETEST','ARCHIVED',?,?,?,?,?,?,?,?,?,?,?)''',
            (
                start_ts or _now_iso(),_now_iso(),float(start_equity or end_equity or 0),float(end_equity or 0),
                json.dumps(start_config or {},ensure_ascii=False),json.dumps(end_config or {},ensure_ascii=False),
                json.dumps(summary or {},ensure_ascii=False),json.dumps(race_snapshot or {},ensure_ascii=False),
                first_ai,last_ai,note,
            ),
        )
        return int(cur.lastrowid)


def reset_current_race_for_official():
    with connect() as c:
        for table in ('strategy_race_positions','strategy_race_trades','strategy_race_equity','strategy_race_configs','strategy_race_accounts'):
            c.execute(f'DELETE FROM {table}')
        keys=[r['key'] for r in c.execute("SELECT key FROM app_meta WHERE key LIKE 'race_%'").fetchall()]
        for key in keys:
            c.execute('DELETE FROM app_meta WHERE key=?',(key,))


def create_official_experiment(started_at,start_equity,start_config):
    with connect() as c:
        existing=c.execute("SELECT * FROM paper_experiments WHERE status='ACTIVE' ORDER BY experiment_no DESC LIMIT 1").fetchone()
        if existing:
            return dict(existing)
        row=c.execute("SELECT MAX(experiment_no) AS n FROM paper_experiments WHERE phase='OFFICIAL'").fetchone()
        next_no=int(row['n'] or 0)+1
        name=f'OFFICIAL EXPERIMENT #{next_no}'
        first_ai,_=_conference_bounds()
        cur=c.execute(
            '''INSERT INTO paper_experiments(
            experiment_no,name,phase,status,started_at,start_equity,
            start_config_json,ai_conference_from_id,note)
            VALUES(?,?,?,?,?,?,?,?,?)''',
            (next_no,name,'OFFICIAL','ACTIVE',started_at or _now_iso(),float(start_equity),json.dumps(start_config or {},ensure_ascii=False),first_ai,'Formal Paper measurement: Week 1 validation, then Weeks 2-4 observation.'),
        )
        experiment_id=int(cur.lastrowid)
    meta_set('paper_experiment_phase','OFFICIAL')
    meta_set('paper_experiment_active_id',experiment_id)
    return active_experiment()


def experiment_status(current_equity=None):
    active=active_experiment(); archives=list_experiments(limit=10)
    if not active:
        return {'ok':True,'mode':'PRETEST','label':'PRETEST','active':None,'metrics':None,'final_tune_used':meta_get('pretest_final_tune_used','0')=='1','archives':archives}
    m=official_metrics(current_equity)
    now=datetime.now(timezone.utc)
    try:
        start=datetime.fromisoformat(str(active['started_at']).replace('Z','+00:00'))
        if start.tzinfo is None: start=start.replace(tzinfo=timezone.utc)
        elapsed=max((now-start.astimezone(timezone.utc)).total_seconds()/86400.0,0.0)
    except Exception:
        elapsed=0.0
    stage='WEEK 1 / VALIDATION' if elapsed<7 else ('WEEKS 2-4 / MEASUREMENT' if elapsed<30 else '30 DAYS COMPLETE')
    return {'ok':True,'mode':'OFFICIAL','label':active['name'],'active':{**dict(active),'elapsed_days':elapsed,'stage':stage},'metrics':m,'final_tune_used':True,'archives':archives}


def current_race_learning_context():
    """Compact Shadow Race evidence for AI; Champion metrics are supplied separately."""
    with connect() as c:
        accounts = [dict(r) for r in c.execute(
            'SELECT * FROM strategy_race_accounts ORDER BY strategy_id'
        ).fetchall()]
        configs = {
            r['strategy_id']: _loads(r['config_json'], {})
            for r in c.execute('SELECT * FROM strategy_race_configs').fetchall()
        }

        out = []
        for acc in accounts:
            sid = acc['strategy_id']
            rows = c.execute(
                "SELECT realized_pnl FROM strategy_race_trades "
                "WHERE strategy_id=? AND side='SELL' AND realized_pnl IS NOT NULL",
                (sid,),
            ).fetchall()
            pnls = [float(r['realized_pnl']) for r in rows]
            wins = [x for x in pnls if x > 0]
            losses = [x for x in pnls if x < 0]
            gp = sum(wins)
            gl = abs(sum(losses))
            pf = gp / gl if gl > 0 else (999.0 if gp > 0 else 0.0)
            expectancy = sum(pnls) / len(pnls) if pnls else 0.0
            eq = c.execute(
                'SELECT equity,drawdown FROM strategy_race_equity WHERE strategy_id=? ORDER BY id DESC LIMIT 1',
                (sid,),
            ).fetchone()
            current_equity = float(eq['equity']) if eq else float(acc['starting_equity'])
            start_equity = float(acc['starting_equity'])
            out.append({
                'strategy_id': sid,
                'name': acc['name'],
                'trades_closed': len(pnls),
                'win_rate': (len(wins) / len(pnls)) if pnls else None,
                'profit_factor': pf,
                'expectancy': expectancy,
                'return': (current_equity / start_equity - 1.0) if start_equity else 0.0,
                'latest_drawdown': float(eq['drawdown']) if eq else 0.0,
                'config': configs.get(sid, {}),
            })
    return out


def knowledge_context(limit=5):
    archives=[x for x in list_experiments(limit=limit) if x.get('status')=='ARCHIVED']
    compact=[]
    for x in archives:
        s=x.get('summary') or {}
        compact.append({
            'name':x.get('name'),'phase':x.get('phase'),'started_at':x.get('started_at'),'ended_at':x.get('ended_at'),
            'start_equity':x.get('start_equity'),'end_equity':x.get('end_equity'),'return':s.get('total_return'),
            'trades_closed':s.get('trades_closed'),'win_rate':s.get('win_rate'),'profit_factor':s.get('profit_factor'),
            'expectancy':s.get('expectancy'),'max_drawdown':s.get('max_drawdown'),'end_config':x.get('end_config'),
        })
    return {'instruction':'Archived experiments are historical evidence only. Do not add their P/L to the current experiment. Use them to avoid repeating failed parameter patterns.','archives':compact}