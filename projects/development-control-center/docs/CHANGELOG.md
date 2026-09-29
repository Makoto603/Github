# Changelog

## 0.1.2 — 2026-09-29

- 外部MCP Bridge用Repository `Makoto603/development-control-center-mcp` をRenderへデプロイ
- ChatGPT通常チャットから開発管理センタープラグイン経由でMCP Bridgeの `ping` 成功
- Bridge service=`development-control-center-mcp`、version=`0.1.0`、phase=`phase-1-connectivity` を確認
- MCP Bridgeの書き込みは無効（writesEnabled=false / MCP_ALLOW_WRITES=false）
- `server_info` でBackend未設定（DCC_BACKEND_BASE_URL / DCC_BACKEND_TOKEN）を確認
- Backend未設定時の `list_projects` は `BACKEND_NOT_CONFIGURED` を返し、偽データを返さないことを確認
- 次段階を「RenderのBackend Secret設定 → Bridge経由で15案件とsyncVersion確認」に更新

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
