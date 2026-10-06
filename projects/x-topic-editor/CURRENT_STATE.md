# CURRENT STATE

## Site
https://x-topic-editor.neconini.chatgpt.site

## 開発管理
- Project ID: DEV-002
- Name: X Topic Editor / X BOT
- Phase: 実装
- Status: ACTIVE
- Source of truth: Git + 開発管理センター
- Siteは `private/custom` を維持する

## 現在の構成
- Xウォッチ管理センターを運用中
- Raspberry Pi上のTopicBot / topiccrawler / x-directが候補収集・巡回を担当
- Android版ChatGPT Workerが候補MarkdownをAI判定し、POST / HOLD / IGNOREを生成
- Pi → Site同期API（Phase2）と操作Relay（Phase3）を運用
- 人間承認を残し、自動公開のみで完結させないHuman-in-the-loop運用

## 稼働テーマ（2026-10-06）
1. `tokyo-u-president` — 東京大学総長ウォッチ
2. `henoko-capsize` — 辺野古沖転覆事故ウォッチ
3. `education-governance` — 教育機関ガバナンス・学長選考ウォッチ
4. `kurdish-incidents-japan` — クルド人関連事件 全国ウォッチ
5. `public-funds-npo` — 公的資金・NPO/公益団体ウォッチ

`public-funds-npo` は東京限定ではなく全国対象。大阪を含む全国の公的資金、補助金、委託、監査、行政処分、訴訟、公式声明等を追跡する。

## 定期実行
- テーマ巡回: 08:00〜20:00 毎時
- 日次まとめ: 20:30
- Siteスケジュール数制約を避けるため、巡回はPi側Cronを中心に実行

## 主なAPI / 操作
### Phase2同期
- `GET /api/topicbot/ping`
- `POST /api/topicbot/sync`

### Phase3操作Relay
- `GET /xwatch/commands`
- `POST /xwatch/commands/result`

### 対応コマンド
- `approve_hold`
- `reject_hold`
- `enable_topic`
- `disable_topic`
- `run_crawler_now`

既存API互換、DB、HOLD、投稿履歴、AI判定履歴、lifecycle、alerts、Wayback情報を維持する。

## Raspberry Pi / Worker 現在値（2026-10-06 13:53 JST頃）
- TopicBot: `0.4.1`
- topiccrawler: `0.2.5`
- ChatGPT Worker: `0.1.10`
- x-direct: `0.1.1`
- x-direct configured targets: 44
- x-direct errors: 0
- Worker: inbox 3 / processing 0 / done 42 / failed 2 / results 50 / db_rows 16

## 2026-10-06の運用確認
- 新規3テーマ追加後、crawler `checked=65 emitted=2 inbox=3` を確認
- Site同期はtopics=5を受理し、既存queue/history/lifecycleを維持
- AI判定件数は追加テーマ後も増加しており、巡回→候補→Worker→判定の主経路は稼働
- x-directは巡回継続、エラーなし

## 既知課題
### ChatGPT Worker structured output
`education-governance` の2候補でWorker failedを確認。
ChatGPT自体は回答を返しているが、`current_state` 内へ `META_JSON={...}` を未エスケープで埋め込んだため、外側の `TOPICBOT_JSON` が不正JSONになりWorkerが解析できず、最終的にresponse timeout扱いとなった。

つまりAI無応答ではなく、構造化出力フォーマット不整合が原因。次の修正で、ネストしたJSONを安全な形式へ変更し、既存failedを原因確認後に再試行する。

## Site UI改修中
ダッシュボードを「日常監視・判断」に特化する方向で再設計中。

- 正常なAndroid / Pi / Render / Site Syncはコンパクト表示
- KPI: 稼働テーマ / 本日投稿 / AI判定 / HOLD / 警告・エラー
- 「要対応」セクションを追加
- テーマカードを一覧テーブル化
- 最近の動きを表示
- システム詳細、Worker詳細、同期詳細、安全操作キュー詳細は「システム」へ移動
- 共通スケジュールは「設定」へ移動
- DB/API/TopicBot処理は今回のUI改修では変更しない

## 運用ルール
今後、以下のいずれかが発生した時点でDEV-002の正式履歴を追記する。

- 機能追加・仕様変更
- テーマ追加・主要検索条件変更
- Bot / Worker / crawlerのバージョン更新
- 障害・原因特定・修正
- API / Relay / 同期構成変更
- Site UIの大きな変更
- 重要な設計判断
- 受入確認・運用結果

チャットが長期化・分割されても、正式履歴はGitおよび開発管理センターへ随時反映する。

## 次
1. ChatGPT Workerの`META_JSON`による不正JSONを修正
2. failed 2件を原因確認後に安全に再試行
3. Siteダッシュボード再設計を完了
4. 新規3テーマの候補・AI判定・POST/HOLD比率を数時間〜数日観測
5. 開発管理センター側のDEV-002履歴を最新Git状態へ同期
