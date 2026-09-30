# Handoff

## Current Phase
実装

## Current Status
ACTIVE

## Current Work
OAuth 2.1付きBridge v0.2.1からSite DBの15案件取得まで完成。現在はGit再照合HTTP 403と、このセッションでのMCPツールInternal errorを切り分け中。

## Current Observation (2026-09-30)
- Site DB 15案件、DEV-001 syncVersion=5。Site表示がGit正式記録より古い。
- Site Git再照合はHTTP 403でSTALE。前回Git同期状態はSYNCED。
- 現セッションのMCPツールはInternal error。RenderのBridge配備はliveで、原因未確定。

## Verified
- Site DB: 15案件維持
- list_projects: 15件取得成功
- get_project(DEV-001): 成功
- DEV-001 syncVersion: 5
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
1. MCPツールのInternal errorを調査し、ping/list_projects/get_projectを再確認する。
2. Site Git再照合のHTTP 403を調査・解消し、Git/Site差分を確認する。データを一括上書きしない。
3. refresh tokenで継続利用できることを確認する。
4. 残案件のGit移行方針を整理する。Bridge書き込みは明示的な設計判断まで無効のまま維持する。

## Blocker
SiteのGit再照合はHTTP 403でSTALE。2026-09-30の本セッションでMCPツールがInternal error（原因未確定）。

## Cautions
- Siteはcustom非公開のまま維持する。
- Site DBを取得元とし、Gitに存在しない案件を削除しない。
- 読み取りAPIからGit fetch/sync、DB更新、履歴追加を行わない。
- Siteの既存UI、履歴、CR、Decision Log、Handoff、既存WebMCPを維持する。
- SecretをGit、Site DB、ブラウザJS、ログ、APIレスポンスへ記録しない。
- MCP_ALLOW_WRITES=falseを維持する。

## Completion Criteria
通常チャットからOAuth認証済みMCP経由で15案件の一覧と詳細を取得でき、通常利用で毎回のペアリング認証を要求しないこと。
