# Codex + AGENTS.md Integration

## Responsibility split

| Layer | Purpose | Change frequency |
|---|---|---|
| `AGENTS.md` | Durable repository rules | Low |
| `handoff/CURRENT.md` | Current project state | High |
| Context Handoff Skill | Repeatable handoff procedure | Very low |

Do not use AGENTS.md as a project diary.

## Recommended repository layout

```text
repo/
├─ AGENTS.md
├─ README.md
├─ handoff/
│  ├─ CURRENT.md
│  ├─ ARCHITECTURE.md
│  ├─ KNOWN_ISSUES.md
│  ├─ TODO.md
│  ├─ HISTORY.md
│  └─ START_PROMPT.md
├─ src/
├─ tests/
└─ ...
```

AGENTS should point to CURRENT, not duplicate it.
