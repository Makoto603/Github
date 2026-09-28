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