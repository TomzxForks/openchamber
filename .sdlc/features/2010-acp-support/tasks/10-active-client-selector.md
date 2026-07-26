---
id: "10"
title: "Wire active-client selector at session-create and prompt seams"
status: pending
size: S
depends_on: ["2", "9"]
completed_date: null
blocker: null
---

# Task 10: Wire active-client selector at session-create and prompt seams

## Description

Replace direct `opencodeClient` calls at the session-create and prompt seams (the Must-scope branching seams) with `getActiveAgentClient()` selected by `activeBackend`.
A method-surface audit (codebase-analysis) shows session-lifecycle methods (`getSession`, `updateSession`, `deleteSession`) and shell/command methods (`shellSession`, `sendCommand`) are also called on sessions; for the Must scope these remain OpenCode-context-only (ACP sidebar lifecycle is Should, FR-9). Scope lifecycle calls to the active backend so that, after switching back to OpenCode while an ACP session survives (FR-5 edge), they do not silently route to the wrong backend.

## Acceptance Criteria

- [ ] Selecting the ACP backend routes a session to the ACP client; selecting OpenCode routes to OpenCode (FR-5 happy path + edge revert).
- [ ] After switching back to OpenCode while an ACP session survives, lifecycle calls are scoped to the active backend (no silent wrong-backend routing).
- [ ] No other singleton consumers are changed.
- [ ] OpenCode sessions are unaffected when ACP is not selected (NFR-1).
- [ ] `bun run type-check` and `bun run lint` are green.

## Notes

- The selection state (`activeBackend`, `activeAcpAgentId`) is set by task 11's settings affordance.
- This task enables the end-to-end ACP turn (FR-3).
