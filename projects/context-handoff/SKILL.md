---
name: context-handoff
description: Long-term project handoff and context compression for ChatGPT and Codex. Use when the user asks to move to a new chat/session, compress project context, create or refresh CURRENT.md, prepare a Codex handoff, reconcile changing specifications, or migrate a long-running development conversation without losing current state. Do not use for ordinary short summaries.
---

# Context Handoff

A reusable workflow for long-running projects.

The goal is NOT to summarize a conversation.
The goal is to reconstruct the **current authoritative project state** so a new ChatGPT chat or Codex session can continue without relying on the old conversation.

## Modes

Choose one mode:

- `web` — ChatGPT conversation/design/requirements handoff.
- `codex` — software-development handoff.
- `both` — generate both views for mixed long-running projects.
- `auto` — infer the appropriate mode.

Explicit user choice overrides automatic inference.

## Core rule

Treat project information in this priority order when evidence conflicts:

1. Explicit correction or replacement stated most recently.
2. Current project state files supplied by the user.
3. Current repository facts discovered from files/code.
4. Recent conversation decisions.
5. Historical notes.
6. Old plans and superseded ideas.

Never silently merge conflicting values.

## Progressive disclosure

Read supporting files only when needed:
- `references/HANDOFF_SCHEMA.md`
- `references/CODEX_AGENTS_INTEGRATION.md`
- `references/MIGRATION_GUIDE.md`
- `references/QUALITY_CHECK.md`
- `assets/templates/`

## Workflow

1. Identify project boundary.
2. Separate durable rules / current state / history / repeatable process.
3. Resolve superseded information.
4. Build or refresh handoff files.
5. Integrate with AGENTS.md for Codex.
6. Create START_PROMPT.md.
7. Validate.

## Key design principle

**Conversation is not the database.**

Use:
- `AGENTS.md` for durable behavioral rules
- `handoff/CURRENT.md` for current state
- `handoff/HISTORY.md` for past state
- this Skill for the repeatable handoff process
