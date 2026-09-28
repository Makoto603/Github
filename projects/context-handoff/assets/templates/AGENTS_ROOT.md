# AGENTS.md

## Project operating rules

### Source of truth
- Stable repository rules live in this file.
- Current state: `handoff/CURRENT.md`
- Architecture: `handoff/ARCHITECTURE.md`
- Active issues: `handoff/KNOWN_ISSUES.md`
- Historical decisions: `handoff/HISTORY.md`
- Do not restore superseded HISTORY values as current behavior.

### Before editing
1. Read `handoff/CURRENT.md`.
2. Inspect the relevant source files.
3. Read active issue details when applicable.
4. Follow the closest applicable AGENTS instructions.

### Change policy
- Prefer minimal, reversible changes.
- Preserve user data.
- Do not silently change public interfaces or persistent formats.

### Validation
- Run relevant tests after changes.
- Report any tests that could not be run.
