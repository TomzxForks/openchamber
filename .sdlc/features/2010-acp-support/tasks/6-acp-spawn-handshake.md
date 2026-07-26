---
id: "6"
title: "Implement ACP subprocess spawn, initialize handshake, and teardown"
status: done
size: M
depends_on: ["3", "5"]
completed_date: "2026-07-04"
blocker: null
---

# Task 6: Implement ACP subprocess spawn, initialize handshake, and teardown

## Description

Implement the agent lifecycle using `@agentclientprotocol/sdk`'s `ClientSideConnection`: spawn the configured stdio agent via task 3's process manager, run the ACP `initialize` handshake (client `initialize` request, agent `initialized` notification), capture capabilities, and tear down (orphan-reaped on exit).
Apply the task-5 verdict on transport ownership.

## Acceptance Criteria

- [ ] A configured stdio agent can be spawned, the `initialize` handshake completes, and capabilities are returned.
- [ ] A missing/invalid agent command surfaces an explicit error (FR-2 error path; FR-6).
- [ ] Teardown and orphan-reaping work (process manager integration).
- [ ] Behavior is gated behind `OPENCHAMBER_ACP_ENABLED`.

## Notes

- On Windows, non-user-visible subprocess helpers must avoid console-window flashes (`windowsHide: true`, direct executable invocation).
- This task produces the connection object that task 7's event source holds.
