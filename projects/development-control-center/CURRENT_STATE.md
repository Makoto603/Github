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
- Siteの読み取りTokenとSIWCバイパスTokenをサーバーSecretとして運用
- Bridge v0.1.2でSiteアクセス層とSite APIの二段階認証を通過
- ChatGPT通常チャットからBridge経由で list_projects=15件 を取得
- DEV-001詳細取得成功、syncVersion=5を確認
- 未知IDで404 project_not_foundを確認
- Git未接続のDEV-010/BIZ案件を含む15案件維持を確認
- DB初期化、案件再登録、Git同期、UI変更なし
- MCP Bridge v0.2.0へOAuth 2.1 Authorization Code + PKCE(S256)を実装
- OAuth protected resource metadata / authorization server metadata / Dynamic Client Registration / authorization / token endpointを実装
- scope dcc.read と offline_access を実装
- access token 1時間、refresh token 90日。refresh tokenによる自動更新に対応
- OAuth用SecretはRender環境変数のみで保持
- OAuth認証画面のChatGPT callback遷移を修正し、Bridge v0.2.1へ更新
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
OAuth 2.1付きMCP接続は完成し、通常チャットから非公開Site DBの15案件を読み取れる状態。接続経路にサーバー側ブロッカーなし。

## 次の作業
1. Renderの初回ペアリング用パスワードを手動でローテーションする。
2. Site DB上のDEV-001 currentWork / nextWork / blocker / activityをWorkまたはSite編集で最新化する。
3. refresh tokenによる通常利用で再入力が不要であることを継続確認する。
4. 残案件のGit移行を継続する。

## Blocker
- 接続上のBlockerなし。
- Site DBのDEV-001運用表示は、現在の読み取り専用MCPでは直接更新できない。

## 最新の変更
2026-09-29: Bridge v0.2.1でOAuth callback遷移を修正し、ChatGPT側OAuth接続を完了。通常チャットから15案件・DEV-001・syncVersion・404を再確認。
2026-09-29: MCP Bridge v0.2.0へOAuth 2.1 + PKCE(S256) + offline_access refresh tokenを実装し、Renderでenabled=true / configured=trueを確認。
2026-09-29: Site非公開を維持したBridge→Site DB接続を完成。
