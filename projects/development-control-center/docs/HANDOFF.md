# Handoff

## Current Phase
実装

## Current Status
ACTIVE

## Current Work
OAuth付きBridge v0.2.1のMCP取得とSiteの認証付きGit再照合を確認。Git接続はCONNECTED、Site DBは15案件、Git Registryは10件。

## Historical Observation (2026-09-30 11:10, resolved)
- Site DB 15案件、DEV-001 syncVersion=5。Site表示がGit正式記録より古い。
- Site Git再照合はHTTP 403でSTALE。前回Git同期状態はSYNCED。
- 現セッションのMCPツールはInternal error。RenderのBridge配備はliveで、原因未確定。

## Recovery Check (2026-09-30 13:30)
- Render OAuth configured=true、MCP ping / list_projects / get_projectが成功
- Site Secret `GITHUB_TOKEN` を反映したSite v11で認証付きGit再照合HTTP 200、CONNECTED、Registry 10件
- Site DB 15案件、DEV-001 syncVersion=9（管理記録・履歴更新後）
- `lastGitSyncAt` 不変。Gitから案件を同期していない
- 403とMCP Internal errorは解消済み。refresh tokenの更新動作自体は未検証

## Verified
- Site DB: 15案件維持
- list_projects: 15件取得成功
- get_project(DEV-001): 成功
- DEV-001 syncVersion: 9（2026-09-30の更新後）
- unknown project: 404 project_not_found
- DEV-010およびBIZ案件を含むGit未接続案件を維持
- MCP_ALLOW_WRITES=false / writesEnabled=false
- Site DB初期化・案件再登録・自動Git同期・UI変更なし
- Bridge v0.2.1
- OAuth 2.1 Authorization Code + PKCE(S256)
- protected resource metadata / authorization server metadata
- Dynamic Client Registration
- scopes: dcc.read / offline_access
- access token TTL: 1時間
- refresh token TTL: 90日
- Render OAuth enabled/configured=true
- ChatGPT側OAuth初回接続完了
- 通常チャットからOAuth認証済みMCPツール呼び出し成功

## Next Work
1. refresh tokenで再ログインなしの継続利用を確認する。
2. Git正式文書・RegistryとSite DBの差分を定期点検する。差分を無言で上書きしない。
3. チャットからの限定更新を版管理・監査履歴付きで設計する。Git未接続案件の移行は別途判断する。

## Blocker
なし。

## Cautions
- Siteはcustom非公開のまま維持する。
- Site DBを取得元とし、Gitに存在しない案件を削除しない。
- 読み取りAPIからGit fetch/sync、DB更新、履歴追加を行わない。
- Siteの既存UI、履歴、CR、Decision Log、Handoff、既存WebMCPを維持する。
- SecretをGit、Site DB、ブラウザJS、ログ、APIレスポンスへ記録しない。
- MCP_ALLOW_WRITES=falseを維持する。

## Completion Criteria
通常チャットからOAuth認証済みMCP経由で15案件の一覧と詳細を取得でき、通常利用で毎回のペアリング認証を要求しないこと。

## 2026-09-30 Scoped write handoff
- Bridge v0.3.0 / Site v12を公開。Site DB 15案件、DEV-001のみの管理記録更新を予定。
- dcc.writeを再接続した後、既存案件1件の状態・工程・優先度、CR・Decisionを版付きで検証する。PASS/COMPLETEの根拠必須。既存の一括Git同期をBridgeから呼ばない。
- 案件別Git同期は確認済みcommit SHAとsyncVersionを指定する。開発チャットURLは明示された開発会話だけに登録し、Skill一括更新・日次点検では変更しない。
- Handoff Webの閲覧はスナップショットを追加しない。開発チャットURLが未登録ならリンクは表示しない。
