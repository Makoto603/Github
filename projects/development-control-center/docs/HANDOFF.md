# Handoff

## Current Phase
実装

## Current Status
ACTIVE

## Current Work
外部MCP Bridge向けSite DB読み取りAPIの実装・公開・単体接続検証に加え、Render上のMCP Bridge起動とChatGPT通常チャットからのping疎通まで完了。次はBridgeからSite DB読み取りAPIへ接続するBackend設定を行う。

## Verified
- GET /api/mcp/projects: Bearer Token認証付き。Site DB由来の15案件を返す
- GET /api/mcp/projects/:projectId: Site DB由来の詳細、履歴、CR、Decision、Handoffを返す
- Site Secret: DCC_MCP_READ_TOKEN（値は文書・ブラウザ・DBへ記録しない）
- 認証なし401、不正Token 401、正しいTokenで一覧200・15件、実在ID詳細200、存在しないID 404
- 実装前後の案件15件と関連テーブルは同一。DB初期化・Git同期なし
- 既存 /mcp とWebMCPは維持。Site source commit: cad509a88c2c96d627e7741ca58ab23f0f4875a9
- Bridge Repository: Makoto603/development-control-center-mcp
- Render上のBridge service: development-control-center-mcp / version 0.1.0
- ChatGPT通常チャット → 開発管理センタープラグイン → MCP Bridge の `ping` 成功
- `server_info`: phase=`phase-1-connectivity`、writesEnabled=false
- Backend未設定時の `list_projects` は `BACKEND_NOT_CONFIGURED`。偽データは返さない

## Next Work
1. RenderのサーバーSecretへ `DCC_BACKEND_BASE_URL` を設定する。
2. RenderのサーバーSecretへ `DCC_BACKEND_TOKEN` を設定する。Site側 `DCC_MCP_READ_TOKEN` と対応させるが、値自体はGit・Site DB・ブラウザ・ログへ記録しない。
3. Bridgeを再デプロイまたは再起動し、`server_info` で backend.configured=true / baseUrlConfigured=true / tokenConfigured=true を確認する。
4. ChatGPT通常チャットから `list_projects` と実在IDの `get_project` を実行し、15件・syncVersion・401/404を確認する。
5. 残案件のGit移行を継続する。

## Blocker
Render側Backend環境変数が未設定。
- DCC_BACKEND_BASE_URL: 未設定
- DCC_BACKEND_TOKEN: 未設定

現在のBridgeは起動済みだが、Site DBへは未接続。

## Cautions
- Site DBを取得元とし、Gitに存在しない案件を維持する。
- 読み取りAPIからGit fetch/sync、DB更新、履歴追加を行わない。
- Siteの既存UI、Git同期、履歴、CR、Decision Log、Handoff、/mcp、WebMCPを維持する。
- TokenをGit、Site DB、ブラウザ、ログ、APIレスポンスへ記録しない。
- Phase 1ではMCP Bridge自体の書き込みを有効化しない（MCP_ALLOW_WRITES=false）。

## Completion Criteria
Bridgeの `server_info` でBackend設定済みとなり、ChatGPT通常チャットから15案件の一覧と詳細が取得でき、認証失敗が401、存在しないIDが404となること。
