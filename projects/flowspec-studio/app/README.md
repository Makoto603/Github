# FlowSpec Studio App

## Ver.1 goal

初心者がドラッグ&ドロップで処理フローを作り、FlowSpec JSON/ZIPとして保存し、AIレビュー結果を同じGUI上へ戻せるデスクトップアプリ。

## Proposed stack

- Tauri 2
- React 19
- TypeScript
- Vite
- @xyflow/react
- Zustand
- Zod
- JSZip

## First implementation milestones

### M1 Editor
- Canvas
- Node追加
- Edge接続
- 選択/移動/削除
- project title/description

### M2 Persistence
- FlowSpec JSON export/import
- local autosave
- schema validation

### M3 Local validator
- start/end
- broken edges
- unreachable node
- decision branches
- cycle warning

### M4 AI round trip
- review.json import
- node issue badge
- issue panel
- suggested change preview
- accept/edit/reject

### M5 Package
- `.flowspec.zip`
- project.md auto generation
- requirements.md auto generation
- SVG/PNG

## Dev command

```bash
npm install
npm run dev
```

Tauri化はWeb UIのM1/M2が固まった後に `@tauri-apps` を追加してもよい。
