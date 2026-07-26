---
id: "8"
title: "Implement /api/agent/acp/* endpoints"
status: pending
size: M
depends_on: ["7"]
completed_date: null
blocker: null
---

# Task 8: Implement /api/agent/acp/* endpoints

## Description

Implement the server endpoints (specification section 5.1): `POST /api/agent/acp/initialize`, `/session/new`, `/session/prompt`, `/session/cancel`, `/shutdown`.
Wire them behind `OPENCHAMBER_ACP_ENABLED` and route to task 6's lifecycle and task 7's event source.
Prompt results stream back via task 7's events (not a single response body).

## Acceptance Criteria

- [ ] All five endpoints exist and are gated behind the feature flag.
- [ ] Every endpoint is partial-failure-safe: transport/handshake failures return non-success + explicit error, never an empty success (NFR-4).
- [ ] `/session/prompt` returns immediately; the turn streams via the event source.
- [ ] Endpoints follow the existing server route-registration pattern.

## Notes

- Reuse the existing UI auth/runtime transport; no new auth surface.
- Secrets/config are never logged (NFR-6).
