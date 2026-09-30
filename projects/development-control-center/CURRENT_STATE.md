# CURRENT STATE

## 現在工程
実装

## 現在状態
ACTIVE

## 完了
- PC優先ダッシュボード、案件状態KPI、検索・フィルター、工程マトリクス、案件詳細
- 工程状態編集、PASS済み工程ロック、Change Request、Decision Log、履歴
- Codex Handoff生成、JSONバックアップ/復元、Site DB論理スキーマ
- Site DBの15案件を維持したGit登録・照合
- 外部MCP Bridge向け読み取り専用APIを追加し、既存UI・/mcp・WebMCPを維持
- Site読み取りTokenとSIWCバイパスTokenをサーバーSecretとして運用
- Bridge v0.1.2でSiteアクセス層とSite APIの二段階認証を通過
- ChatGPT通常チャットからBridge経由でlist_projects=15件を取得
- DEV-001詳細取得成功、syncVersion=5を確認
- 未知IDで404 project_not_foundを確認
- DEV-010/BIZ案件を含むGit未接続案件を維持
- DB初期化、案件再登録、Git同期、UI変更なし
- MCP BridgeへOAuth 2.1 Authorization Code + PKCE(S256)を実装
- protected resource metadata / authorization server metadata / Dynamic Client Registration / authorization / token endpointを実装
- scope dcc.read / offline_access を実装
- access token 1時間、refresh token 90日で自動更新に対応
- OAuth SecretはRender環境変数のみで保持
- OAuth callback遷移を修正しBridge v0.2.1へ更新
- ChatGPT側OAuth初回接続を完了
- OAuth接続後の通常チャットから ping / server_info / list_projects / get_project を再実行
- server_infoで mcpAuth=oauth2.1-pkce、OAuth enabled/configured=true、backend configured=true、writesEnabled=falseを確認
- list_projectsで15案件を再確認
- DEV-001詳細とsyncVersion=5を再確認
- 未知ID DEV-999999 で404 project_not_foundを再確認

## Git
Repository: https://github.com/Makoto603/Github
Project Path: projects/development-control-center
Bridge Repository: https://github.com/Makoto603/development-control-center-mcp
Bridge Version: 0.2.1
Bridge OAuth implementation commit: ea6cafe406fb109ad169601f57d225843fd5bb12
Bridge OAuth env-prefix fix commit: cc3b7ebc6c7dbb2736f1c7640bc551c20c48e9b3
Bridge callback fix commit: dc9bde4cd89a8e7569084437db2b78c44f9d9b06
Site URL: https://development-control-center-makoto.neconini.chatgpt.site/
Bridge URL: https://development-control-center-mcp.onrender.com/mcp

## 現在の作業
OAuth 2.1付きBridge v0.2.1からSite DBの15案件取得まで完成。現在はGit再照合HTTP 403と、このセッションでのMCPツールInternal errorを切り分け中。

## 次の作業
1. MCPツールのInternal errorを認証更新・接続設定・Bridge応答に分けて調査する。
2. Git再照合のHTTP 403を解消し、DEV-001のGit/Site差分を確認する。
3. refresh tokenによる継続利用を確認する。残案件のGit移行方針を整理する。

## Blocker
SiteのGit再照合はHTTP 403でSTALE。2026-09-30の本セッションでMCPツールがInternal error（原因未確定）。

## 2026-09-30の観測
- Site DBは15案件、DEV-001はsyncVersion=5のまま。Site表示は接続前の記述でGit正式記録と相違。
- Git接続表示はSTALE、直近の再照合エラーはGitHub取得失敗 HTTP 403。最後のGit同期状態はSYNCEDのまま。
- このセッションのMCP ping/server_info/list_projects/get_projectはInternal error。Render配備はlive、エラーログなし。原因は未確定。OAuth接続完了の過去実績とは区別する。
- UIの案件種類バッジは実装済み。Bridge経由の書き込みはwritesEnabled=falseのまま。

## 最新の変更
2026-09-29: DEV-001をOAuth MCP接続完成・通常運用開始状態へ更新。15案件・DEV-001・syncVersion=5・404・writesEnabled=falseを確認済み。
2026-09-29: Bridge v0.2.1でOAuth callback遷移を修正し、ChatGPT側OAuth接続を完了。
2026-09-29: Site非公開を維持したBridge→Site DB接続を完成。
