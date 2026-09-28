# AGENTS.md

## Project
開発管理センター / Development Control Center

## Source of Truth
正式情報はRepository内のファイルを基準とする。
Site DBは進捗・状態・履歴・Handoff・参照情報を保持するが、正式仕様の最終判断には使用しない。

## Required Files Before Work
作業開始時に以下を確認する。

1. `project.yaml`
2. `CURRENT_STATE.md`
3. `docs/HANDOFF.md`
4. `docs/CHANGELOG.md`
5. 必要に応じて `docs/DECISIONS.md`

## Workflow Rules

- PASS済み工程を直接巻き戻さない。
- 後工程で問題が見つかった場合はChange Requestを追加する。
- CRに紐づけて設計修正、実装修正、再テストを行う。
- 大容量成果物はNASへ保存し、Repositoryにはパスまたは参照を残す。
- 認証トークンや秘密情報をブラウザ側へ保存しない。
- Git API認証は将来のSiteバックエンドで扱う。

## Completion
作業完了時は以下を更新する。

- `project.yaml`
- `CURRENT_STATE.md`
- `docs/HANDOFF.md`
- `docs/CHANGELOG.md`
- 設計判断があれば `docs/DECISIONS.md`