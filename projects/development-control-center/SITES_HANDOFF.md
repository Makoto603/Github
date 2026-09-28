# ChatGPT Sites 実装Handoff

このディレクトリを「開発管理センター」Ver.1としてSite化してください。

## 必須

- 現在のUI/機能を維持
- localStorageをSite DBへ差し替え
- `site-db-schema.sql` の論理構造を基準とする
- Git Repositoryを正式情報源として扱う
- Git API認証情報はブラウザへ置かない
- NASはPath参照のみ
- PASS済み工程を通常操作で巻き戻せないようにする
- 修正はChange Requestで管理
- Siteは非公開を前提

## Git API

最低限、案件ごとに以下を取得可能な構成にする。

- repository existence
- default branch
- latest commit
- latest release/tag
- AGENTS.md
- project.yaml
- CURRENT_STATE.md
- docs/HANDOFF.md
- docs/CHANGELOG.md

Git側正式文書とSite DBの状態が違う場合、Gitを自動上書きせず「差分あり」と警告し、人間が反映方向を選択できるようにする。

## 将来拡張

- Ver.2 NAS API
- Ver.3 Codex自動同期

## Ver.1.1 Git接続修正

公開個人開発Repositoryについて、`git-adapter.js` を使ったread-only Git接続を追加する。

必須UI:
- Git確認中
- Git接続済み / N件
- Git接続失敗
- 「Gitから同期」ボタン

同期元:
- https://github.com/Makoto603/Github
- `projects/registry.json`

同期時:
- Gitの正式項目をSiteへupsertする。
- 既存のChange Request / Decision Log / activityを消さない。
- GitにないSite案件を削除しない。
- private業務案件は公開Git同期対象にしない。

Site DB版へ移植する際は、localStorage保存部分だけSite DB APIへ置換し、GitAdapterの読み取りロジックと同期ルールは維持する。
