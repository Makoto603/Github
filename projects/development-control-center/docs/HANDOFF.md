# Handoff

## Current Phase
実装

## Current Status
ACTIVE

## Current Work
Site非公開のままBridge経由で15案件を読み取る経路は完成済み。MCP Bridge v0.2.0へOAuth 2.1 Authorization Code + PKCE(S256)とoffline_access refresh tokenを実装し、RenderでOAuth enabled/configured=trueまで確認した。現在はChatGPT側の既存no-auth接続をOAuthとして一度だけ再リンクする段階。

## Verified
- Site DB: 15案件維持
- list_projects: 15件取得成功
- get_project(DEV-001): 成功
- DEV-001 syncVersion: 5
- unknown project: 404 project_not_found
- DEV-010およびBIZ案件を含むGit未接続案件を維持
- MCP_ALLOW_WRITES=false / writesEnabled=false
- Site DB初期化・案件再登録・自動Git同期・UI変更なし
- Bridge v0.2.0 TypeScript build成功
- OAuth 2.1 Authorization Code + PKCE(S256)
- protected resource metadata / authorization server metadata
- Dynamic Client Registration
- scopes: dcc.read / offline_access
- access token TTL: 1時間
- refresh token TTL: 90日
- Render起動ログ: MCP OAuth: enabled=true configured=true
- OAuth有効化後、既存no-auth接続は認証なしでは利用できない

## Next Work
1. ChatGPTで https://development-control-center-mcp.onrender.com/mcp をOAuth認証として再接続する。
2. 初回だけ所有者用ペアリング資格情報を入力する。
3. ping / server_info / list_projects / get_project を確認する。
4. server_infoで backend configured=true、OAuth enabled/configured=true、writesEnabled=falseを確認する。
5. list_projects=15、DEV-001詳細、syncVersion、未知ID404を再確認する。
6. 接続成功後、所有者用ペアリング資格情報をローテーションする。
7. refresh tokenで通常利用時の再認証が不要なことを確認する。

## Blocker
サーバー側ブロッカーは解消。ChatGPT側の一度きりのOAuth再リンク待ち。

## Cautions
- Siteはcustom非公開のまま維持する。
- Site DBを取得元とし、Gitに存在しない案件を削除しない。
- 読み取りAPIからGit fetch/sync、DB更新、履歴追加を行わない。
- Siteの既存UI、履歴、CR、Decision Log、Handoff、既存WebMCPを維持する。
- SecretをGit、Site DB、ブラウザJS、ログ、APIレスポンスへ記録しない。
- MCP_ALLOW_WRITES=falseを維持する。
- OAuth signing secretは絶対にユーザー表示しない。

## Completion Criteria
ChatGPT側でOAuth接続が完了し、通常チャットから15案件の一覧と詳細を再取得できること。以後の接続はaccess token/refresh tokenで自動認証され、通常利用で所有者用ペアリング資格情報の再入力を要求しないこと。
