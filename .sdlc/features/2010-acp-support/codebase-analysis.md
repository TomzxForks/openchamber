---
issue: "#2010"
title: "Add Agent Client Protocol (ACP) support"
status: approved
---

# Codebase Analysis: Add Agent Client Protocol (ACP) support

## Overview

The relevant existing code splits into two integration planes: a **server-side event-stream plane** (OpenCode → `upstream-reader` → `global-hub` → SSE/WS → UI) and a **UI-side imperative plane** (`opencodeClient` singleton, ~50 consumers).
The changeability outlook is favorable for a low-regression first milestone because the server already normalizes upstream events into its own event protocol before they reach the UI.
If ACP notifications are translated into that same event protocol at the server's event-stream seam, the entire UI sync layer (`event-pipeline`, `event-reducer`, stores, message-part renderers) can be **reused as-is**.
The required changes concentrate in three places: a new `AgentClient` abstraction + OpenCode thin adapter + ACP adapter in the UI imperative plane; a new ACP event source + generalized agent-process manager on the server; and a small agent-selection affordance in settings.

## Scope of Analysis

Examined: the UI OpenCode client wrapper, the sync layer, the stores, the message-part renderers, the runtime-switch/runtime-fetch layer, the server OpenCode integration, the server event-stream lib, and the managed-process-registry.

Search entry points: `rg` for `@opencode-ai/sdk`, `opencodeClient`, `child_process`/`node-pty`/`bun-pty`, `json-rpc`, `EventSource`/`WebSocket`, `promptAsync`, `session.`; direct reads of `packages/ui/src/lib/opencode/client.ts`, `packages/ui/src/lib/runtime-switch.ts`, `packages/ui/src/sync/sync-context.tsx`, `packages/ui/src/sync/event-pipeline.ts`, `packages/web/server/lib/opencode/managed-process-registry.js`, `packages/web/server/lib/event-stream/`.

Out of scope: the OpenCode repository itself (`../opencode`, must not modify); the "Should"-milestone features (remote transport, session lifecycle mapping, slash commands, plans, terminals, MCP forwarding); parallel-client/per-client store refactors (deferred per decision FEAT-2010-DEC-1).

## Relevant Existing Components

| Component | Path | Responsibility | Interaction |
|---|---|---|---|
| OpenCode client wrapper (singleton) | `packages/ui/src/lib/opencode/client.ts` (1855 lines) | Imperative SDK calls: session create/prompt, config, providers, models, agents, permissions, messages | Refactor (extract interface, add adapter) |
| Sync event pipeline | `packages/ui/src/sync/event-pipeline.ts`, `event-reducer.ts` | Reduces SSE/WS events into store updates (`session.status`, `message.part.delta/updated`) | Reuse as-is |
| Sync context / bootstrap | `packages/ui/src/sync/sync-context.tsx`, `bootstrap.ts` | Roots the sync layer; establishes SSE/WS stream; bootstraps sessions | Reuse as-is (possibly extend for agent capability reporting) |
| Stores | `packages/ui/src/stores/*` | Zustand stores (sessions, permissions, config, agents, commands, etc.) | Reuse as-is (single-client assumption holds) |
| Message-part renderers | `packages/ui/src/components/chat/message/parts/*` | Renders text, tool, reasoning, generated-JSON parts | Reuse as-is (ACP blocks map onto existing parts) |
| Runtime switch / fetch / url / auth | `packages/ui/src/lib/runtime-switch.ts`, `runtime-fetch.ts`, `runtime-url.ts`, `runtime-auth.ts` | UI runtime host selection + authenticated transport to the OpenChamber server | Reuse as-is (ACP is a server-side agent, not a new UI runtime host) |
| Server event-stream lib | `packages/web/server/lib/event-stream/` (`upstream-reader.js`, `global-hub.js`, bridges, `protocol.js`) | Reads upstream OpenCode events, fans out to UI clients over SSE/WS | Extend (add an ACP event source) |
| Server OpenCode integration | `packages/web/server/lib/opencode/` + `packages/web/server/index.js` (`createOpencodeServer`, `startWebUiServer`) | Embeds/boots OpenCode server, routes, lifecycle | Extend (wire agent lifecycle, feature flag) |
| Managed process registry | `packages/web/server/lib/opencode/managed-process-registry.js` | Orphan-safe per-pid subprocess registry + verified reaper | Refactor (generalize for ACP agents) |
| Server terminal runtime | `packages/web/server/lib/terminal/runtime.js` | PTY subprocess + WS bridge (pattern reference) | Read-only (pattern source) |
| Settings UI | `packages/ui/src/components/views/SettingsView.tsx`, `components/sections/` | Settings shell + sections | Extend (agent selection + config section) |

## Dependency and Coupling Map

