---
id: "3"
title: "Generalize managed-process-registry into an agent-process manager"
status: done
size: M
depends_on: []
completed_date: "2026-07-04"
blocker: null
---

# Task 3: Generalize managed-process-registry into an agent-process manager

## Description

Create `packages/web/server/lib/acp/agent-process-manager.js` by generalizing `packages/web/server/lib/opencode/managed-process-registry.js`.
Reuse the per-pid-file, verified-reap, multi-runtime-safe orphan model.
Store records under `~/.config/openchamber/managed-acp-agents/<pid>.json` with `{ pid, agentId, command, spawnedAt, ownerPid, transport: "stdio" }`.
Drop the OpenCode port-verification step (ACP stdio agents expose no port); verify by recorded `command` + `agentId` match instead.

## Acceptance Criteria

- [ ] `agent-process-manager.js` exists and can spawn, record, and tear down a stdio subprocess.
- [ ] Orphan reaping reuses the verified-reap safety model (never reaps a process a live instance is using).
- [ ] The existing OpenCode registry behavior is unchanged (dual-run; no weakened guarantees).
- [ ] VS Code parity implementation path is documented (reads the same dir; implemented in task 14).

## Notes

- Per-pid files avoid write contention across runtimes.
- This task is server-side and independent of the UI tasks (1, 2).
