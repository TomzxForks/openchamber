---
issue: "#2010"
title: "Add Agent Client Protocol (ACP) support"
status: approved
---

# Specification: Add Agent Client Protocol (ACP) support

## 1. Overview

OpenChamber reaches its agent backend through two planes: a **server-side event-stream plane** (agent → server `event-stream` → SSE/WS → UI sync layer) and a **UI-side imperative plane** (`opencodeClient` singleton → server → agent).
ACP support adds a second agent backend alongside OpenCode by introducing a swappable `AgentClient` abstraction in the UI and an ACP event source on the server, both behind a feature flag with OpenCode as the default.
The design keeps the UI sync layer (`event-pipeline`, `event-reducer`, stores, message-part renderers) untouched by translating ACP notifications into the existing normalized event protocol at the server seam.

This milestone covers the Must acceptance criteria only: stdio `initialize`, `session/new`, a streamed prompt turn, text + tool-call content rendering, agent selection, and explicit error surfacing.
Single-client-at-a-time per decision FEAT-2010-DEC-1.

## 2. Assumption #1 Validation (event-protocol mapping)

Performed a shape diff of ACP v1 prompt-turn notifications against OpenChamber's normalized event protocol.

| ACP notification | OpenChamber normalized event | Notes |
|---|---|---|
| `session/update` `sessionUpdate:"agent_message_chunk"` `{messageId, content:{type:"text",text}}` | `message.part.delta` / `message.part.updated` | Append-text semantics; translator synthesizes `messageID`/`partID` in OpenChamber's hex-timestamp format |
| `session/update` `sessionUpdate:"tool_call"` `{toolCallId,title,kind,status}` | `message.part.updated` (tool part created) | `toolCallId` → part ID; `title`/`kind`/`status` → tool part fields |
| `session/update` `sessionUpdate:"tool_call_update"` `{toolCallId,status,content[]}` | `message.part.updated` (tool part updated) | status transitions + result content |
| `session/prompt` response `{stopReason}` | `session.status` (busy → idle/error) | `end_turn`/`max_tokens`/… → idle; `cancelled` → idle; transport error → error state |
| `session/update` `sessionUpdate:"plan"` | (deferred) | Should milestone (agent plans) |
| `session/update` `sessionUpdate:"usage_update"` | (deferred) | Should milestone (quota) |
| `session/request_permission` | (deferred) | Should milestone (FR-7) |

**Result:** The core streamed turn (text + tool calls) maps onto existing events with no protocol widening.
Assumption #1 is **validated**; the sync layer stays reused as-is.
Translation lives entirely in a new server-side ACP event source.
Field-shape differences (ACP `messageId`/`toolCallId` casing) are handled by the translator, not by changing the UI contract.

## 3. Architecture

```
                          ┌─────────────────────────────────────────────┐
  UI (packages/ui)        │              OpenChamber server              │
                         │                                             │
  opencodeClient ────────┼──► AgentClient (active) ──► /api/agent/* ──► ActiveBackend selector
  (OpenCode adapter)      │                              (feature flag)  │
                         │                                    │         │
  ACP adapter (new) ─────┘                          ┌────────────────────┴───────────┐
                                                   │                                 │
                                          OpenCode backend (default)        ACP backend (new)
                                          createOpencodeServer              spawn stdio agent
                                          (unchanged)                       (@agentclientprotocol/sdk)
                                                   │                                 │
                                          upstream-reader ──┐         ACP event source ──┐
                                                  (events)   │                (events)    │
                                                             ▼                            ▼
                                                          global-hub  ◄── normalized event protocol ──► SSE/WS ──► UI sync layer (unchanged)
```

Two integration points:
- **Server event-stream plane (additive):** a new ACP event source translates ACP `session/update` notifications into the normalized event protocol and feeds `global-hub` exactly as `upstream-reader` does for OpenCode.
- **UI imperative plane (refactor):** an `AgentClient` interface replaces direct coupling to `opencodeClient` at the session-create and prompt seams; `OpencodeService` becomes a thin adapter; a new `AcpClient` adapter routes ACP sessions to the server's `/api/agent/acp/*` endpoints.

## 4. Data Model

### 4.1 AgentClient interface (UI)

```typescript
// packages/ui/src/lib/agent/types.ts (new)
export type AgentBackendType = "opencode" | "acp";

export interface AgentClient {
  /** Backend identifier. */
  readonly backend: AgentBackendType;
  /** Create a session bound to this backend. */
  createSession(init: SessionInit): Promise<SessionRef>;
  /** Send a prompt and return the client-generated message id. */
  prompt(params: PromptParams): Promise<string>;
  /** Cancel the in-flight turn (best-effort). */
  cancel(sessionId: string): Promise<void>;
  /** Reported capabilities (slash commands, etc.); minimal for Must scope. */
  capabilities(): AgentCapabilities;
}

// Active client is selected by agent type; default "opencode".
export function getActiveAgentClient(): AgentClient;
```

