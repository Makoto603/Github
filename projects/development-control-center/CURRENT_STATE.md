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
- 外部MCP Bridge用Repository `Makoto603/development-control-center-mcp` を作成し、Renderへデプロイ
- ChatGPT通常チャットから開発管理センタープラグイン経由で `ping` 成功。service=`development-control-center-mcp`、version=`0.1.0`
- `server_info` でMCP Bridge自体は稼働中、writesEnabled=false を確認
- Bridge未設定時に `list_projects` が偽データを返さず `BACKEND_NOT_CONFIGURED` になることを確認

## Git
Repository: https://github.com/Makoto603/Github
Project Path: projects/development-control-center
Site source commit: cad509a88c2c96d627e7741ca58ab23f0f4875a9
Bridge Repository: https://github.com/Makoto603/development-control-center-mcp
Bridge Version: 0.1.0
Site URL: https://development-control-center-makoto.neconini.chatgpt.site/

## 現在の作業
Render上のMCP BridgeからSite DB読み取りAPIへ接続するためのBackend設定を進める。Site APIはSite DBのSELECT相当処理のみで読み取り、Git取得・同期・DB更新は実行しない。

## 次の作業
Render側のサーバーSecretに `DCC_BACKEND_BASE_URL` と `DCC_BACKEND_TOKEN` を設定する。設定後、ChatGPT通常チャットから `list_projects` と `get_project` を実行し、15案件・syncVersion・401/404を確認する。残案件のGit移行も継続する。

## Blocker
Render上のMCP Bridgeで `DCC_BACKEND_BASE_URL` と `DCC_BACKEND_TOKEN` が未設定。現状 `backend.configured=false`、`baseUrlConfigured=false`、`tokenConfigured=false` のため、`list_projects` / `get_project` は `BACKEND_NOT_CONFIGURED`。

## 最新の変更
2026-09-29: Render上の外部MCP BridgeとChatGPT通常チャットの接続に成功。次段階はBridge→Site DB読み取りAPIの接続設定。
2026-09-29: 外部MCP Bridge用読み取り専用APIを追加。Siteの既存UI、Git同期、履歴、CR、Decision Log、Handoff、/mcp、WebMCPには変更なし。
