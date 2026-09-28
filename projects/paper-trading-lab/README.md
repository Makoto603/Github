# Paper Trading Lab v0.29.4.1 — Timestamp Parser Fix

This is a small maintenance patch over v0.29.4.

## Fixed

Strategy v3 builds 5m / 15m / 30m candles from stored 1-minute timestamps.

Alpaca timestamps are ISO-8601, but fractional-second precision may vary.
Pandas was being asked to infer the format automatically, which produced many:

`UserWarning: Could not infer format ... falling back to dateutil`

messages while evaluating multiple symbols.

`strategy.py` now explicitly parses timestamps using:

`format='ISO8601'`

with UTC normalization.

This removes the repeated warning and avoids slower element-by-element
`dateutil` fallback on current pandas versions.

A compatibility fallback remains for older pandas releases.

## No strategy change

This patch does NOT change:

- Strategy Architecture v3
- 1m / 5m / 15m / 30m rules
- Official Experiment state
- Strategy Race epoch
- all-Universe recorder
- Alpaca 429 protection
- risk limits