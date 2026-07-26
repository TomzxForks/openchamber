---
issue: "#2010"
status: Active
---

# Assumption: ACP streamed-turn notifications map onto the existing server event protocol

**Date:** 2026-07-04
**Feature:** FEAT-2010 (ACP support)

## Assumption

The Agent Client Protocol's prompt-turn notifications (session/message update chunks: text deltas, tool-call updates, session status, terminal errors) can be translated at the server event-stream seam into OpenChamber's existing normalized event protocol (`session.status`, `message.part.delta`, `message.part.updated`, permission shapes) without widening that protocol in a breaking way.

## Basis

- The UI sync layer (`event-pipeline.ts`, `event-reducer.ts`) consumes the server's normalized event protocol over SSE/WS, not raw OpenCode SDK types.
- The server already performs one such translation today (`upstream-reader` reads OpenCode's event stream and normalizes it before fan-out via `global-hub`).
- ACP content blocks are text + tool-call oriented (Markdown default text), which align with the existing text/tool message-part renderers.

## Risk if Wrong

High.
If ACP notification shapes do not map onto the existing protocol fields, the sync layer cannot be reused as-is, and the changeability assessment's central claim (zero sync-layer changes) fails.
That would force reducer/store changes and widen the blast radius from "server + thin UI adapter" to "server + sync layer + stores," substantially increasing regression risk and scope.

## Validation Plan

- In `create-specification`, diff the ACP v1 Prompt Turn / Content / Tool Calls notification shapes against the existing event types in `packages/ui/src/sync/types.ts` and the server `event-stream/protocol.js`.
- Confirm each ACP streamed field has a target field; identify any gaps.
- If gaps exist, decide per gap: (a) extend the normalized protocol additively (acceptable), or (b) add a reducer-level translation (higher risk).
- Validate end-to-end with a local stdio test agent (SDK examples or `@agentclientprotocol/codex-acp`) before declaring the sync layer untouched.
