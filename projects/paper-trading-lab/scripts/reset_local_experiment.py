from app.db import init_db, connect

TRACKING_TABLES = [
    'equity_history',
    'alpaca_fills',
    'bot_order_context',
    'champion_position_state',
    'strategy_race_positions',
    'strategy_race_trades',
    'strategy_race_equity',
    'strategy_race_configs',
    'strategy_race_accounts',
]

def main():
    print()
    print('Paper Trading Lab - NEW ALPACA ACCOUNT local baseline reset')
    print('This does NOT reset or recreate the Alpaca Paper account.')
    print('Use it only after intentionally switching to a fresh Alpaca Paper account.')
    print()
    print('PRESERVED: AI conferences, Nightly reviews, archived Paper experiments,')
    print('           market price history, Blacklist, strategy parameters, .env')
    print('RESET:     current account equity/fills, current Race, Champion stop/take state')
    print()

    init_db()
    with connect() as c:
        active = c.execute(
            "SELECT name FROM paper_experiments WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1"
        ).fetchone()
    if active:
        print('[BLOCKED] An official experiment is active:', active['name'])
        print('Do not reset the local account baseline during an active formal measurement.')
        input('Press Enter to close...')
        return

    confirm = input('Type RESET to continue: ').strip()
    if confirm != 'RESET':
        print('Cancelled.')
        return

    with connect() as c:
        for table in TRACKING_TABLES:
            c.execute(f'DELETE FROM {table}')

        keys = [r['key'] for r in c.execute('SELECT key FROM app_meta').fetchall()]
        for key in keys:
            if (
                key.startswith('alpaca_')
                or key.startswith('race_')
                or key.startswith('paper_ai_apply_override_')
                or key.startswith('pretest_final_tune_')
                or key.startswith('paper_experiment_active_')
                or key == 'paper_experiment_phase'
            ):
                c.execute('DELETE FROM app_meta WHERE key=?', (key,))

    print('Local account baseline reset complete.')
    print('Historical AI / archived experiment knowledge was preserved.')
    print('Start again with START.cmd.')

if __name__ == '__main__':
    main()