# Context Handoff Skill v2

長期プロジェクト向けの ChatGPT / Codex 引継ぎSkill。

## 役割分担
- Skill: 引継ぎ処理そのもの
- AGENTS.md: Codexが常に守る安定ルール
- handoff/CURRENT.md: 現在の正しい状態
- handoff/HISTORY.md: 過去
- handoff/KNOWN_ISSUES.md: 現在の不具合

## ChatGPT Skills向け
`SKILL.md` は `name` / `description` のfrontmatter付き。
`agents/openai.yaml` も同梱。

## Codex向け
リポジトリ側には `assets/templates/AGENTS_ROOT.md` をベースに `AGENTS.md` を配置し、
可変状態を `handoff/` 以下へ分離する。
