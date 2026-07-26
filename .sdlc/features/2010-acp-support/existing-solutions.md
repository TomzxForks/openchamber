---
issue: "#2010"
title: "Add Agent Client Protocol (ACP) support"
status: approved
---

# Existing Solutions: Add Agent Client Protocol (ACP) support

## Overview

Surveyed the ACP protocol surface, the official TypeScript SDK, existing ACP client applications, and the internal codebase for reusable subprocess/process-management code.
The recommended direction is **hybrid**: adopt the official `@agentclientprotocol/sdk` for the ACP wire protocol (do not hand-roll JSON-RPC), adopt and extend the internal `managed-process-registry` pattern for subprocess lifecycle, borrow UI/session-aggregation patterns from existing ACP clients (Zed, Codeg, ACP UI), and build the OpenChamber-specific `AgentClient` abstraction and the OpenCode thin adapter ourselves (no off-the-shelf fit).

## Search Scope

| Source | Searched | Notes |
|---|---|---|
| Internal codebase | Yes | `rg` for `child_process`, `node-pty`, `bun-pty`, `json-rpc`, `jsonrpc`; inspected `lib/opencode/managed-process-registry.js`, `lib/terminal/runtime.js` |
| Open-source | Yes | npm: `@agentclientprotocol/sdk`, `@agentclientprotocol/codex-acp`; project deps checked for existing JSON-RPC libs (none) |
| Commercial / SaaS | Yes | ACP clients list (Codeg, ACP UI, DeepChat, Agent Studio, Braide, etc.) |
| Standards / protocols | Yes | ACP v1 spec pages: introduction, transports, initialization, prompt-turn, content, tool-calls, session lifecycle, slash commands; RFDs for remote transport and v2 |
| Reference material | Yes | ACP TypeScript library page, clients page, Zed external-agents docs |

## Candidate Solutions

| Solution | Type | License | Maturity | Covers | Gaps |
|---|---|---|---|---|---|
| `@agentclientprotocol/sdk` (official TS SDK) | Library | Apache-2.0 | Active (v1.1.0, 2026-06-29) | FR-2, FR-3 wire protocol: `ClientSideConnection`, initialize handshake, session/new, prompt turn, content/tool-call blocks, notifications | Does not provide OpenChamber UI integration, store adapters, or subprocess lifecycle/orphan reaping |
| Internal `managed-process-registry.js` | Internal | Project | Mature (in production for OpenCode server) | NFR-5, NFR-6 (subprocess): orphan-safe per-pid registry, verified reaping, multi-runtime safe | Agent-protocol agnostic; only manages process lifecycle, not stdio JSON-RPC |
| Internal `lib/terminal/runtime.js` (PTY + WS bridge) | Internal | Project | Mature | Pattern for bridging a server-side subprocess to the UI over WebSocket | PTY/terminal specific, not JSON-RPC framed |
| Zed external-agents integration | Reference | Copyleft (unverified specific license) | Mature (canonical editor reference) | FR-2, FR-3, FR-4, FR-7: full editor-side ACP client | Read-only design reference only; no code reuse regardless of license |
| Codeg (multi-agent workbench) | Product | OSS | Active | Session aggregation across ACP agents incl. OpenCode; very close to OpenChamber's goal | Separate product; reference for UX/session model, not code reuse |
| ACP UI / DeepChat / Agent Studio | Product | OSS | Active | Cross-platform web/desktop ACP client UI | Separate products; reference for content-block rendering patterns |
| ACP Components (zvzuola) | Library | OSS | Active | Reusable ACP frontend components | Adds a dependency; OpenChamber already has its own message-part renderers (FR-4 maps onto existing ones) |
| Hand-rolled JSON-RPC over stdio | Build | n/a | n/a | Full control | Reinvents the wheel the official SDK already provides; higher risk and maintenance |

## Evaluation

### @agentclientprotocol/sdk (official TS SDK)

- **Strengths:** Official, maintained by the ACP team; provides `ClientSideConnection` (the client side we need) and `AgentSideConnection`; zero runtime dependencies; Apache-2.0; covers initialize, session setup, prompt turn, content blocks, tool calls, notifications; tracks the stabilizing protocol (session list/resume/close/delete all stabilized).
- **Weaknesses:** 2.6 MB unpacked (includes examples/types); the remote transport (HTTP/WS) is still an RFD, so SDK support for remote may be preliminary (acceptable, since Must scope is stdio only).
- **Integration effort:** Low-medium. The SDK handles framing and the request/notification dispatch; we wrap `ClientSideConnection` behind our `AgentClient` interface and feed its notifications into the existing sync/event pipeline.
- **Cost:** Free (Apache-2.0).
- **Risks:** Low. Permissive license; maintained; protocol is stabilizing with clear RFD process. Adopting it couples us to the SDK's release cadence, but that is the intended coupling (we want to track the protocol).
- **Forward compatibility:** Good. The SDK follows the protocol's stabilization/RFD process; additive protocol changes should not break a `ClientSideConnection` consumer that ignores unknown notifications. We should pin a minor range and validate on upgrade.