- The `opencodeClient` singleton is imported by ~50 UI modules and wraps the SDK's `createOpencodeClient`.
  This is the tightest coupling in the UI imperative plane, but it is a single module boundary: all consumers go through `opencodeClient`, not the raw SDK.
- The UI sync layer is **decoupled from OpenCode by the server event protocol**: the UI consumes normalized events (`session.status`, `message.part.delta`, `message.part.updated`, permission, etc.) over SSE/WS, not raw OpenCode SDK types.
  This is the critical enabler: an ACP event source that emits the same normalized protocol needs zero sync-layer changes.
- The server event-stream plane funnels everything through `global-hub` (fan-out) with `upstream-reader` (one upstream source today: OpenCode).
  Adding a second upstream source (ACP) is an additive change at this seam.
- Stores assume a single global source of truth (providers, models, agents, commands).
  Per decision FEAT-2010-DEC-1 this assumption is intentionally preserved for the first milestone, so stores are not touched.
- Synchronous vs asynchronous: imperative calls (`promptAsync`, session create) are async request/response through `opencodeClient`; streaming is async push via SSE/WS.
  Both planes must route ACP sessions through the ACP path while OpenCode sessions keep their path.

## Changeability Assessment

### OpenCode client wrapper (`packages/ui/src/lib/opencode/client.ts`)

- **Current state:** A single `OpencodeService` class exported as the `opencodeClient` singleton; wraps `createOpencodeClient` and centralizes prompt/session/config/provider/model/agent/permission calls with retry, provider-circuit, and directory normalization.
- **Change disposition:** Refactor (extract an `AgentClient` interface; make `OpencodeService` a thin adapter implementing it; keep `opencodeClient` as the OpenCode instance).
- **Rationale:** FR-1 mandates an `AgentClient` abstraction with an OpenCode thin adapter. Consumers already route through the singleton, so extracting the interface and selecting the active client by agent type is localized; the 1855-line body stays the OpenCode implementation.
- **Risk:** Medium. The singleton is widely consumed (~50 modules); the refactor must preserve every method signature consumers use. Mitigated by extracting only the interface and selecting the active client at the seams that actually branch on agent type (session create + prompt), leaving other calls (config/providers/models when OpenCode is active) untouched.
- **Constraints:** Method signatures consumed today must not change; behavior of the OpenCode path must be byte-identical when ACP is not selected (NFR-1).

### Sync event pipeline + reducer + stores + renderers

- **Current state:** Reduce SSE/WS events into Zustand stores; renderers consume message parts.
- **Change disposition:** Reuse as-is.
- **Rationale:** The UI never sees raw OpenCode SDK event types; it sees the server's normalized event protocol. If the server's ACP event source emits that same protocol, no reducer/store/renderer changes are needed for FR-3/FR-4.
- **Risk:** Low.
- **Constraints:** The normalized event protocol (`session.status`, `message.part.delta/updated`, permission shapes) is the contract the ACP server source must satisfy; it must not be widened in a breaking way.

### Server event-stream lib (`packages/web/server/lib/event-stream/`)

- **Current state:** `upstream-reader` reads the OpenCode event stream; `global-hub` fans out to UI clients; bridges adapt SSE/WS.
- **Change disposition:** Extend (add an ACP event source that translates ACP session/message notifications into the normalized event protocol and feeds `global-hub`).
- **Rationale:** This is the single seam where a second agent backend can join without touching the UI. Additive: a new source module alongside `upstream-reader`, sharing the hub.
- **Risk:** Medium. Correctness of the ACP → normalized-event translation determines whether streamed replies render live (FR-3) and tool calls are readable (FR-4). Coalescing/ordering rules from the performance rules (skip no-ops, coalesce by key) apply.
- **Constraints:** Must preserve event ordering semantics and the partial-failure-safe rule (a dropped ACP connection must surface as an explicit error state, not an empty success).

### Managed process registry (`packages/web/server/lib/opencode/managed-process-registry.js`)

