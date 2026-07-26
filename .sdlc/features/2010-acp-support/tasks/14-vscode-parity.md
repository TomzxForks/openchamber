---
id: "14"
title: "VS Code parity for ACP agent-process manager and endpoints"
status: done
size: M
depends_on: ["3", "8"]
completed_date: "2026-07-04"
blocker: null
---

# Task 14: VS Code parity for ACP agent-process manager and endpoints

## Description

Bring VS Code to parity with the web/desktop ACP support (cross-runtime parity rule).
The VS Code agent-process-manager parity implementation reads the same `~/.config/openchamber/managed-acp-agents/` dir (same parity contract as today's OpenCode registry).
The VS Code bridge forwards to the same `/api/agent/acp/*` endpoints.

## Acceptance Criteria

- [ ] VS Code reads/writes the same managed-acp-agents registry dir as web/desktop.
- [ ] The VS Code bridge forwards ACP session/prompt calls to the same endpoints.
- [ ] Where subprocess spawning is unavailable in a runtime, the affordance surfaces "unavailable" explicitly rather than silently failing.

## Notes

- Shared behavior differences must be intentional and visible in code (cross-runtime parity rule).
- The VS Code extension cannot import the web package directly; it carries a parity implementation.
