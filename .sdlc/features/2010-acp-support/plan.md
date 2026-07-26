---
issue: "#2010"
title: "Add Agent Client Protocol (ACP) support"
status: approved
---

# Plan: Add Agent Client Protocol (ACP) support

> Review: approved (2026-07-04). Phases map to the specification's components, dependencies are acyclic and correct (M1/M2 parallel; M3→M4→M5), the risk register covers the validated assumption #1 and the two highest-impact risks (interface-extraction regression, global-state breakage) with concrete mitigations, and validation gates tie to the Must ACs and baseline-green requirement.

# Plan: Add Agent Client Protocol (ACP) support

## Overview

Implement the Must-scope ACP milestone (decision FEAT-2010-DEC-1): a swappable `AgentClient` abstraction with an OpenCode thin adapter and an ACP stdio client, a server-side ACP event source that translates ACP notifications into the existing normalized event protocol, agent selection UI, and explicit error surfacing, all behind a feature flag with OpenCode as default.
Effort estimate: L. The sync layer stays reused as-is (assumption #1 validated in the specification).

## Phases and Milestones

### Phase 1 — AgentClient abstraction + OpenCode thin adapter (foundation)
- Introduce `packages/ui/src/lib/agent/types.ts` (`AgentClient` interface, `AgentBackendType`).
- Make `OpencodeService` implement `AgentClient` (thin adapter; no behavior change).
- Keep `opencodeClient` as the OpenCode instance; add `getActiveAgentClient()` (returns OpenCode until the selector is wired in Phase 5).
- Verify OpenCode path is byte-identical (NFR-1).
- **Milestone M1:** abstraction lands with zero behavior change; type-check + lint green.

### Phase 2 — Server agent-process manager + ACP scaffold
- Generalize `managed-process-registry.js` into `packages/web/server/lib/acp/agent-process-manager.js` (per-pid files under `~/.config/openchamber/managed-acp-agents/`; drop port verification; keep verified-reap).
- Add `OPENCHAMBER_ACP_ENABLED` feature flag (default off).
- Add `@agentclientprotocol/sdk` dependency (server-only).
- Resolve open question (spec OQ1): confirm `ClientSideConnection` transport ownership for a server-side stdio child.
- **Milestone M2:** a stdio agent can be spawned, handshake attempted, and torn down/orphan-reaped via the manager.

### Phase 3 — ACP event source (translation seam)
- Implement `packages/web/server/lib/acp/acp-event-source.js`: hold the `ClientSideConnection`, subscribe to `session/update`, translate `agent_message_chunk`/`tool_call`/`tool_call_update`/stopReason into normalized events feeding `global-hub` (per spec section 2 mapping).
- Synthesize message/part IDs in hex-timestamp format; coalesce and skip no-ops (performance rules).
- Distinguish dropped-connection as explicit error `session.status`, never empty success (NFR-4).
- **Milestone M3:** an ACP streamed turn (from a local test agent) renders live through the existing UI pipeline with no sync-layer changes.

### Phase 4 — Server ACP endpoints
- Implement `/api/agent/acp/initialize`, `/session/new`, `/session/prompt`, `/session/cancel`, `/shutdown` (spec 5.1), all partial-failure-safe.
- Wire endpoints behind the feature flag; route to `acp-event-source`.
- **Milestone M4:** full server-side prompt turn over HTTP, streaming events to the UI.

### Phase 5 — UI AcpClient adapter + active-client selector
- Implement `packages/ui/src/lib/agent/acp-client.ts` (`AgentClient` over `/api/agent/acp/*` via `runtimeFetch`; own failure/retry semantics).
- Wire `getActiveAgentClient()` selection at the session-create and prompt seams only (codebase-analysis: these are the only branching seams).
- **Milestone M5:** selecting ACP routes a session to the ACP backend end-to-end.

### Phase 6 — Settings affordance + config
- Add agent-selection + ACP agent config section (spec 6.5); persist `AgentSelectionState`.
- Locale system for all strings; theme tokens for styling.
- Surface unavailable-in-runtime where no server is present (cross-runtime parity).
- **Milestone M6:** a user can configure and select an ACP agent from settings.

### Phase 7 — Error surfacing + telemetry/observability wiring
- Surface initialize/streaming failures as visible error states (FR-6); preserve prior content on mid-turn drop.
- Wire telemetry events (telemetry.md) and structured logs/metrics (observability.md) to the existing sinks (resolve OQs at impl).
- **Milestone M7:** failures are explicit and measurable.

### Phase 8 — End-to-end validation + cross-runtime parity
- Validate every Must AC with a local stdio test agent (SDK examples or `@agentclientprotocol/codex-acp`).
- VS Code parity: agent-process-manager reads the same registry dir; bridge forwards to the same endpoints.
- Type-check, lint, and dead-code checks green.
- **Milestone M8:** all Must ACs pass; baseline green; ready for PR.

## Dependencies

```
M1 (abstraction) ─────────────┐
                              ├─► M5 (UI adapter + selector) ─► M6 (settings) ─► M7 (errors+telemetry) ─► M8 (validation)
M2 (process mgr + flag) ─► M3 (event source) ─► M4 (endpoints) ┘
```

- M1 and M2 are parallel entry points.
- M3 depends on M2; M4 depends on M3; M5 depends on M1 + M4.
- M8 depends on M5 + M6 + M7.

## Effort and Sizing

| Phase | Effort | Notes |
|---|---|---|
| M1 | M | Interface extraction; verify zero behavior change |
| M2 | M | Generalize registry; SDK dependency; flag |
| M3 | L | The correctness-critical translation seam |
| M4 | M | Endpoints + flag routing |
| M5 | M | Adapter + selector at two seams |
| M6 | S-M | Settings section |
| M7 | S | Error states + telemetry/logs |
| M8 | M | E2E validation + VS Code parity |
| **Total** | **L** | Bounded to Must scope |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ACP notification shape does not map cleanly (assumption #1) | Low (validated in spec) | High | Phase 3 spike with a test agent before building endpoints; additive protocol extension if a gap appears |
| `opencodeClient` interface extraction regresses OpenCode | Medium | High | Phase 1 keeps behavior byte-identical; verify with existing tests; branch only at create/prompt seams |
| SDK owns subprocess spawn, complicating the process manager | Medium | Medium | Resolve spec OQ1 at Phase 2 start; adapt by feeding managed stdio to the SDK if needed |
| ACP failure breaks global state | Low | High | Phase 7 scopes failures to the ACP session; NFR-1 keeps OpenCode isolated |
| Orphan reaping regresses for OpenCode registry | Low | Medium | Phase 2 dual-runs; never weakens existing OpenCode guarantees |

## Validation Gates

- After M1: `bun run type-check`, `bun run lint` green; OpenCode behavior unchanged.
- After M3: streamed ACP turn renders live via existing pipeline (assumption #1 proof).
- After M5: selecting ACP routes a session end-to-end.
- After M8: every Must AC verified; `bun run type-check`, `bun run lint`, `bun run dead-code` green.

## Open Questions

1. Spec OQ1: does `@agentclientprotocol/sdk`'s `ClientSideConnection` allow server-side stdio with our managed child? Resolve at M2 start.
2. Telemetry/observability OQs: confirm existing sinks (resolve at M7).
3. Issue author preference for selection UX (settings section vs sidebar dropdown) — confirm before M6.
