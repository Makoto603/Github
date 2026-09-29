# Handoff

## Current Phase
実装

## Current Status
ACTIVE

## Current Work
ChatGPT→OAuth 2.1→Render MCP Bridge v0.2.1→非公開Site API→Site DBの読み取り経路は完成し、通常運用中。

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
1. Site DB上のDEV-001表示をWork/Site編集でGit正式状態へ合わせる。
2. refresh tokenによる継続利用を確認する。
3. 残案件のGit移行を継続する。

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
