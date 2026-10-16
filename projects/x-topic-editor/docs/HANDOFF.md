# HANDOFF — DEV-002 X Topic Editor / X BOT

## 現在地
Xウォッチ管理センターは実運用中。Siteは`private/custom`を維持し、Raspberry PiのTopicBot / topiccrawler / x-direct、Android版ChatGPT Worker、Site同期・操作Relayを組み合わせて動作している。

現在の稼働テーマは5件。

- `tokyo-u-president`
- `henoko-capsize`
- `education-governance`
- `kurdish-incidents-japan`
- `public-funds-npo`

NPOテーマは東京限定ではなく全国対象。大阪も含む。

## 重要な現在値（2026-10-06 13:53 JST頃）
- TopicBot: `0.4.1`
- topiccrawler: `0.2.5`
- ChatGPT Worker: `0.1.10`
- x-direct: `0.1.1`
- x-direct configured targets: 44
- x-direct errors: 0
- Worker: inbox 3 / processing 0 / done 42 / failed 2 / results 50 / db_rows 16

## 直近の確認
- 新規3テーマ追加後のcrawler手動実行で`checked=65 emitted=2 inbox=3`。
- Site syncでtopics=5を受理。
- AI判定は増加中で、主経路は止まっていない。

## 最優先の未解決事項
### Worker structured outputエラー
`education-governance`の2候補がfailed。

ChatGPTは回答を返しているが、返却JSONが次のような構造になった。

```text
"current_state":"META_JSON={"institution":"東京大学", ... } ..."
```

内側のJSONが未エスケープのため、外側の`TOPICBOT_JSON`全体が壊れてWorker parserが読めず、timeout扱いとなる。

### 次の修正方針
- `META_JSON`を文字列内へ生JSONで埋め込まない。
- 可能ならトップレベルの別キーへ構造化情報を分離する、または安全にエスケープする。
- Worker側にも壊れたJSONを検出した際のエラー分類を追加する。
- failedを単純削除せず、原因修正後に重複防止を維持して再試行する。

## Site UI改修中
ダッシュボードを監視・判断用に簡素化する方向で改修中。

残すもの:
- 全体状態
- KPI
- 要対応
- テーマ稼働一覧
- 最近の動き

別ページへ移すもの:
- Worker詳細
- Android/Pi/Render/Site Sync詳細
- 安全操作キュー詳細
- 共通スケジュール
- 技術情報

今回のUI改修ではDB/API/TopicBot処理を変更しない。

## 既存互換性を壊さないこと
- Phase2同期API
- Phase3操作Relay
- `approve_hold`
- `reject_hold`
- `enable_topic`
- `disable_topic`
- `run_crawler_now`
- 既存DB
- HOLD
- 投稿履歴
- AI判定履歴
- lifecycle
- alerts
- Wayback情報
- Secret非露出

## 開発履歴の運用
今後は、意味のある変更が発生した時点で`docs/CHANGELOG.md`と開発管理センターDEV-002の履歴を更新する。

対象:
- 機能追加
- 仕様変更
- テーマ追加
- バージョン更新
- 障害・修正
- API/Relay変更
- Site UIの大きな変更
- 重要な設計判断
- 運用確認

## 次にやること
1. Workerの不正JSON問題を修正
2. failed 2件を安全に再試行
3. SiteダッシュボードUI改修を完了
4. 1時間・数時間・数日単位でAI判定件数とPOST/HOLD比率を観測
5. Git更新後、開発管理センターDEV-002へ同期


---

## 2026-10-16 — テーマ稼働状況の件数分解

テーマ一覧の「本日AI判定」だけでは、当日新規候補と過去バックログ/Heavy再処理を区別できず、テーマ偏りと誤認しやすいことを確認。

Pi側 `xwatch-status v0.2.6` で以下を同期payloadへ追加済み。

Path:

`status.topic_activity[topic_id]`

Shape:

```json
{
  "topic_id": "tokyo-u-president",
  "today_ai_judged": 13,
  "today_new_candidates": 9,
  "today_heavy_reprocessed": 1,
  "current_waiting": 1,
  "current_inbox": 1,
  "current_processing": 0,
  "current_heavy": 3
}
```

### Site一覧の推奨列

`テーマ | 状態 | 最終巡回 | 本日AI判定 | 本日新規候補 | Heavy再処理 | 現在待ち | 本日投稿`

- 本日AI判定: `today_ai_judged`
- 本日新規候補: `today_new_candidates`
- Heavy再処理: `today_heavy_reprocessed`
- 現在待ち: `current_waiting`
- Heavy待ちは必要なら現在待ちセルの補助表示として `current_heavy`
- 古いpayloadで `topic_activity` が無い場合は従来表示へフォールバック

### 定義
- 本日新規候補: workerへ到達した候補のうち `found_at` が本日
- Heavy再処理: 本日Heavyから選択され、AI判定PASSまで完了した一意候補
- 現在待ち: `inbox + processing`
- Heavy待ち: 現在heavyキューに残る件数

Site内部ソースは現在も取得経路待ち。Pi側データ追加とSite同期は完了済み。
