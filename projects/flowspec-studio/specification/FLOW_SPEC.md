# FlowSpec v1.0 Specification

## 1. 概要

FlowSpecは、人間がGUIで作成した処理フローをAI・Codex・他ツールが一貫して読み書きするための交換形式です。

画像は補助資料であり、正本はJSONです。

## 2. プロジェクト情報

必須:

- `description`

任意:

- `title`
- `target`
- `notes`

タイトルが空欄の場合:

```json
{
  "title": null,
  "title_mode": "ai_generate"
}
```

AIはレビューまたは開発開始時に名称候補を決定できます。ただし、決定した名称を正式仕様に反映する場合は変更提案として返します。

## 3. Node types

| type | 用途 |
|---|---|
| `start` | 開始 |
| `end` | 終了 |
| `process` | 一般処理 |
| `decision` | 条件分岐 |
| `input` | 入力 |
| `output` | 出力 |
| `data` | 保存・DB・設定 |
| `error` | エラー処理 |
| `external` | API・外部システム |
| `user_action` | 人間による操作 |
| `subflow` | サブフロー呼出 |

## 4. Node

各Nodeは一意な `id` を持ちます。

## 5. Edge

Decisionから出るEdgeには可能な限り `condition` を指定します。

## 6. Validation levels

### Error
出力不能またはフローとして明確に壊れている。

### Warning
意図によっては正しいが確認が必要。

### Info
改善提案。

## 7. AI review contract

AIはFlowSpecを直接書き換えず、`review.json` を返します。

Issueには必ず可能な限り `node_id` または `edge_id` を紐付けます。

提案変更は `suggested_changes` として返します。

## 8. Change operations

Ver.1でサポートする操作:

- `add_node`
- `update_node`
- `remove_node`
- `add_edge`
- `update_edge`
- `remove_edge`
- `update_project`

## 9. Human approval states

- `pending`
- `accepted`
- `accepted_with_edit`
- `rejected`

正式な `flow.json` へ反映されるのは accepted 系のみです。

## 10. ZIP package

```text
<ProjectName>.flowspec.zip
├─ manifest.json
├─ flow.json
├─ project.md
├─ requirements.md
├─ review.json
├─ diagrams/
└─ assets/
```

`flow.json` は必須です。
