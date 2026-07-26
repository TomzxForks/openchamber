---
issue: "#2010"
title: "Add Agent Client Protocol (ACP) support"
status: approved
---

# Requirements: Add Agent Client Protocol (ACP) support

## Overview

OpenChamber is coupled to a single agent backend (OpenCode): 152 UI files import `@opencode-ai/sdk`, and the web server embeds the OpenCode server in-process.
This feature introduces an agent-transport abstraction with a first ACP (Agent Client Protocol) client implementation, so the UI can talk to any ACP-compatible agent over stdio JSON-RPC instead of only OpenCode.
Per decision FEAT-2010-DEC-1, the first deliverable ships **single-client-at-a-time** (a swappable transport with OpenCode as default), behind a feature flag, covering the ACP `initialize` handshake, `session/new`, a full streamed prompt turn, content-block rendering, agent selection, and explicit error surfacing.
The OpenCode backend must remain fully functional when ACP is not in use.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| End users | Choose and use an ACP-compatible agent (e.g. Claude Code, Gemini CLI) from OpenChamber instead of being locked to OpenCode |
| OpenChamber maintainers | A clean agent-transport boundary that does not regress the OpenCode path and can be extended to parallel clients later |
| Agent ecosystem | ACP-compatible agents gain access to OpenChamber's multi-runtime UI |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-1 | Must | The system shall provide an `AgentClient` abstraction (transport interface + capability reporting) with at least two implementations: an OpenCode client (a **thin adapter** wrapping the existing `@opencode-ai/sdk` client, not a rewrite, to minimize regression risk) and an ACP client (JSON-RPC over stdio). |
| FR-2 | Must | The ACP client shall spawn a local stdio agent subprocess and complete the ACP `initialize` handshake (client `initialize` request, agent `initialized` notification), gated behind a feature flag so OpenCode remains the default active client. |
| FR-3 | Must | The system shall support ACP `session/new` to create an agent session and run a full prompt turn: send a user prompt and stream the agent's session/message notifications into the existing sync/event pipeline so the assistant reply renders live in the chat UI. |
| FR-4 | Must | The system shall map ACP content blocks (at minimum text blocks and tool-call blocks) onto the existing message-part renderers (text part, tool part) so streamed output displays correctly and tool calls are readable. |
| FR-5 | Must | The system shall provide a UI affordance to select and configure an ACP agent (command or executable path) and route a session to that agent instead of the OpenCode backend. |
| FR-6 | Must | The system shall surface connection and initialization failures explicitly (visible error state, non-success status) and shall keep the OpenCode backend fully functional when ACP is not selected or fails. |
| FR-7 | Should | The system shall handle ACP permission requests (agent-to-client permission requests for tool calls) in the existing permission UI. |
| FR-8 | Should | The system shall support a remote agent transport (HTTP and/or WebSocket) in addition to local stdio. |
| FR-9 | Should | The system shall map ACP `session/list`, `session/resume`, `session/close`, and `session/delete` onto the existing session sidebar and session lifecycle. |
| FR-10 | Should | The system shall advertise and invoke agent-provided slash commands discovered from the agent's reported capabilities. |
| FR-11 | Should | The system shall render agent plans, and support agent terminal and client-filesystem capabilities. |
| FR-12 | Should | The system shall forward user-configured MCP servers to the agent (and/or the editor-as-MCP-server proxy pattern). |

## Non-Functional Requirements

| ID | Requirement | Category |
|---|---|---|
| NFR-1 | The OpenCode backend shall exhibit no behavioral regression when ACP is disabled or not selected (no perf degradation, no changed API contracts). | Compatibility |
| NFR-2 | The agent-transport boundary shall be designed so a future parallel-client (registry) model does not require rewriting the boundary or the sync/session adapters. | Maintainability |
| NFR-3 | ACP stdio message handling on the hot path shall follow the event-pipeline performance rules: gate expensive work, skip no-op updates, coalesce by key, preserve referential equality in stores. | Performance |
| NFR-4 | The ACP client shall distinguish fetch/transport failure from empty success (throw or return null per the partial-failure-safe rule) so transient agent errors cannot masquerade as authoritative empty state. | Reliability |
| NFR-5 | Agent subprocess spawn, stdio transport, and JSON-RPC framing shall be implemented behind the server runtime (Express) or a server-backed bridge, not as direct browser subprocess access, preserving the runtime security boundary. | Security |
| NFR-6 | Agent configuration and secrets shall never be logged; subprocess invocation shall avoid exposing secrets in logs. | Security |
| NFR-7 | All user-facing strings introduced (labels, errors, empty states) shall go through the locale system. | Maintainability |

