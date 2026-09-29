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
- Render build成功
- Render起動ログで MCP OAuth: enabled=true configured=true を確認
- OAuth有効化後、既存no-auth MCP接続が利用できなくなることを確認

## Git
Repository: https://github.com/Makoto603/Github
Project Path: projects/development-control-center
Bridge Repository: https://github.com/Makoto603/development-control-center-mcp
Bridge Version: 0.2.0
Bridge OAuth implementation commit: ea6cafe406fb109ad169601f57d225843fd5bb12
Bridge OAuth env-prefix fix commit: cc3b7ebc6c7dbb2736f1c7640bc551c20c48e9b3
Site URL: https://development-control-center-makoto.neconini.chatgpt.site/
Bridge URL: https://development-control-center-mcp.onrender.com/mcp

## 現在の作業
MCP入口をOAuth 2.1で保護する実装とRender有効化まで完了。既存ChatGPT側接続はno-authで作成されているため、OAuth接続として一度だけ再リンクする段階。

## 次の作業
1. ChatGPT側でBridge endpointをOAuth認証として再接続する。
2. 初回認証画面で所有者用ペアリング資格情報を一度だけ入力する。
3. ping / server_info / list_projects / get_project を再検証する。
4. 15案件、DEV-001、syncVersion、404、writesEnabled=falseを確認する。
5. OAuth接続成立後、初回ペアリング資格情報をローテーションする。
6. refresh tokenによる通常利用で再入力が不要であることを確認する。

## Blocker
- サーバー側ブロッカーなし。
- 現在はChatGPT側の既存no-auth接続をOAuth接続として再リンクするユーザー操作待ち。
- Site DBのDEV-001運用表示は、通常チャットの読み取り専用MCPでは直接更新できない。

## 最新の変更
2026-09-29: MCP Bridge v0.2.0へOAuth 2.1 + PKCE(S256) + offline_access refresh tokenを実装し、Renderでenabled=true / configured=trueを確認。
2026-09-29: Site非公開を維持したBridge→Site DB接続を完成し、15案件・DEV-001・syncVersion・404を実取得確認。
