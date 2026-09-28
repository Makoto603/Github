# CURRENT STATE

## Version
v0.29.4.1

## 現在工程
受入テスト

## 状態
ACTIVE

## 最新更新
v0.29.4.1 は v0.29.4 に対する保守パッチ。
1分足から5m / 15m / 30mを構築するStrategy v3で、AlpacaのISO-8601 timestampをPandasが自動推測していたため発生していた警告と低速fallbackを修正した。

`strategy.py` で `format='ISO8601'` とUTC正規化を明示し、古いPandas向けfallbackを残している。

## 変更していないもの
- Strategy Architecture v3
- 1m / 5m / 15m / 30m rules
- Official Experiment state
- Strategy Race epoch
- all-Universe recorder
- Alpaca 429 protection
- risk limits

## 次の作業
Paper Tradingを継続し、注文整合性・履歴反映・429発生状況・Strategy Race成績を評価する。

## Git運用
実APIキーやローカル状態はGitに入れない。
`.env.example` のみ管理する。
