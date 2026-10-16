# CHANGELOG — DEV-002 X Topic Editor / X BOT

## 2026-10-16

### テーマ偏り・クローラー改善
- ChatGPT Workerを`v0.1.62`へ更新し、通常キューとHeavy再処理の両方を固定テーマリングでラウンドロビン化。
- topiccrawlerを`v0.3.5`へ更新。
  - Bing RSS取得の一時失敗を1回自動リトライ。
  - テーマ別に query total / ok / error count / error detail をstatusへ記録。
  - URL解決失敗・5xx・timeout・接続系エラーを即seen化せず再試行。
  - 東京大学テーマで「東大/東京大学」「学長/総長/選考」別名グループを追加し、誤irrelevant判定を修正。
- 取りこぼしていた「東大学長選考『重要な問題提起』…」を修正後に正常なAI候補としてemitできることを確認。
- xwatch-source-watchを`v0.1.4`へ更新し、cronと実チェック時刻のズレで30分監視が実質60分になる問題を90秒猶予で修正。

### NPO/公的資金 一次情報監視強化
- `public-funds-npo` はニュース検索を補助とし、一次情報監視を主力化。
- `xwatch-source-watch v0.1.5` へ更新し、監視ページごとの `required_any_terms` / `exclude_terms` に対応。広い官公庁ページでも無関係な新規リンクを候補化しにくくした。
- NPO一次情報の定点監視を11本から18本へ拡張。
  - 内閣府NPO 認定・特例認定取消一覧
  - 改善命令違反による取消し
  - 事業報告書未提出による取消し
  - 会計検査院 検査結果
  - 会計検査院 注目の検査結果
  - 会計検査院 基金等の検査結果
  - 会計検査院 更新情報
- 新規7監視先を含む全37監視先をbaseline取得し、`errors=0`を確認。
- 会計検査院ページの実リンク選択テストで、採用情報は除外し、基金・補助・検査結果の具体ページを選択することを確認。
- NPO検索は公金トラブルだけでなく、採択・交付決定・委託事業・助成事業・公募・契約も探索対象へ拡張。
- `topiccrawler v0.3.6` で query spec の `required_any_terms` に対応し、Web検索ノイズを抑制。

### Site sync payload肥大化対策
- Source Watch拡張時に `HTTP 413 payload_too_large` を検知。
- `xwatch-site-agent v0.4.8` へ更新し、Pi側の全履歴は保持したままSite同期対象を最新 history 60 / lifecycle 80 / Deep Dive 30件へ制限。
- 同期payloadを約873KBから約649KBへ削減し、Site sync `ok:true`、Active Alert 0件まで復旧。

### AI/Deep Dive
- ChatGPT WorkerはProject固定指示方式で稼働。
- Deep Dive専用Project `XWatch DeepDive` を作成し、deep-dive-ai-input `v0.1.3` / deep-dive-ai-worker `v0.1.6` へ更新。
- Deep Dive Skill本文を毎回送る旧方式を廃止し、固定指示 + 動的入力方式へ移行。
- Deep Dive実候補でPASS・DEEPDIVE_JSON取得・チャット削除まで確認。

### テーマ稼働状況の表示データ拡張
- xwatch-statusを`v0.2.6`へ更新。
- Site同期payloadの `status.topic_activity[topic_id]` に以下を追加。
  - `today_ai_judged`
  - `today_new_candidates`
  - `today_heavy_reprocessed`
  - `current_waiting`
  - `current_inbox`
  - `current_processing`
  - `current_heavy`
- 「本日AI判定」だけでは当日新規と過去バックログ/Heavy再処理を区別できないため、Site一覧では「本日新規候補 / Heavy再処理 / 現在待ち」も併記する方針を確定。
- Site内部ソースは引き続き取得経路待ち。Pi側のデータ生成・同期は完了。

## 2026-10-06

### 監視対象拡張
- 既存2テーマに加えて以下3テーマを追加し、稼働テーマを5件へ拡張。
  - `education-governance` 教育機関ガバナンス・学長選考ウォッチ
  - `kurdish-incidents-japan` クルド人関連事件 全国ウォッチ
  - `public-funds-npo` 公的資金・NPO/公益団体ウォッチ
- `public-funds-npo` は東京限定ではなく全国対象。大阪を含む全国を監視。
- 新規テーマは一次情報優先、推測抑制、テーマ固有のanalysis_policy / analysis_fieldsを追加。

