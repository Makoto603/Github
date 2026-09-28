from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = 'Paper Trading Lab v0.29.4.1'
    db_path: str = 'data/paper_trading.db'

    # v0.24: crypto is the canonical experiment mode.
    asset_mode: str = 'crypto'
    market_provider: str = 'alpaca'

    alpaca_api_key: str = ''
    alpaca_secret_key: str = ''

    # Stock settings are kept only for backwards compatibility with old .env files.
    alpaca_data_feed: str = 'iex'
    symbols: str = 'AAPL,MSFT,NVDA,AMZN,GOOGL,META,AMD,SPY'

    # Crypto settings actually used when ASSET_MODE=crypto.
    crypto_location: str = 'us'
    crypto_symbols: str = 'BTC/USD,ETH/USD,SOL/USD,XRP/USD,DOGE/USD,ADA/USD,AVAX/USD,LINK/USD,LTC/USD,BCH/USD,AAVE/USD,ARB/USD,BAT/USD,BONK/USD,CRV/USD,DOT/USD,FIL/USD,GRT/USD,LDO/USD,ONDO/USD,PAXG/USD,PEPE/USD,POL/USD,RENDER/USD,SHIB/USD,SUSHI/USD,UNI/USD,WIF/USD,XTZ/USD,YFI/USD'

    # v0.28: auto-discover active/tradable Alpaca crypto pairs.
    crypto_universe_auto: bool = True
    crypto_universe_refresh_minutes: int = 15
    crypto_prescan_refresh_minutes: int = 5
    crypto_prescan_limit: int = 50
    crypto_blacklist: str = ''
    crypto_latest_batch_size: int = 50
    crypto_history_batch_size: int = 10

    # v0.29.4: continuously retain 1-minute OHLCV for the full tradable universe.
    crypto_record_all_universe: bool = True
    crypto_recorder_bootstrap_per_cycle: int = 10
    crypto_recorder_min_history_bars: int = 360

    # v0.29.2: shared Alpaca REST snapshot/cache to avoid dashboard rate-limit storms.
    alpaca_snapshot_ttl_seconds: int = 15
    alpaca_stale_if_error_seconds: int = 180
    alpaca_rate_limit_backoff_seconds: int = 10
    dashboard_refresh_seconds: int = 20

    max_symbol_weight: float = 0.10
    max_positions: int = 8
    crypto_max_positions: int = 8
    max_drawdown_stop: float = 0.15

    max_gross_exposure_ratio: float = 0.80
    crypto_max_gross_exposure_ratio: float = 0.80
    reserve_cash_ratio: float = 0.20
    leverage_enabled: bool = False
    shorting_enabled: bool = False

    poll_seconds: int = 60
    historical_bars: int = 360
    chart_bars: int = 120

    paper_broker_enabled: bool = True

    nightly_hour_jst: int = 6
    nightly_minute_jst: int = 30

    ollama_enabled: bool = False
    ollama_url: str = 'http://localhost:11434'
    ollama_model: str = 'qwen3:8b'
    ai_conference_roles: int = 4

    model_config = SettingsConfigDict(
        env_file='.env',
        case_sensitive=False,
        extra='ignore',
    )

    @staticmethod
    def _split(value):
        return [s.strip().upper() for s in value.split(',') if s.strip()]

    @property
    def symbol_list(self):
        # IMPORTANT:
        # Old v0.22/v0.23 .env files contain SYMBOLS=AAPL,...
        # In crypto mode those legacy equity symbols are intentionally ignored.
        if self.asset_mode.lower() == 'crypto':
            return self._split(self.crypto_symbols)
        return self._split(self.symbols)

    @property
    def is_crypto(self):
        return self.asset_mode.lower() == 'crypto'


    @property
    def effective_max_positions(self):
        return int(self.crypto_max_positions if self.is_crypto else self.max_positions)

    @property
    def effective_max_gross_exposure_ratio(self):
        return float(self.crypto_max_gross_exposure_ratio if self.is_crypto else self.max_gross_exposure_ratio)


settings = Settings()