`OpencodeService` implements `AgentClient` by delegating to the existing SDK methods (thin adapter, no behavior change).
`AcpClient` implements `AgentClient` by calling server `/api/agent/acp/*` endpoints via `runtimeFetch`.

### 4.2 Agent configuration

```typescript
// packages/ui/src/lib/agent/config.ts (new) — persisted in config store
export type AcpAgentConfig = {
  id: string;              // stable id
  name: string;            // display name
  command: string;         // stdio agent command (e.g. "claude-code", "/path/to/agent")
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
};

export type AgentSelectionState = {
  activeBackend: AgentBackendType;   // default "opencode"
  activeAcpAgentId: string | null;   // which AcpAgentConfig is active, if backend="acp"
  agents: AcpAgentConfig[];
};
```

### 4.3 Server-side ACP process record (generalized registry)

```typescript
// One JSON file per spawned agent pid (mirrors managed-process-registry).
type AcpProcessRecord = {
  pid: number;
  agentId: string;        // links to AcpAgentConfig.id
  command: string;
  spawnedAt: string;      // ISO
  ownerPid: number;       // the OpenChamber process that spawned it
  transport: "stdio";
};
```

Stored under `~/.config/openchamber/managed-acp-agents/<pid>.json` (generalized from the OpenCode registry's per-pid-file model; no port verification since ACP stdio agents expose no port).

## 5. API Contracts

### 5.1 Server endpoints (new, behind feature flag `OPENCHAMBER_ACP_ENABLED`)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/agent/acp/initialize` | Spawn the configured stdio agent, run the ACP `initialize` handshake, return capabilities or an explicit error. |
| `POST` | `/api/agent/acp/session/new` | ACP `session/new`; returns a session ref. |
| `POST` | `/api/agent/acp/session/prompt` | ACP `session/prompt`; the response is delivered as streamed events (see 5.2), not a single body. |
| `POST` | `/api/agent/acp/session/cancel` | ACP `session/cancel`. |
| `POST` | `/api/agent/acp/shutdown` | Tear down the agent subprocess (orphan-reaped on process exit). |

All endpoints follow the partial-failure-safe rule: transport/handshake failures return a non-success status and an explicit error payload (never an empty success that could masquerade as authoritative state).

### 5.2 Event streaming (reuses existing SSE/WS)

ACP `session/update` notifications are translated server-side and pushed through `global-hub` onto the existing SSE/WS stream.
The UI receives them as normal `message.part.delta` / `message.part.updated` / `session.status` events.
No new UI transport, no new event types for the Must scope.

### 5.3 AgentClient imperative calls (UI → server)

The UI's `AcpClient` adapter calls the `/api/agent/acp/*` endpoints via `runtimeFetch` (authenticated transport to the same OpenChamber server).
The server forwards to the spawned agent over the SDK's `ClientSideConnection`.
Prompt results stream back via 5.2, so `AcpClient.prompt()` returns the client-generated message id immediately (matching the OpenCode adapter's contract).

## 6. Component Design

### 6.1 ACP event source (server, new)

`packages/web/server/lib/acp/acp-event-source.js` (new module).
Holds the `ClientSideConnection` for an active ACP agent.
Subscribes to ACP `session/update` notifications and emits normalized events into `global-hub`:
- `agent_message_chunk` (text) → synthesize message + part IDs (hex timestamp format) → emit `message.part.delta` (append text).
- `tool_call` → synthesize tool part ID from `toolCallId` → emit `message.part.updated` (create).
- `tool_call_update` → emit `message.part.updated` (status/content).
- `session/prompt` `stopReason` → emit `session.status` (idle on `end_turn`/`cancelled`/`max_tokens`; error on transport failure).

Coalescing and ordering follow the event-pipeline performance rules (skip no-op updates; coalesce same-key; preserve referential equality).
A dropped connection emits an explicit error `session.status` and never an empty success (NFR-4).

### 6.2 Agent-process manager (server, refactor)

Generalize `managed-process-registry.js` into `packages/web/server/lib/acp/agent-process-manager.js`:
- Reuse the per-pid-file, verified-reap, multi-runtime-safe model.
- Drop the OpenCode port-verification step (ACP stdio agents have no port); verify by recorded `command` + `agentId` match instead.
- VS Code parity implementation reads the same `~/.config/openchamber/managed-acp-agents/` dir (same parity contract as today's OpenCode registry).

### 6.3 AcpClient adapter (UI, new)

`packages/ui/src/lib/agent/acp-client.ts` (new).
Implements `AgentClient` by calling `/api/agent/acp/*` via `runtimeFetch`.
Owns its own failure/retry semantics (NFR-4): does not reuse the OpenCode HTTP provider-circuit; transport failures throw so callers preserve prior state.

### 6.4 Active-client selector (UI, refactor)

At the session-create and prompt seams (the Must-scope branching seams), replace direct `opencodeClient` calls with `getActiveAgentClient()` selected by `activeBackend`.
A verified method-surface audit shows the singleton is also called for session lifecycle (`getSession`, `updateSession`, `deleteSession`) and shell/command (`shellSession`, `sendCommand`); for the Must scope these remain OpenCode-context-only because ACP sidebar lifecycle is a Should milestone (FR-9). When the active backend switches back to OpenCode while an ACP session survives (FR-5 edge case), task 10 scopes lifecycle calls to the active backend so they do not silently route to the wrong backend; full per-session-backend routing is deferred to the Should lifecycle milestone.
All other singleton consumers (config/providers/models/agents/commands when OpenCode is active) keep calling `opencodeClient` unchanged.

### 6.5 Settings affordance (UI, extend)

New settings section under the existing Settings shell: agent selection (default OpenCode) + ACP agent list (command/path/args, enable toggle).
Follows the settings-section pattern; all strings via the locale system; theme tokens for styling.

## 7. Sequence: streamed prompt turn (ACP)

1. User selects an ACP agent in settings; `activeBackend = "acp"`, `activeAcpAgentId` set.
2. User starts a session; UI calls `getActiveAgentClient().createSession()` → `AcpClient` → `POST /api/agent/acp/session/new` → server `session/new` over `ClientSideConnection`.
3. Server registers the session with `global-hub` as an event source.
4. User submits a prompt; UI calls `getActiveAgentClient().prompt()` → `AcpClient` → `POST /api/agent/acp/session/prompt`; returns the client-generated message id immediately.
5. Agent streams `session/update` notifications; `acp-event-source` translates each into a normalized event on the SSE/WS stream.
6. UI `event-pipeline` reduces them into stores; existing text/tool renderers display the live reply (FR-3/FR-4).
7. Agent responds to `session/prompt` with `stopReason`; `acp-event-source` emits `session.status` idle.

## 8. Error Handling and Failure Isolation

- **Spawn/handshake failure:** `/api/agent/acp/initialize` returns non-success + explicit error; UI surfaces a visible error state (FR-6); OpenCode remains fully functional.
- **Mid-turn connection drop:** `acp-event-source` detects the dropped `ClientSideConnection`, emits an explicit error `session.status`, preserves prior streamed content (NFR-4 distinguishes failure from empty success).
- **Global isolation:** ACP failure never mutates global state; the failure is scoped to the ACP session. OpenCode sessions are unaffected.
- **Subprocess orphaning:** agent-process-manager reaps orphaned ACP agents on next startup using the verified-reap model.

## 9. Cross-Runtime Parity

- Web and desktop (Electron, server in-process): full ACP support.
- VS Code: the agent-process-manager parity implementation reads the same registry dir; the VS Code bridge forwards to the same `/api/agent/acp/*` endpoints. Subprocess spawning requires the server-side runtime; where unavailable, the affordance surfaces "unavailable in this runtime" explicitly rather than silently failing.
- Browser-only (no server): ACP is server-side by design (NFR-5); a browser cannot spawn subprocesses, so the affordance is hidden/disabled when no server runtime is present.

## 10. Security

- Subprocess spawn is server-side only (NFR-5); never direct browser subprocess access.
- Agent command configuration is validated server-side; arbitrary command execution is gated behind the existing UI auth/runtime transport.
- Secrets (agent env) are never logged (NFR-6).
- On Windows, non-user-visible agent subprocess helpers avoid console-window flashes per the AGENTS.md windowsHide guidance.

## 11. Out of Scope (deferred per decision FEAT-2010-DEC-1)

- Parallel clients / per-client provider/model/skill/command stores.
- Mid-session client switching (a session is bound to its creating client).
- Remote transport (HTTP/WebSocket).
- ACP `session/list`, `session/resume`, `session/close`, `session/delete` mapping onto the sidebar.
- Slash commands, agent plans, terminals, client-filesystem capabilities, MCP forwarding.
- Permission request UI (FR-7) — Should milestone.

## 12. Open Questions

1. Spec OQ1: does `@agentclientprotocol/sdk`'s `ClientSideConnection` allow server-side stdio with our managed child? **Resolved (task 5 spike):** the SDK does NOT own spawn. It consumes a web-streams `Stream` built via `ndJsonStream(stdinWritable, stdoutReadable)`. Our agent-process-manager owns the subprocess; task 6 converts the child's Node stdio to web streams (Node 22 `Readable.toWeb`/`Writable.toWeb`) and feeds them to `ClientApp.connectWith(stream, ...)`.
2. Final selection UX for FR-5: settings section (default in this spec) vs sidebar dropdown — confirm preference with the issue author.