### crawler / TopicBot改善
- TopicBot `0.4.1`。
- topiccrawler `0.2.5`。
- x-direct `0.1.1`、configured targets 44、errors 0を確認。
- crawler queryに`required_terms`を追加し、NPO/クルド関連で検索ノイズを抑制。
- `public-funds-npo`で誤ヒットしたWikipedia「2」、コトバンク「二」等の候補をnoise扱いへ移動。
- 新規テーマ追加後の手動巡回で`checked=65 emitted=2 inbox=3`を確認。
- Site同期でtopics=5を受理し、既存queue/history/lifecycleを維持。

### 投稿文・出典処理
- TopicBot側で投稿末尾へURLのみを自動付加する方式へ整理。
- AI Skill側は`source_url`へ代表HTTPS URLを返し、post本文へ「出典:」ラベルやURLを重複記載しないルールへ変更。
- 既存のsource必須・重複防止・文字数管理を維持。

### AI判定・Worker
- ChatGPT Worker `0.1.10`。
- AI判定件数は新規テーマ追加後も増加しており、巡回→候補→Worker→判定の主経路が動作していることを確認。
- 13:53 JST頃のWorker状態: inbox 3 / processing 0 / done 42 / failed 2 / results 50 / db_rows 16。
- `education-governance`の2候補でfailedを確認。
- 原因はAI無応答ではなく、AIが`current_state`内へ未エスケープの`META_JSON={...}`を入れたことで外側の`TOPICBOT_JSON`が不正JSONとなり、Worker parserが読めずtimeout扱いになったこと。
- 次回修正で構造化出力形式を安全化し、failedは原因確認後に再試行する。

### Site UI再設計方針
- ダッシュボードを「日常監視・判断」に特化する方針を確定。
- 正常なAndroid / Pi / Render / Site Sync表示をコンパクト化。
- KPIを稼働テーマ / 本日投稿 / AI判定 / HOLD / 警告・エラーへ整理。
- 「要対応」セクションを追加。
- テーマカードを一覧テーブル化。
- 最近の動きを表示。
- Worker詳細、同期詳細、安全操作キュー詳細等は「システム」へ移動。
- 共通スケジュールは「設定」へ移動。
- UI改修ではDB/API/TopicBot処理を変更しない。

### 開発記録運用
- 長期チャット・チャット分割に備え、DEV-002の正式履歴をGitと開発管理センターへ随時残す運用へ変更。
- 機能追加、仕様変更、テーマ追加、バージョン更新、障害対応、API変更、重要設計判断、運用確認を履歴追加トリガーとする。

## 2026-10-01〜2026-10-05

### Android ChatGPT Worker
- Android版ChatGPTをAI判定Workerとして利用する実運用経路を成立。
- 候補MarkdownをChatGPTへ投入し、`TOPICBOT_JSON`形式でPOST / HOLD / IGNOREを返す構成を実装。
- `source_url`必須、unverified POST禁止、importance 0〜100、evidence分類を検証。
- Android Worker / Pi / Siteの役割を分離し、投稿・判定履歴を保持。

### X Direct / 情報取得
- X上の監視対象をx-directで巡回する仕組みを追加。
- 東京大学総長ウォッチで候補者名、文科省等を追跡。
- Google News 503、Bing News日時不正、MSN取得不可等の取得元制約を確認し、RSS・Web検索・X Directを組み合わせる方針へ。

## 2026-09-29〜2026-09-30

### Phase2 / Phase3
- Phase2同期APIを運用。
  - `GET /api/topicbot/ping`
  - `POST /api/topicbot/sync`
- Phase3 Relayを追加。
  - `GET /xwatch/commands`
  - `POST /xwatch/commands/result`
- Site側操作API経由で以下コマンドを扱う構成を確立。
  - `approve_hold`
  - `reject_hold`
  - `enable_topic`
  - `disable_topic`
  - `run_crawler_now`
- Siteのスケジュール数制約を踏まえ、定期巡回はPi側Cron中心へ分離。

## 2026-09-25〜2026-09-28

### 初期構築
- X Topic Editor / Xウォッチ管理センターを構築。
- テーマ別収集→AI精査→評価→引用整理→投稿文→人間承認の流れを採用。
- 自動公開のみで完結させずHuman-in-the-loopを維持。
- 初期テーマ:
  - `tokyo-u-president`
  - `henoko-capsize`
- UI: ダッシュボード / ウォッチ / 保留 / 投稿履歴 / システム。
- 投稿閾値、HOLD閾値、1時間/1日上限、日次まとめをテーマ単位で管理。
- Siteは`private/custom`のまま運用。
