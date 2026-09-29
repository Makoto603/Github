# Changelog

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
