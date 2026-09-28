import sqlite3
from pathlib import Path
from contextlib import contextmanager
from .config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS account (
    id INTEGER PRIMARY KEY CHECK(id=1),
    cash REAL NOT NULL,
    starting_equity REAL NOT NULL,
    peak_equity REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS positions (
    symbol TEXT PRIMARY KEY,
    qty REAL NOT NULL,
    avg_price REAL NOT NULL,
    stop_price REAL,
    take_profit_price REAL,
    opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    qty REAL NOT NULL,
    price REAL NOT NULL,
    fee REAL NOT NULL DEFAULT 0,
    realized_pnl REAL,
    reason TEXT
);

CREATE TABLE IF NOT EXISTS equity_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    equity REAL NOT NULL,
    cash REAL NOT NULL,
    drawdown REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS prices (
    symbol TEXT NOT NULL,
    ts TEXT NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume REAL NOT NULL DEFAULT 0,
    PRIMARY KEY(symbol, ts)
);

CREATE TABLE IF NOT EXISTS strategy_config (
    id INTEGER PRIMARY KEY CHECK(id=1),
    ema_fast INTEGER NOT NULL,
    ema_slow INTEGER NOT NULL,
    rsi_period INTEGER NOT NULL,
    rsi_buy REAL NOT NULL,
    rsi_sell REAL NOT NULL,
    atr_period INTEGER NOT NULL,
    atr_stop REAL NOT NULL,
    atr_take REAL NOT NULL,
    ema_exit_confirm_bars INTEGER NOT NULL DEFAULT 3,
    ema_entry_min_spread_bps REAL NOT NULL DEFAULT 2.0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS nightly_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metrics_json TEXT NOT NULL,
    current_config_json TEXT NOT NULL,
    candidate_config_json TEXT,
    approved INTEGER NOT NULL DEFAULT 0,
    review_text TEXT
);

CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS alpaca_fills (
    order_id TEXT PRIMARY KEY,
    filled_at TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    qty REAL NOT NULL,
    price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS strategy_race_accounts (
    strategy_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    starting_equity REAL NOT NULL,
    cash REAL NOT NULL,
    peak_equity REAL NOT NULL,
    realized_pnl REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS strategy_race_positions (
    strategy_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    qty REAL NOT NULL,
    avg_price REAL NOT NULL,
    stop_price REAL,
    take_profit_price REAL,
    opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(strategy_id, symbol)
);

CREATE TABLE IF NOT EXISTS strategy_race_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id TEXT NOT NULL,
    ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    qty REAL NOT NULL,
    price REAL NOT NULL,
    realized_pnl REAL,
    reason TEXT
);

CREATE TABLE IF NOT EXISTS strategy_race_equity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id TEXT NOT NULL,
    ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    equity REAL NOT NULL,
    drawdown REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS strategy_race_configs (
    strategy_id TEXT PRIMARY KEY,
    config_json TEXT NOT NULL,
    generated_reason TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS champion_position_state (
    symbol TEXT PRIMARY KEY,
    entry_price REAL NOT NULL,
    entry_atr REAL NOT NULL,
    stop_price REAL NOT NULL,
    take_profit_price REAL NOT NULL,
    initialized_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bot_order_context (
    order_id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    reason TEXT NOT NULL,
    signal_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crypto_universe (
    symbol TEXT PRIMARY KEY,
    name TEXT,
    status TEXT,
    tradable INTEGER NOT NULL DEFAULT 0,
    raw_json TEXT,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crypto_blacklist (
    symbol TEXT PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'manual',
    reason TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS paper_experiments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_no INTEGER NOT NULL,
    name TEXT NOT NULL,
    phase TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    start_equity REAL NOT NULL,
    end_equity REAL,
    start_config_json TEXT NOT NULL,
    end_config_json TEXT,
    summary_json TEXT,
    race_snapshot_json TEXT,
    ai_conference_from_id INTEGER,
    ai_conference_to_id INTEGER,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_paper_experiments_status
ON paper_experiments(status, experiment_no);

CREATE TABLE IF NOT EXISTS ai_conferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source TEXT NOT NULL,
    metrics_json TEXT NOT NULL,
    exit_breakdown_json TEXT NOT NULL,
    current_config_json TEXT NOT NULL,
    quant_text TEXT,
    risk_text TEXT,
    engineer_text TEXT,
    chair_text TEXT,
    candidate_config_json TEXT,
    approved INTEGER NOT NULL DEFAULT 0,
    apply_block_reason TEXT
);
"""

DEFAULT_STRATEGY = (1, 12, 26, 14, 38.0, 68.0, 14, 1.8, 2.4, 3, 2.0)

def _db_path():
    p = Path(settings.db_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    return p

def init_db():
    """Idempotent startup migration. Safe for existing v0.21/v0.22/v0.23 DBs."""
    path = _db_path()
    with sqlite3.connect(path) as conn:
        conn.row_factory = sqlite3.Row
        conn.executescript(SCHEMA)
        cols = {r[1] for r in conn.execute("PRAGMA table_info(strategy_config)").fetchall()}
        if 'ema_exit_confirm_bars' not in cols:
            conn.execute("ALTER TABLE strategy_config ADD COLUMN ema_exit_confirm_bars INTEGER NOT NULL DEFAULT 3")
        if 'ema_entry_min_spread_bps' not in cols:
            conn.execute("ALTER TABLE strategy_config ADD COLUMN ema_entry_min_spread_bps REAL NOT NULL DEFAULT 2.0")

        row = conn.execute("SELECT id FROM account WHERE id=1").fetchone()
        if not row:
            # Legacy local account is kept only for compatibility.
            conn.execute(
                "INSERT INTO account(id,cash,starting_equity,peak_equity) VALUES(1,0,0,0)"
            )

        row = conn.execute("SELECT id FROM strategy_config WHERE id=1").fetchone()
        if not row:
            conn.execute(
                """INSERT INTO strategy_config
                (id,ema_fast,ema_slow,rsi_period,rsi_buy,rsi_sell,atr_period,atr_stop,atr_take,ema_exit_confirm_bars,ema_entry_min_spread_bps)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                DEFAULT_STRATEGY,
            )

        conn.commit()

@contextmanager
def connect():
    # Defensive migration: even if a code path is hit before lifespan init completes,
    # tables are guaranteed to exist.
    path = _db_path()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(SCHEMA)
        cols = {r[1] for r in conn.execute("PRAGMA table_info(strategy_config)").fetchall()}
        if 'ema_exit_confirm_bars' not in cols:
            conn.execute("ALTER TABLE strategy_config ADD COLUMN ema_exit_confirm_bars INTEGER NOT NULL DEFAULT 3")
        if 'ema_entry_min_spread_bps' not in cols:
            conn.execute("ALTER TABLE strategy_config ADD COLUMN ema_entry_min_spread_bps REAL NOT NULL DEFAULT 2.0")
        yield conn
        conn.commit()
    finally:
        conn.close()

def meta_get(key, default=None):
    with connect() as conn:
        row = conn.execute("SELECT value FROM app_meta WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default

def meta_set(key, value):
    with connect() as conn:
        conn.execute(
            "INSERT INTO app_meta(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, str(value)),
        )