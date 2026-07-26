---
id: "1"
title: "Define AgentClient interface and agent types"
status: done
size: S
depends_on: []
completed_date: "2026-07-04"
blocker: null
---

# Task 1: Define AgentClient interface and agent types

## Description

Introduce `packages/ui/src/lib/agent/types.ts` defining the `AgentClient` interface (`backend`, `createSession`, `prompt`, `cancel`, `capabilities`), `AgentBackendType` (`"opencode" | "acp"`), `SessionInit`, `PromptParams`, `SessionRef`, and `AgentCapabilities`.
This is the abstraction boundary behind which the OpenCode and ACP backends sit (FR-1).
No behavior change yet; the interface is the foundation for tasks 2, 9, and 10.

## Acceptance Criteria

- [ ] `packages/ui/src/lib/agent/types.ts` exists and exports `AgentClient`, `AgentBackendType`, and the supporting types.
- [ ] The interface is typed to avoid `any` and blind casts (no shape guessing).
- [ ] `bun run type-check` is green.
- [ ] FR-1 is partially satisfied (interface defined; implementations follow in tasks 2 and 9).

## Notes

- Per FR-1 and decision FEAT-2010-DEC-1, the interface must not encode single-client-only assumptions that block a future registry (NFR-2).
- `capabilities()` returns a minimal shape for Must scope (slash commands etc. are a Should milestone).