- **Current state:** Orphan-safe per-pid registry; verifies a live pid is `opencode serve` on a recorded port before reaping; multi-runtime safe via one file per pid.
- **Change disposition:** Refactor (generalize into an agent-process manager: record agent command + pid; drop the port-verification step for stdio ACP agents; keep the verified-reap safety model).
- **Rationale:** Reuse the hardened orphan-reap model (existing-solutions recommendation #2) instead of inventing lifecycle handling for ACP subprocesses.
- **Risk:** Low-medium. Generalization must not weaken the existing OpenCode reaping guarantees.
- **Constraints:** Never reap a process a live instance is using; per-pid files (no write contention); VS Code carries a parity implementation reading the same dir.

### Server OpenCode integration + bootstrap (`packages/web/server/lib/opencode/`, `index.js`)

- **Current state:** `createOpencodeServer`/`startWebUiServer` boot the OpenCode server in-process; feature-routes-runtime wires runtime endpoints.
- **Change disposition:** Extend (wire ACP agent lifecycle behind a feature flag; route ACP sessions to the ACP event source + the ACP imperative path; keep OpenCode as default).
- **Rationale:** FR-2 requires the feature flag; FR-6 requires failure isolation. The bootstrap is the natural place to register the active agent backend.
- **Risk:** Medium. Must keep OpenCode fully functional when ACP is off (NFR-1) and avoid global broken state on ACP failure (FR-6).
- **Constraints:** Feature flag default-off; no regression to the OpenCode boot path.

### Runtime switch / fetch / url / auth layer

- **Current state:** Selects the OpenChamber server runtime URL and authenticated transport; used by `opencodeClient` and `runtimeFetch`.
- **Change disposition:** Reuse as-is.
- **Rationale:** ACP is a server-side agent reached through the same OpenChamber server runtime, not a new UI runtime host. The UI still talks to one OpenChamber server; that server internally routes to OpenCode or ACP.
- **Risk:** Low.
- **Constraints:** None beyond preserving current behavior.

### Settings UI + agent-selection affordance

- **Current state:** Settings shell with section-based layout; shared primitives under `components/sections/shared/`.
- **Change disposition:** Extend (add an agent-selection + ACP-agent-config section; default OpenCode).
- **Rationale:** FR-5 requires a UI affordance to select and configure an ACP agent. Follows the existing settings-section pattern.
- **Risk:** Low.
- **Constraints:** Locale system for all strings; theme tokens for styling; no direct `sonner` imports.

## Migration and Impact Considerations

- **AgentClient interface extraction (Refactor):** Introduce the interface; make `OpencodeService` implement it; introduce an `AcpClient` implementing it; introduce an active-client selector. Roll out behind the feature flag (default OpenCode). De-risk by keeping `opencodeClient` as the OpenCode adapter instance so existing imports keep working during migration; branch only at session-create/prompt seams initially.
- **ACP event source (Extend):** Add the source module; feed `global-hub`; verify end-to-end that a streamed ACP reply renders live via the existing pipeline before exposing the flag. De-risk with a local stdio test agent (the SDK ships examples; `@agentclientprotocol/codex-acp` is also available as a real agent).
- **Agent-process manager (Refactor):** Generalize the registry; dual-run with the existing OpenCode registry during migration; ensure VS Code parity implementation is updated to read the generalized dir/layout.
- **Backward compatibility:** The OpenCode path must be byte-identical when ACP is off. No persisted data format changes. No public API contract changes visible to the UI beyond the new `AgentClient` interface and agent-selection config.
- **What else could break:** provider-circuit/retry logic in `opencodeClient` is OpenCode-specific (HTTP status based); the ACP path needs its own failure/retry semantics (NFR-4) rather than reusing the HTTP-circuit. Settings/config storage must add agent-selection fields without disrupting existing config.

## Assumptions About Existing Code

- The server's normalized event protocol is rich enough to represent an ACP streamed turn (text deltas, tool-call updates, session status, terminal error) without widening the protocol. To be validated in specification by diffing ACP notification shapes against the existing event types. (Promotes to a formal assumption below.)
- **Method-surface audit (verified):** the `opencodeClient` singleton is called across ~35 distinct methods. The Must-relevant branching seams are `createSession` (4 callers) and `sendMessage`/prompt (6). However, session-lifecycle methods (`getSession` 7, `updateSession` 4, `deleteSession` 4, `summarizeSession`, `revertSession`, `forkSession`) and shell/command methods (`shellSession` 4, `sendCommand` 4) are also called on sessions by the UI. For the Must scope these are OpenCode-context-only because ACP session-lifecycle mapping (list/resume/close/delete) is a Should milestone (FR-9); the `AgentClient` interface therefore exposes only `createSession`/`prompt`/`cancel` for now. The interface is designed to grow these methods when ACP sessions gain sidebar lifecycle.
- The managed-process-registry's safety model (per-pid files, verified reap) transfers to stdio ACP agents without the port-verification step, since ACP stdio agents expose no port.

## Open Questions

1. Which exact notification shapes does ACP emit during a prompt turn (session/message update chunk shapes), and do they map 1:1 onto the existing `message.part.delta`/`message.part.updated` fields, or is a reducer-level translation needed at the server seam? (Determines whether the sync layer stays 100% untouched; resolve in specification.)
2. Where do agent-selection + ACP-agent config persist (alongside existing config store, or a dedicated agent-config store)? (Settings detail; resolve in specification.)
3. Does the provider-circuit/retry logic in `opencodeClient` need to be lifted into the `AgentClient` interface, or can the ACP path bypass it entirely with its own failure semantics? (Resolve in specification; preliminary view: ACP bypasses the HTTP circuit per NFR-4.)
