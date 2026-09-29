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
- 外部MCP Bridge用Repository `Makoto603/development-control-center-mcp` をRenderへデプロイ
- ChatGPT通常チャットから開発管理センタープラグイン経由で `ping` 成功
- Renderの `DCC_BACKEND_BASE_URL` をSite URLへ設定済み
- MCP Bridge v0.1.1へ更新
- Token未設定でも `backend.configured=true` になる誤判定を修正
- Siteアクセス層の401 HTMLをそのままエラー本文へ出さない診断処理を追加
- v0.1.1のTypeScript build成功とRender起動を確認
- 現在の `server_info`: `configured=false` / `baseUrlConfigured=true` / `tokenConfigured=false` / `writesEnabled=false`

## Git
Repository: https://github.com/Makoto603/Github
Project Path: projects/development-control-center
Site source commit: cad509a88c2c96d627e7741ca58ab23f0f4875a9
Bridge Repository: https://github.com/Makoto603/development-control-center-mcp
Bridge Version: 0.1.1
Bridge Commit: 7cfcfb9113fe0fc7e1116bfda8b24ae87487f8cc
Site URL: https://development-control-center-makoto.neconini.chatgpt.site/

## 現在の作業
Bridge側で安全に修正できる範囲を反映済み。RenderからSite URLまでは到達するが、Site公開URLへのサーバー間アクセスはChatGPT Sitesのアクセスレイヤーで401 HTMLとなることを確認。

## 次の作業
1. Renderへ `DCC_BACKEND_TOKEN` を安全に設定する。
2. Site側でサーバー間アクセスを許可できる方式を確認・設定する。Work/Site編集が必要な場合はそこで実施する。
3. `list_projects` / `get_project` を再実行し、15案件・syncVersion・401/404を確認する。
4. 残案件のGit移行を継続する。

## Blocker
- `DCC_BACKEND_TOKEN`: 未設定
- Site公開URLはRenderからのサーバー間GETに対し、API JSONではなくChatGPT Sitesアクセスレイヤーの401 HTMLを返す
- Site DBの直接更新経路は現在の通常チャットMCPには公開されていない

## 最新の変更
2026-09-29: RenderへDCC_BACKEND_BASE_URLを設定。MCP Bridge v0.1.1へ更新し、Backend設定判定と401診断を修正。Siteアクセスレイヤー401を次の実ブロッカーとして確定。
2026-09-29: Render上の外部MCP BridgeとChatGPT通常チャットの接続に成功。
2026-09-29: 外部MCP Bridge用読み取り専用APIを追加。Siteの既存UI、Git同期、履歴、CR、Decision Log、Handoff、/mcp、WebMCPには変更なし。
