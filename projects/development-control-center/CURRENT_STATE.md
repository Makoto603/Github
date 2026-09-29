# CURRENT STATE

## 現在工程
実装

## 現在状態
ACTIVE

## 完了
- PC優先ダッシュボード、案件状態KPI、検索・フィルター、工程マトリクス、案件詳細
- 工程状態編集、PASS済み工程ロック、Change Request、Decision Log、履歴
- Codex Handoff生成、JSONバックアップ/復元、Site DB論理スキーマ
- GitHub App接続確認と書き込みテスト、DEV-001とDEV-005の実ファイルGit化
- Site DBの15案件を維持したGit登録・照合
- Siteの既存 /mcp とWebMCPを維持したまま、外部MCP Bridge向け読み取り専用APIを追加
- GET /api/mcp/projects と GET /api/mcp/projects/:projectId を公開
- DCC_MCP_READ_TOKENをSiteのサーバー側Secretに設定。未設定・不正Tokenは401
- 実アクセスで認証なし401、不正Token 401、正しいTokenで一覧200・15件、実在ID詳細200、存在しないID 404を確認
- 実装前後で15案件、各ID・status、Git接続状態、履歴、CR、Decision Log、Handoffを比較し変化なし

## Git
Repository: https://github.com/Makoto603/Github
Project Path: projects/development-control-center
Site source commit: cad509a88c2c96d627e7741ca58ab23f0f4875a9
Site URL: https://development-control-center-makoto.neconini.chatgpt.site/

## 現在の作業
Bridge側の接続準備と、既存開発案件のGit正式管理への移行を進める。Site APIはSite DBのSELECT相当処理のみで読み取り、Git取得・同期は実行しない。

## 次の作業
BridgeにSite所有者認証ゲート通過情報とDCC_MCP_READ_TOKENを安全に設定し、Bridge経由で一覧・詳細を確認する。残案件のGit移行を継続する。

## Blocker
Bridge側のSite所有者認証ゲート通過方式と読取Tokenの設定が未完了。Site API単体の実アクセス確認は完了。

## 最新の変更
2026-09-29: 外部MCP Bridge用読み取り専用APIを追加。Siteの既存UI、Git同期、履歴、CR、Decision Log、Handoff、/mcp、WebMCPには変更なし。
