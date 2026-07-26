---
id: "2"
title: "Make OpencodeService a thin AgentClient adapter"
status: done
size: M
depends_on: ["1"]
completed_date: "2026-07-04"
blocker: null
---

# Task 2: Make OpencodeService a thin AgentClient adapter

## Description

Make `OpencodeService` (`packages/ui/src/lib/opencode/client.ts`) implement the `AgentClient` interface as a thin adapter wrapping the existing SDK calls (no rewrite of the 1855-line body).
Add `getActiveAgentClient()` returning the OpenCode instance (the active-client selector returns OpenCode until task 10 wires ACP selection).
`opencodeClient` remains the OpenCode instance so existing imports keep working during migration (NFR-1).

## Acceptance Criteria

- [ ] `OpencodeService implements AgentClient`.
- [ ] `getActiveAgentClient()` is exported and returns the OpenCode client by default.
- [ ] The OpenCode path is byte-identical: existing tests pass with no behavioral change (NFR-1).
- [ ] `bun run type-check` and `bun run lint` are green.

## Notes

- Do NOT branch on agent type here; selection wiring is task 10.
- Keep method signatures consumed today unchanged.
