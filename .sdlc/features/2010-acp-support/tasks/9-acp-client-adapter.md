---
id: "9"
title: "Implement UI AcpClient adapter"
status: pending
size: M
depends_on: ["1", "8"]
completed_date: null
blocker: null
---

# Task 9: Implement UI AcpClient adapter

## Description

Implement `packages/ui/src/lib/agent/acp-client.ts` implementing `AgentClient` by calling `/api/agent/acp/*` via `runtimeFetch` (authenticated transport to the same OpenChamber server).
`prompt()` returns the client-generated message id immediately (matching the OpenCode adapter contract); the turn streams back via task 7's events.
Own its own failure/retry semantics (NFR-4): transport failures throw so callers preserve prior state; do not reuse the OpenCode HTTP provider-circuit.

## Acceptance Criteria

- [ ] `AcpClient implements AgentClient` with `backend: "acp"`.
- [ ] `createSession`, `prompt`, `cancel`, `capabilities` call the corresponding endpoints.
- [ ] Transport failures throw (do not swallow to empty success).
- [ ] `bun run type-check` and `bun run lint` are green.

## Notes

- Client-generated IDs use the same hex-timestamp format as the server (optimistic-updates rule).
- Use `runtimeFetch` / `runtime-url` per the runtime transport layer; do not introduce direct fetch with hardcoded URLs.