## Constraints

- OpenCode remains the default active client; ACP is opt-in behind a feature flag.
- Single active client at a time (decision FEAT-2010-DEC-1); parallel clients and per-client provider/model/skill stores are out of scope.
- A session is permanently bound to the client that created it; mid-session client switching is out of scope.
- Local stdio transport only in the Must scope; remote transport is a Should follow-up.
- No new third-party UI dependencies beyond an ACP/JSON-RPC client library if needed (and only if no suitable internal mechanism exists).
- Cross-runtime parity: any contract the shared UI depends on must be honored by web, desktop, and VS Code where the capability is available; subprocess spawning is inherently desktop/web-server-side and may be unavailable in some runtimes (must surface explicitly).
- Must not modify the `../opencode` repository (separate repo).

## Acceptance Criteria

- [ ] **FR-2** (happy path)
    - **Given** a feature flag is enabled and a valid ACP agent command is configured
    - **When** the user selects the ACP agent and starts a session
    - **Then** the system spawns the agent subprocess, completes the ACP `initialize` handshake, and reports the agent as ready
- [ ] **FR-2** (error)
    - **Given** a configured agent command does not exist or fails to spawn
    - **When** the user selects that agent
    - **Then** the failure is surfaced as a visible, non-success error state and OpenCode remains usable
- [ ] **FR-3** (happy path)
    - **Given** an initialized ACP session
    - **When** the user submits a prompt
    - **Then** the prompt is sent to the agent and the agent's session/message notifications stream into the existing sync/event pipeline so the reply renders live
- [ ] **FR-3** (error)
    - **Given** the agent connection drops mid-turn
    - **When** notifications stop arriving
    - **Then** the failure is distinguished from an empty success, the session enters an explicit error state, and prior streamed content is preserved
- [ ] **FR-4** (text)
    - **Given** an ACP text content block arrives
    - **When** it is mapped onto a message part
    - **Then** it renders through the existing text part renderer identically to OpenCode text parts
- [ ] **FR-4** (tool call)
    - **Given** an ACP tool-call content block arrives
    - **When** it is mapped onto a message part
    - **Then** it renders through the existing tool part renderer and is readable (tool name, input, status)
- [ ] **FR-5** (happy path)
    - **Given** the agent selection affordance
    - **When** the user configures an ACP agent command and selects it
    - **Then** subsequent sessions route to that agent instead of OpenCode
- [ ] **FR-5** (edge: revert)
    - **Given** an ACP agent is selected
    - **When** the user switches back to OpenCode
    - **Then** new sessions route to OpenCode and existing ACP sessions remain intact
- [ ] **FR-6** (failure isolation)
    - **Given** ACP is selected but fails to initialize
    - **When** the failure occurs
    - **Then** the error is visible, OpenCode is fully functional, and the app does not enter a broken global state
- [ ] **FR-1 + NFR-2** (boundary)
    - **Given** the `AgentClient` abstraction
    - **When** a reviewer inspects it
    - **Then** the transport interface and capability reporting do not encode OpenCode-specific or single-client-only assumptions that would block a future registry

## Conflicts

None identified yet.

## Open Questions

1. Where exactly should the ACP subprocess be spawned and bridged: inside the web server (Express, `packages/web/server`) and proxied to the UI over the existing runtime transport, or as a desktop-only capability in `packages/electron`? This determines cross-runtime availability and the UI-access path. (Touched by NFR-5; to be resolved in codebase-analysis/specification.)
2. Should the OpenCode client be retrofitted to implement the new `AgentClient` interface in this milestone (full abstraction), or kept as-is behind a thin adapter to minimize regression risk? **Resolved (review-requirements):** thin adapter. The OpenCode client wraps the existing SDK client and exposes the `AgentClient` interface without rewriting the integration, per FR-1.
3. What selection UX is preferred for FR-5: a sidebar dropdown, or a settings section? (UX detail; can be settled in specification, but a default should be chosen.)
4. Which ACP client library (if any) is used, versus a hand-rolled JSON-RPC-over-stdio implementation? (Resolve in existing-solutions.)
