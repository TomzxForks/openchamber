---
issue: "#2010"
title: "Add Agent Client Protocol (ACP) support"
status: approved
---

# Test Plan: Add Agent Client Protocol (ACP) support

## Overview

Test plan for the Must-scope ACP milestone.
Covers every Must acceptance criterion, the telemetry events, the observability logs/metrics, and the edge/failure scenarios that matter for a partial-failure-safe, hot-path-sensitive feature.

**Testing stack:** Vitest (`vitest run`), following the repo's colocated `*.test.ts` / `*.test.js` convention (server tests in `packages/web/server/lib/*/`, UI tests in `packages/ui/src/**`).
The existing `packages/ui/src/sync/__tests__/event-pipeline*.test.js` and `event-pipeline.bench.js` are the reference patterns for the event-source translation and hot-path tests.

## Test Infrastructure and Fixtures

- **`FakeAcpConnection`** (new test helper): a stand-in for the SDK's `ClientSideConnection` that emits scripted `session/update` notifications on demand. Used to unit-test `acp-event-source` translation without a real subprocess. Lives in `packages/web/server/lib/acp/__tests__/fake-acp-connection.js`.
- **`MockLocalAgent`** (new): a minimal stdio ACP agent script (handshake + scripted prompt turn) for integration tests. Mirrors the SDK's example agents. Lives under `packages/web/server/lib/acp/__tests__/fixtures/`.
- **`mockRuntimeFetch`**: a fetch interceptor for `AcpClient` unit tests (the UI already mocks `runtimeFetch` in existing tests; reuse that pattern).
- **Existing event-pipeline test harness**: `packages/ui/src/sync/__tests__/` already drives the reducer/pipeline with synthetic events; reuse it to assert ACP-translated events reduce correctly without sync-layer changes.

## Unit Tests

### TC-1: AgentClient interface is implemented by both backends

**Level:** Unit
**Covers:** FR-1
**Setup:** Import `AgentClient`, `OpencodeService`, `AcpClient`.
**Steps:**
1. Assert `OpencodeService` satisfies `AgentClient` (type-level + runtime `backend === "opencode"`).
2. Assert `AcpClient` satisfies `AgentClient` (runtime `backend === "acp"`).
**Expected:** Both implement the interface; neither encodes single-client-only assumptions in its surface (NFR-2 reviewer check).

### TC-2: OpenCode path is byte-identical behind the adapter

**Level:** Unit
**Covers:** NFR-1, FR-1
**Setup:** `getActiveAgentClient()` returns the OpenCode client (default).
**Steps:**
1. Call session-create and prompt through `getActiveAgentClient()`.
2. Assert the calls delegate to the existing SDK paths with identical arguments.
**Expected:** No behavioral change vs the pre-adapter `opencodeClient` calls.

### TC-3: ACP text chunk translates to a text part delta

**Level:** Unit
**Covers:** FR-3, FR-4, assumption #1
**Setup:** `acp-event-source` wired to `FakeAcpConnection` feeding a captured event sink.
**Steps:**
1. Emit an `agent_message_chunk` notification `{messageId, content:{type:"text",text:"Hello"}}`.
2. Emit a second chunk appending `" world"`.
**Expected:** Two `message.part.delta` events are emitted to the sink, appending to a text part; synthesized message/part IDs use hex-timestamp format.

### TC-4: ACP tool_call creates a tool part

**Level:** Unit
**Covers:** FR-4, assumption #1
**Setup:** `acp-event-source` + `FakeAcpConnection`.
**Steps:**
1. Emit `tool_call` `{toolCallId:"call_1", title:"Read file", kind:"other", status:"pending"}`.
**Expected:** A `message.part.updated` event creates a tool part with `toolCallId` mapped to the part ID and the title/kind/status fields preserved.

### TC-5: ACP tool_call_update updates the tool part

**Level:** Unit
**Covers:** FR-4, assumption #1
**Setup:** TC-4 state (tool part exists).
**Steps:**
1. Emit `tool_call_update` `{toolCallId:"call_1", status:"completed", content:[{type:"content",content:{type:"text",text:"done"}}]}`.
**Expected:** A `message.part.updated` event updates status to `completed` and attaches result content.

### TC-6: stopReason maps to session status

**Level:** Unit
**Covers:** FR-3, assumption #1
**Setup:** `acp-event-source` + `FakeAcpConnection`.
**Steps:**
1. Resolve `session/prompt` with `{stopReason:"end_turn"}`.
2. Resolve another with `{stopReason:"cancelled"}`.
**Expected:** `session.status` idle emitted for both `end_turn` and `cancelled`.

### TC-7: Dropped connection surfaces an explicit error, not empty success

