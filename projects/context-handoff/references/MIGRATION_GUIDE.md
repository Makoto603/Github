# Migration Guide — from a large Agent/config MD

Use this when an existing project has one large Markdown file containing everything.

## Goal

Split the existing document without losing useful knowledge.

Target:

```text
AGENTS.md                 stable rules
handoff/CURRENT.md        current state
handoff/ARCHITECTURE.md   structural facts
handoff/KNOWN_ISSUES.md   active defects
handoff/TODO.md           work queue
handoff/HISTORY.md        superseded state and major decisions
```

## Migration passes

1. Classify sections: RULE / STATE / ARCH / ISSUE / TODO / HISTORY / NOISE.
2. Extract stable rules into AGENTS.md.
3. Construct CURRENT.md.
4. Move useful superseded information to HISTORY.
5. Isolate active defects into KNOWN_ISSUES.
6. Remove duplication.
7. Verify with a fresh-session test.
