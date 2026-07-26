---
id: "7"
title: "Implement ACP event source (notification translation into global-hub)"
status: done
size: L
depends_on: ["6"]
completed_date: "2026-07-04"
blocker: null
---

# Task 7: Implement ACP event source (notification translation into global-hub)

## Description

Implement `packages/web/server/lib/acp/acp-event-source.js`: hold the `ClientSideConnection` for an active ACP agent, subscribe to ACP `session/update` notifications, and translate them into OpenChamber's normalized event protocol feeding `global-hub` (specification section 2 mapping).
This is the correctness-critical seam that lets the UI sync layer stay untouched (assumption #1).

## Acceptance Criteria

- [ ] `agent_message_chunk` (text) → `message.part.delta` (append text), with synthesized message/part IDs in hex-timestamp format.
- [ ] `tool_call` → `message.part.updated` (tool part created; `toolCallId` → part ID).
- [ ] `tool_call_update` → `message.part.updated` (status/content).
- [ ] `session/prompt` `stopReason` → `session.status` (idle on `end_turn`/`cancelled`/`max_tokens`; error on transport failure).
- [ ] A dropped connection emits an explicit error `session.status`, never an empty success (NFR-4).
- [ ] Hot-path performance rules honored: skip no-op updates, coalesce by key, preserve referential equality.
- [ ] A streamed turn from a local test agent renders live through the existing UI pipeline with no sync-layer changes.

## Notes

- Assumption #1 (`.sdlc/knowledge/assumptions/1-acp-event-protocol-mapping.md`) is validated by this task's end-to-end proof.
- If any ACP field lacks a target, decide additively (extend protocol) vs. reducer translation and record it.
