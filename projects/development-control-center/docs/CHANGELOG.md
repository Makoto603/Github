# Changelog

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
- Render build成功
- Renderで MCP OAuth: enabled=true configured=true を確認
- OAuth有効化により既存no-auth接続が拒否されることを確認
- 次段階はChatGPT側で一度だけOAuth再リンクし、通常利用の自動認証を検証

## 0.1.3 — 2026-09-29

- Renderへ `DCC_BACKEND_BASE_URL` を設定し、Site URLまでの到達経路を確立
- MCP Bridgeをv0.1.1へ更新
- `DCC_BACKEND_TOKEN` 未設定でも `backend.configured=true` になる誤判定を修正
- `backend.configured` はBase URLとTokenの両方が設定済みの場合のみtrueへ変更
- Siteアクセスレイヤーの401 HTMLをそのままMCPエラー本文へ出さない診断処理を追加
- TypeScript build成功、Render上でv0.1.1起動を確認
- RenderからSite公開URLへの実アクセスでChatGPT Sitesアクセスレイヤーの401 HTMLを確認

## 0.1.2 — 2026-09-29

- 外部MCP Bridge用Repository `Makoto603/development-control-center-mcp` をRenderへデプロイ
- ChatGPT通常チャットから開発管理センタープラグイン経由でMCP Bridgeの `ping` 成功
- MCP Bridgeの書き込みは無効（writesEnabled=false / MCP_ALLOW_WRITES=false）
- Backend未設定時の `list_projects` は `BACKEND_NOT_CONFIGURED` を返し、偽データを返さないことを確認

## 0.1.1 — 2026-09-29

- 外部MCP Bridge専用の読み取りAPIを追加: GET /api/mcp/projects、GET /api/mcp/projects/:projectId
- Siteのサーバー側Secret DCC_MCP_READ_TOKENによるBearer認証を追加
- Site DBの15案件を取得元とし、一覧・詳細に案件ごとのsyncVersionを含めた
- 認証なし401、不正Token 401、一覧200・15件、詳細200、未知ID 404を実アクセス確認
- 実装前後の案件と関連テーブルの内容一致を確認。DB初期化、Git同期、既存機能の変更なし

## 0.1.0

- ダッシュボード初版
- 案件状態/工程管理
- フィルター
- 案件詳細
- CR/Decision/Activity
- Codex Handoff
- JSONバックアップ
- Site DBスキーマ/API契約
