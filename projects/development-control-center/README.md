# 開発管理センター Ver.1 Prototype

個人開発案件を横断管理するための技術系ダッシュボードです。

## この版で動くもの

- ACTIVE / PENDING / HOLD / MAINTENANCE / COMPLETE の件数表示
- 案件一覧と検索・状態・工程・優先度フィルター
- 工程マトリクス
- 案件詳細
- 現在作業 / 次アクション / Blocker / Pending / Hold理由更新
- 工程ステータス管理
- PASS済み工程の巻き戻し禁止
- Change Request追加
- Decision Log追加
- 変更履歴表示
- Codex Handoff生成・コピー・Markdown保存
- JSONバックアップ / リストア
- PC優先UI / モバイル簡易対応

## データ保存

このプロトタイプ単体では `localStorage` を使います。
Site公開時には `site-db-schema.sql` に沿ってSite DBへ差し替える想定です。

UI側の責務とデータモデルを分けてあるため、保存層だけをSite DB APIへ置き換えられます。

## 正式情報の考え方

1. Git Repository = 正式なコード・Markdown・仕様
2. NAS = 大容量成果物
3. Site = 現在状態・進捗・履歴・参照・Handoff

SiteとGitで内容が食い違った場合、Git Repositoryを優先します。

## 工程巻き戻し禁止

PASS済み工程はUIから変更できません。
後工程で問題が発見された場合はCRを追加し、設計修正版・実装修正・再テストという履歴で扱います。

## Site化するときの実装順

1. `localStorage` をSite DB APIへ差し替える
2. Git APIバックエンドアダプターを追加する
3. Repositoryの `project.yaml` / `CURRENT_STATE.md` / `HANDOFF.md` との整合性警告を追加する
4. Ver.2でNAS API連携
5. Ver.3でCodexとの状態同期

## ローカル確認

`index.html` をブラウザで開くだけでも動きます。
ブラウザの制約がある場合は簡易HTTPサーバーを利用してください。

```bash
python -m http.server 8080
```

その後 `http://localhost:8080` を開きます。