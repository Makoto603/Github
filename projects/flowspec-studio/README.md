# FlowSpec Studio

GUIで初心者でもフローチャート形式の仕様を作成し、AI/Codexが機械的に理解できる `FlowSpec` として受け渡すためのプロジェクトです。

## 目的

- 人間が仕様を視覚的に理解する
- 実装前に仕様の抜け・矛盾を発見する
- Codex/ChatGPTとの逐次質問を減らす
- AIレビュー結果をGUIへ戻してまとめて修正する
- AIの独断による仕様変更を防ぐ

## 3点セット

```text
flowspec-studio/
├─ app/                         GUIアプリ
├─ skills/
│  ├─ flowspec-reviewer/        仕様レビューSkill
│  └─ flowspec-developer/       実装用Skill
└─ specification/               共通フォーマット仕様
```

## 正本

FlowSpec Studioでは画像を正本にしません。

- `flow.json` : 機械可読な仕様の正本
- `review.json` : AIからの指摘・変更提案
- `project.md` : 人間向け概要
- `requirements.md` : FlowSpecから生成される要求仕様
- SVG/PNG : 人間確認用の補助資料

## 基本ワークフロー

```text
人間
  ↓
FlowSpec Studioで作図
  ↓
ローカル構造検査
  ↓
FlowSpec ZIP出力
  ↓
flowspec-reviewer
  ↓
review.json
  ↓
FlowSpec Studioへ再読込
  ↓
人間が採用 / 編集 / 却下
  ↓
確定FlowSpec
  ↓
flowspec-developer + Codex
  ↓
実装
```

## AIの基本原則

1. `flow.json` を仕様の一次情報とする。
2. 曖昧な点をAIが勝手に決めない。
3. 複数の疑問を一問ずつ聞かず、`review.json` にまとめる。
4. AIの修正案は `suggested_changes` として返し、正式仕様を直接変更しない。
5. 人間が採用した変更のみ正式FlowSpecへ反映する。

## 開発開始

Codexにはリポジトリルートを開かせ、最初に `AGENTS.md` を読ませてください。

アプリ技術構成（初期案）:

- Tauri 2
- React
- TypeScript
- React Flow (`@xyflow/react`)
- Zustand
- Zod
- Vite

`app/` はVer.1実装用のスターター骨格です。