**Level:** Unit
**Covers:** NFR-4, FR-6
**Setup:** `acp-event-source` + `FakeAcpConnection` mid-turn.
**Steps:**
1. Emit a text chunk, then simulate a transport disconnect.
**Expected:** An explicit error `session.status` is emitted; prior streamed content is preserved; no empty-success event masks the failure.

### TC-8: Event source skips no-op updates and coalesces by key

**Level:** Unit
**Covers:** NFR-3 (performance rules)
**Setup:** `acp-event-source` + `FakeAcpConnection`.
**Steps:**
1. Emit repeated identical `tool_call_update` notifications (same status, same content).
2. Emit several same-key `session.status` notifications.
**Expected:** No-op updates are skipped; same-key events coalesce (no reference churn in the sink).

### TC-9: AcpClient transport failures throw

**Level:** Unit
**Covers:** NFR-4, FR-6
**Setup:** `AcpClient` with `mockRuntimeFetch` returning a non-success response / network error.
**Steps:**
1. Call `createSession`, `prompt`, `cancel`.
**Expected:** Each throws (does not swallow to empty success); callers can preserve prior state via outer try/catch.

### TC-10: Agent-process manager spawns, records, and reaps

**Level:** Unit
**Covers:** FR-2 (lifecycle), task 3
**Setup:** `agent-process-manager` with a temp registry dir.
**Steps:**
1. Spawn a trivial subprocess; assert a per-pid record is written.
2. Trigger teardown; assert the process is terminated and the record removed.
**Expected:** Per-pid files; no write contention; teardown cleans up.

### TC-11: Orphan reaper never kills a process a live instance uses

**Level:** Unit
**Covers:** NFR-5, task 3
**Setup:** `agent-process-manager` with synthetic registry entries (owner-alive vs owner-dead).
**Steps:**
1. Run the reaper with one entry whose owner pid is alive and one whose owner is dead.
**Expected:** Only the orphaned (owner-dead) process is reaped; the live-owner process is untouched.

## Integration Tests

### TC-12: Initialize handshake succeeds against a local stdio agent

**Level:** Integration
**Covers:** FR-2 (happy path)
**Setup:** `OPENCHAMBER_ACP_ENABLED=1`; `MockLocalAgent` configured.
**Steps:**
1. Call the initialize path.
**Expected:** Subprocess spawns, ACP `initialize` handshake completes, capabilities returned.

### TC-13: Initialize fails explicitly on an invalid agent command

**Level:** Integration
**Covers:** FR-2 (error), FR-6
**Setup:** `OPENCHAMBER_ACP_ENABLED=1`; agent command set to a nonexistent binary.
**Steps:**
1. Call the initialize path.
**Expected:** Non-success status + explicit error payload (never an empty success); OpenCode remains usable.

### TC-14: Streamed prompt turn renders live through the existing pipeline

**Level:** Integration
**Covers:** FR-3 (happy path), assumption #1 end-to-end
**Setup:** Initialized ACP session; UI sync-layer test harness consuming the SSE/WS stream.
**Steps:**
1. Submit a prompt; the `MockLocalAgent` streams text + a tool call.
2. Assert the events reduce into stores via the existing `event-pipeline`.
**Expected:** Assistant reply renders live; tool call is readable; no sync-layer code changes were required.

### TC-15: Mid-turn connection drop preserves content and errors

**Level:** Integration
**Covers:** FR-3 (error), NFR-4
**Setup:** Initialized ACP session; `MockLocalAgent` that disconnects mid-turn.
**Steps:**
1. Submit a prompt; agent streams partial text then drops.
**Expected:** Session enters an explicit error state; partial content is preserved; no empty success.

### TC-16: ACP failure does not break OpenCode sessions

**Level:** Integration
**Covers:** FR-6 (failure isolation), NFR-1
**Setup:** Both backends available; an ACP session failing.
**Steps:**
1. Trigger an ACP failure mid-turn.
2. Simultaneously exercise an OpenCode session.
**Expected:** OpenCode session is unaffected; the app does not enter a broken global state.

### TC-17: Endpoints are partial-failure-safe

**Level:** Integration
**Covers:** NFR-4, FR-6, task 8
**Setup:** `/api/agent/acp/*` routes mounted.
**Steps:**
1. Force a handshake failure, a prompt-transport failure, and a cancel of a non-existent session.
**Expected:** Each returns a non-success status with an explicit error payload; none returns an empty success.

## Telemetry Tests

### TC-18: Telemetry events fire with correct properties

**Level:** Unit/Integration
**Covers:** telemetry.md
**Setup:** Telemetry sink mocked.
**Steps:**
1. Drive initialize (success + error), session create, prompt submit, turn complete, transport error, agent selection.
**Expected:** `acp.initialize.result{outcome,durationMs}`, `acp.session.created`, `acp.prompt.submitted`, `acp.turn.completed{stopReason}`, `acp.transport.error{phase}`, `acp.agent.selected{backend,agentIdHash}` fire with correct properties; no prompt/reply/tool content in any payload; agent id is hashed.

