# Handoff

## Current Phase
実装

## Current Status
ACTIVE

## Current Work
外部MCP Bridge向けSite DB読み取りAPIの実装・公開・単体接続検証が完了。Bridge側の接続設定と、残案件のGit正式管理への移行を進める。

## Verified
- GET /api/mcp/projects: Bearer Token認証付き。Site DB由来の15案件を返す
- GET /api/mcp/projects/:projectId: Site DB由来の詳細、履歴、CR、Decision、Handoffを返す
- Site Secret: DCC_MCP_READ_TOKEN（値は文書・ブラウザ・DBへ記録しない）
- 認証なし401、不正Token 401、正しいTokenで一覧200・15件、実在ID詳細200、存在しないID 404
- 実装前後の案件15件と関連テーブルは同一。DB初期化・Git同期なし
- 既存 /mcp とWebMCPは維持。Site source commit: cad509a88c2c96d627e7741ca58ab23f0f4875a9

## Next Work
1. Bridge側でSite所有者認証ゲートを通すヘッダーとDCC_MCP_READ_TOKENを安全に設定する。
2. Bridgeから一覧と実在ID詳細を取得し、15件・syncVersion・401/404を確認する。
3. 残案件のGit移行を継続する。

## Blocker
Bridge側の接続設定が未完了。Site側APIは実アクセス確認済み。

## Cautions
- Site DBを取得元とし、Gitに存在しない案件を維持する。
- 読み取りAPIからGit fetch/sync、DB更新、履歴追加を行わない。
- Siteの既存UI、Git同期、履歴、CR、Decision Log、Handoff、/mcp、WebMCPを維持する。
- TokenをGit、Site DB、ブラウザ、ログ、APIレスポンスへ記録しない。

## Completion Criteria
Bridge経由で15案件の一覧と詳細が取得でき、認証失敗が401、存在しないIDが404となること。