### Internal `managed-process-registry.js`

- **Strengths:** Production-hardened pattern for exactly our subprocess problem: spawn an external binary, record its pid in a per-pid file, verify before reaping, never kill a process a live instance is using, multi-runtime safe.
- **Weaknesses:** Currently OpenCode-specific (verifies the process is `opencode serve` on a recorded port); would need a generalized variant for ACP agents (different command, no fixed port, stdio transport).
- **Integration effort:** Medium. Generalize the registry into a process-manager that records agent command + pid, reuses the verified-reap safety model, and drops the port-verification step (ACP stdio agents have no port).
- **Cost:** Free (internal).
- **Risks:** Low. The safety model is the valuable part and transfers directly.
- **Forward compatibility:** The registry is an internal module; generalizing it is a local refactor.

### Zed external-agents (reference only)

- **Strengths:** Canonical editor-side ACP client; demonstrates the full initialize → session → prompt-turn → content/tool-call → permission flow we need.
- **Weaknesses:** Not a code-reuse candidate (different language; Zed's components carry copyleft licenses, so it is treated strictly as read-only design reference).
- **Integration effort:** n/a (reference only).
- **Cost:** Free to read.
- **Risks:** None (design reference only; no code reuse).
- **Forward compatibility:** n/a.

## Recommendation

**Direction:** Hybrid.

1. **Adopt** `@agentclientprotocol/sdk` as the ACP wire-protocol client. Wrap `ClientSideConnection` behind the OpenChamber `AgentClient` interface. Do not hand-roll JSON-RPC over stdio. This resolves open question 7 (library choice) in favor of the official SDK.
2. **Adopt and extend** the internal `managed-process-registry` pattern into a generalized agent-process manager (orphan-safe spawn/reap for stdio ACP agents, without the OpenCode port-verification step). This satisfies NFR-5/NFR-6 without inventing a new lifecycle model.
3. **Borrow design** (not code) from Zed's external-agents integration and from Codeg/ACP UI for: the initialize handshake sequence, prompt-turn notification mapping, content-block → message-part translation, and session-aggregation UX cues. These are reference sources, not dependencies.
4. **Build** the OpenChamber-specific pieces: the `AgentClient` abstraction (transport interface + capability reporting), the OpenCode thin adapter (FR-1), the ACP adapter, and the sync/event-pipeline bridge that maps ACP notifications onto existing `session.status` / `message.part.delta` / `message.part.updated` handlers.
5. **Do not adopt** `ACP Components` or any external ACP UI kit; OpenChamber already has its own message-part renderers (FR-4 maps ACP content blocks onto existing renderers), and NFR/constraints forbid unnecessary new UI dependencies.

Rationale: the wire protocol and the process lifecycle are solved problems (official SDK + internal registry); the integration into OpenChamber's sync layer and the agent-transport abstraction are not solved by any existing solution and must be built. This minimizes reinvention while keeping the boundary OpenChamber-owned.

## Sources of Information

- `@agentclientprotocol/sdk` `ClientSideConnection`: the request/notification dispatch model and the initialize/session/prompt-turn method surface to mirror in the `AgentClient` interface.
- ACP v1 spec — Initialization, Prompt Turn, Content, Tool Calls: the exact notification names and content-block shapes that must map onto `message.part.delta`/`message.part.updated` and the existing text/tool renderers.
- Internal `managed-process-registry.js`: the per-pid-file, verified-reap, multi-runtime-safe orphan model to reuse for ACP agent subprocess lifecycle.
- Internal `lib/terminal/runtime.js`: the server-side-subprocess-to-UI-over-WebSocket bridge pattern (relevant if ACP sessions are driven server-side).
- Zed external-agents docs and Codeg: session-aggregation and content-rendering design cues for later "Should" milestones (session list/resume, parallel clients).
- ACP RFDs (Streamable HTTP & WebSocket Transport, v2): the roadmap for the remote transport and parallel/multi-session features deferred per decision FEAT-2010-DEC-1.

## Open Questions

1. Does the official `@agentclientprotocol/sdk` expose a transport abstraction that lets us plug a server-side stdio bridge (so the SDK's `ClientSideConnection` can run server-side and forward to the UI), or must the SDK live entirely server-side with our own thin relay to the browser? To be validated during specification by reading the SDK's transport API. (Relates to open question 5: subprocess bridge location.)
2. The SDK is 2.6 MB unpacked; confirm it tree-shakes acceptably for the server bundle (it will not ship to the browser) during implementation.