## Observability Tests

### TC-19: Structured logs emit at the right points without secrets

**Level:** Unit/Integration
**Covers:** observability.md
**Setup:** Structured-logger capture.
**Steps:**
1. Drive spawn, handshake success/error, session new, transport disconnect, translate error, reap.
**Expected:** `acp.spawn`, `acp.handshake.complete`, `acp.handshake.error`, `acp.session.new`, `acp.transport.disconnected`, `acp.translate.error`, `acp.reap` emit; none contains `AcpAgentConfig.env`, command args, or any prompt/reply/tool content; only `agentIdHash`.

### TC-20: Metrics counters increment correctly

**Level:** Unit
**Covers:** observability.md
**Setup:** Metrics sink mocked.
**Steps:**
1. Drive the same lifecycle events.
**Expected:** `acp_handshake_total{outcome}`, `acp_turn_total{stopReason}`, `acp_transport_errors_total{phase}`, `acp_translate_errors_total`, `acp_orphan_reaped_total`, and the `acp_agents_active` gauge update correctly.

## End-to-End Tests

### TC-21: Select ACP, run a turn, revert to OpenCode

**Level:** E2E
**Covers:** FR-5 (happy + edge)
**Setup:** Full app; `MockLocalAgent` configured in settings.
**Steps:**
1. Configure + select the ACP agent; start a session; submit a prompt.
2. Switch the active backend back to OpenCode; start a session.
**Expected:** ACP session routes to ACP; after switching, new sessions route to OpenCode; existing ACP session remains intact.

### TC-22: Unavailable-in-runtime surfaces explicitly

**Level:** E2E
**Covers:** Cross-runtime parity (spec section 9)
**Setup:** A runtime with no server-side subprocess capability.
**Steps:**
1. Open the agent-selection affordance.
**Expected:** ACP selection is disabled/hidden with an explicit "unavailable in this runtime" message, not a silent failure.

### TC-25: Lifecycle calls scoped to active backend after a switch

**Level:** E2E
**Covers:** FR-5 (edge), task 10 routing caveat
**Setup:** An ACP session exists; switch the active backend back to OpenCode.
**Steps:**
1. With OpenCode now active, invoke a session-lifecycle call (`getSession`/`deleteSession`) scoped to the active backend.
2. Assert the surviving ACP session is not silently routed to the OpenCode backend (no wrong-backend call, no silent failure).
**Expected:** Lifecycle calls honor the active-backend scope; full per-session-backend routing is deferred to the Should lifecycle milestone but the Must scope does not misroute.

## Hot-Path / Performance Tests

### TC-23: Event-source translation sustains streaming rates

**Level:** Bench
**Covers:** NFR-3
**Setup:** `event-pipeline.bench.js`-style benchmark driving `acp-event-source` with a high-frequency chunk stream (~60/sec).
**Steps:**
1. Measure translation + reduction throughput under sustained streaming.
**Expected:** No `findIndex`/`filter` on the hot path; no-op skipping and coalescing keep the pipeline within existing streaming budgets; referential equality preserved.

### TC-24: Cancel forwards session/cancel and marks in-flight tool calls cancelled

**Level:** Integration
**Covers:** FR-3 (cancellation edge case)
**Setup:** Initialized ACP session mid-turn with a pending tool call.
**Steps:**
1. Call `AcpClient.cancel(sessionId)`.
**Expected:** A `session/cancel` notification is forwarded to the agent; the client pre-emptively marks in-flight tool calls as cancelled; the turn resolves with `stopReason:"cancelled"`.

## Coverage Summary

| Requirement | Test cases |
|---|---|
| FR-1 | TC-1, TC-2 |
| FR-2 | TC-10, TC-11, TC-12, TC-13 |
| FR-3 | TC-3, TC-6, TC-7, TC-14, TC-15, TC-23, TC-24 |
| FR-4 | TC-3, TC-4, TC-5, TC-14 |
| FR-5 | TC-21, TC-25 |
| FR-6 | TC-7, TC-9, TC-13, TC-15, TC-16, TC-17 |
| NFR-1 | TC-2, TC-16 |
| NFR-3 | TC-8, TC-23 |
| NFR-4 | TC-7, TC-9, TC-15, TC-17 |
| NFR-5 | TC-11 |
| Telemetry | TC-18 |
| Observability | TC-19, TC-20 |

## Open Questions

1. Confirm the repo has a telemetry-sink mock and a structured-logger capture helper already (used in TC-18/TC-19); if not, those helpers are added as part of task 13.
