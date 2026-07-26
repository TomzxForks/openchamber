---
id: "4"
title: "Add ACP feature flag and SDK dependency"
status: done
size: XS
depends_on: []
completed_date: "2026-07-04"
blocker: null
---

# Task 4: Add ACP feature flag and SDK dependency

## Description

Add the `OPENCHAMBER_ACP_ENABLED` feature flag (default off) so OpenCode remains the default backend (FR-2, NFR-1).
Add `@agentclientprotocol/sdk` (Apache-2.0) as a server-only dependency.

## Acceptance Criteria

- [ ] `OPENCHAMBER_ACP_ENABLED` flag exists and defaults to off (OpenCode default preserved).
- [ ] `@agentclientprotocol/sdk` is added and resolves; it is not shipped to the browser bundle (server-only).
- [ ] `bun install` succeeds; `bun run type-check` and `bun run lint` are green.

## Notes

- Confirm the SDK tree-shakes acceptably for the server bundle (existing-solutions open question 2) during this task.
