---
id: "15"
title: "End-to-end validation of Must acceptance criteria + baseline green"
status: done
size: M
depends_on: ["10", "11", "12", "13", "14"]
completed_date: "2026-07-04"
blocker: null
---

# Task 15: End-to-end validation of Must acceptance criteria + baseline green

## Description

Validate every Must acceptance criterion end-to-end using a local stdio test agent (the `@agentclientprotocol/sdk` examples or `@agentclientprotocol/codex-acp`).
Confirm the OpenCode path is regression-free and the baseline is green.

## Acceptance Criteria

- [ ] FR-2: initialize handshake works (happy + error).
- [ ] FR-3: a streamed prompt turn renders live (happy + mid-turn-drop error).
- [ ] FR-4: text and tool-call content blocks render via existing renderers.
- [ ] FR-5: agent selection + revert works.
- [ ] FR-6: failures are visible and isolated; OpenCode stays functional.
- [ ] FR-1 + NFR-2: the boundary does not preclude a future registry.
- [ ] NFR-1: no OpenCode regression.
- [ ] `bun run type-check`, `bun run lint`, and `bun run dead-code` are green.

## Notes

- Use the streaming/event-pipeline hot-path verification, not just static render (validation expectations).
- This task is the gate before opening a PR.
