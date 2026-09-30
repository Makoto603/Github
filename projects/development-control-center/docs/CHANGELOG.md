# Changelog

## 0.1.9 — 2026-09-30

- Site v12で1案件限定の更新、CR/Decision、Git同期、開発チャットURLとWeb Handoffリンクを追加。
- Bridge v0.3.0へdcc.writeを追加し、読み取り権限と分離。書き込みSecretはSiteとRenderのサーバー側に保存。
- 15案件・他案件のID/statusを維持。認証・版競合・不正URL・bulk拒否を確認。実案件のBridge書き込みとGit同期は再接続後の検証事項。


## 0.1.8 — 2026-09-30

- Site Secret `GITHUB_TOKEN` を利用する認証付きGit再照合を公開し、HTTP 200 / CONNECTED / Registry 10件を確認
- OAuth Bridge v0.2.1のMCP ping・案件一覧15件・DEV-001詳細取得を再確認
- 解消済みの403・MCP Internal errorをBlockerから外し、refresh token継続確認と差分点検を次作業に変更
- Site DB 15案件を維持。案件のGit同期・DB初期化は実行せず、既存UIとMCP読み取り機能を維持

## 0.1.7 — 2026-09-30

- Site DEV-001の古い接続前表示をGit正式記録に合わせて更新する作業を開始
- Git再照合HTTP 403・STALEと現セッションのMCPツールInternal errorを観測。原因は未確定
- Render Bridge v0.2.1配備live、Site DB 15案件を確認
- 次の開発課題をMCP接続診断、Git再照合復旧、refresh token継続確認、Git未接続案件の方針整理とした

## 0.1.5 — 2026-09-29

- OAuth認証画面からChatGPT callbackへ戻れない問題を修正
- MCP Bridgeをv0.2.1へ更新
- ChatGPT側のOAuth初回接続を完了
- OAuth接続後のping / server_info / list_projects / get_projectを実行
- mcpAuth=oauth2.1-pkce、OAuth enabled/configured=trueを確認
- Backend configured=true、writesEnabled=falseを確認
- list_projects=15件を確認
- DEV-001詳細取得成功、syncVersion=5を確認
- DEV-999999で404 project_not_foundを確認
- Site非公開、Site DB 15案件、Git未接続案件を維持
- DEV-001を接続Blockerなし・通常運用開始状態へ更新

## 0.1.4 — 2026-09-29

- Siteをcustom非公開のまま維持し、Bridge→Site DB読み取り経路を完成
- RenderへSite API読取TokenとSIWCバイパスTokenを安全に設定
- MCP Bridge v0.1.2でOAI-Sites-AuthorizationとAuthorizationの二段階認証を実装
- ChatGPT通常チャットからlist_projects=15件を実取得
- DEV-001詳細取得成功、syncVersion=5を確認
- 未知IDで404 project_not_foundを確認
- DEV-010/BIZ案件を含む15案件が維持されていることを確認
- MCP Bridge v0.2.0へOAuth 2.1 Authorization Code + PKCE(S256)を追加
- protected resource metadata、authorization server metadata、Dynamic Client Registrationを追加
- dcc.read / offline_access scopeを追加
- access token 1時間、refresh token 90日で自動更新できる構成を追加
- OAuth SecretはRender環境変数のみで保持
- Renderで MCP OAuth: enabled=true configured=true を確認

## 0.1.3 — 2026-09-29

- Renderへ DCC_BACKEND_BASE_URL を設定し、Site URLまでの到達経路を確立
- MCP Bridgeをv0.1.1へ更新
- Backend設定判定と401 HTML診断を修正

## 0.1.2 — 2026-09-29

- 外部MCP Bridge用RepositoryをRenderへデプロイ
- ChatGPT通常チャットからMCP Bridgeのping成功
- MCP_ALLOW_WRITES=falseを維持

## 0.1.1 — 2026-09-29

- 外部MCP Bridge専用の読み取りAPIを追加
- DCC_MCP_READ_TOKENによるBearer認証を追加
- Site DBの15案件を取得元とし、一覧・詳細にsyncVersionを含めた
- 認証なし401、不正Token 401、一覧200・15件、詳細200、未知ID 404を確認
- DB初期化、Git同期、既存機能の変更なし

## 0.1.0

- ダッシュボード初版
- 案件状態/工程管理
- フィルター
- 案件詳細
- CR/Decision/Activity
- Codex Handoff
- JSONバックアップ
- Site DBスキーマ/API契約
