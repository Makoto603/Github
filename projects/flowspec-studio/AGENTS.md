# AGENTS.md — FlowSpec Studio

## Project mission

FlowSpec Studioは、初心者でもGUIで正しいフローチャート形式の仕様を作成し、それをAI/Codexへ機械可読形式で渡して開発時の手戻りを減らすためのアプリである。

## Authoritative specifications

優先順位は以下。

1. `specification/FLOW_SPEC.md`
2. `specification/flow.schema.json`
3. `specification/review.schema.json`
4. `README.md`
5. `app/README.md`

矛盾がある場合は上位を優先し、勝手に解釈せず `review.json` 相当のIssueとしてまとめる。

## Non-negotiable rules

- 画像は仕様の正本にしない。
- FlowSpec JSONを正本とする。
- AIが確定仕様を無断変更しない。
- 曖昧な仕様を都合よく補完しない。
- 複数の疑問を逐次質問しない。可能な限りまとめて提示する。
- AI提案は `suggested_changes` として管理する。
- 既存FlowSpecのNode IDを不用意に振り直さない。
- ファイル互換性を壊す変更には `flowspec_version` の更新を伴わせる。
- Ver.1では機能追加より「作成→検査→出力→レビュー読込→修正」の縦の流れを優先する。

## Ver.1 scope

必須:

- プロジェクト名（空欄可。空欄ならAI命名）
- アプリ説明
- ドラッグ&ドロップのフロー編集
- start / end / process / decision / input / output / data / error / external / user_action
- 接続線
- decisionの分岐ラベル
- Undo / Redo
- 自動保存
- JSON読込/出力
- ZIP読込/出力
- SVG/PNG出力
- ローカル構造検査
- AI review.json読込
- Issueのノード紐付け表示
- suggested_changesの採用 / 編集して採用 / 却下

Ver.1では後回し:

- DB設計専用エディタ
- API設計専用エディタ
- クラウド同期
- リアルタイム共同編集
- AI APIのアプリ内直接接続

## Architecture preference

UI:
- React + TypeScript
- @xyflow/react
- Zustand

Validation:
- Zod
- JSON Schema
- グラフ構造検査は純粋関数として分離

Desktop:
- Tauri 2

## Definition of done for a feature

- UIで操作可能
- JSONへ保存可能
- 再読込して同じ状態を復元可能
- 破損入力でクラッシュしない
- 必要なバリデーションがある
- 仕様変更時はschema/docsも同時更新
