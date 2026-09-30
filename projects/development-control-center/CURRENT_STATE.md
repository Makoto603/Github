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
OAuth付きBridge v0.2.1のMCP取得とSiteの認証付きGit再照合を確認。Git接続はCONNECTED、Site DBは15案件、Git Registryは10件。

## 次の作業
1. refresh tokenによる再ログインなしの継続利用を確認する。
2. Git正式文書・RegistryとSite DBの差分を定期点検し、更新候補を提示する。自動で案件データを上書きしない。
3. チャットからの限定更新を版管理・履歴・認可範囲を定めて設計する。Git未接続案件の移行は別途判断する。

## Blocker
なし。継続利用テストと更新機能の設計は次作業。

## 2026-09-30 11:10時点の観測（解消前）
- Site DBは15案件、DEV-001はsyncVersion=5のまま。Site表示は接続前の記述でGit正式記録と相違。
- Git接続表示はSTALE、直近の再照合エラーはGitHub取得失敗 HTTP 403。最後のGit同期状態はSYNCEDのまま。
- このセッションのMCP ping/server_info/list_projects/get_projectはInternal error。Render配備はlive、エラーログなし。原因は未確定。OAuth接続完了の過去実績とは区別する。
- UIの案件種類バッジは実装済み。Bridge経由の書き込みはwritesEnabled=falseのまま。

## 2026-09-30 13:30時点の確認
- Render OAuth owner credential configured=true、MCP ping/list_projects/get_projectが成功。DEV-001の管理記録更新後はsyncVersion=9、Site DBは15案件。
- Site Secret `GITHUB_TOKEN` を設定し、Site v11を再デプロイ。認証付き `/api/git/status?refresh=1` がHTTP 200、CONNECTED、Git Registry 10件、`cached=false` を返した。403の再現はない。
- Site DBの案件ID・statusは実装前後15件で維持。Git同期は行っておらず、`lastGitSyncAt` は2026-09-29T00:39:13.237Zのまま。
- Bridge `writesEnabled=false`。refresh tokenを明示的に更新した事実までは未確認。

## 最新の変更
2026-09-30: Git接続・MCP取得の復旧を確認。Site側の認証付きGit取得を導入し、403とInternal errorのBlockerを解消。

2026-09-29: DEV-001をOAuth MCP接続完成・通常運用開始状態へ更新。15案件・DEV-001・syncVersion=5・404・writesEnabled=falseを確認済み。
2026-09-29: Bridge v0.2.1でOAuth callback遷移を修正し、ChatGPT側OAuth接続を完了。
2026-09-29: Site非公開を維持したBridge→Site DB接続を完成。

## 2026-09-30 Bridge v0.3.0
- Site v12に既存案件1件の更新APIと開発チャットURLの保存・Web Handoffリンクを追加。Site DBは15件を維持。
- Bridge v0.3.0はdcc.readとdcc.writeを分け、Site Secret DCC_MCP_WRITE_TOKENとRender Secret DCC_BACKEND_WRITE_TOKENで書き込みを保護。
- 認証なし/不正Tokenは401、正しいTokenと古いsyncVersionは409、外部URL・bulk指定・Git commit未指定は400を確認。
- Handoff閲覧は200で、スナップショットは増えない。Bridgeの読み取り一覧は15件。
- 実案件への書き込みとGit同期、dcc.write再接続は未検証。定期点検は読み取りのみ。
