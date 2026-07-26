---
issue: "#2010"
status: Accepted
---

# Decision: Single active ACP client at a time (swappable), not parallel

**Date:** 2026-07-04
**Status:** Accepted
**Deciders:** SDLC pipeline (architectural scoping for FEAT-2010)

---

## Context

The needs assessment for ACP support (FEAT-2010) flagged an unresolved scoping question from the issue author: should ACP support one agent client at a time, or multiple agent clients running in parallel?
This decision gates the entire requirements and specification effort because it determines whether the agent abstraction is a single swappable transport or a multi-tenant registry.

The current codebase assumes a single global source of truth: 152 files import `@opencode-ai/sdk` directly, and providers, models, skills, slash commands, capabilities, and auth are all rendered as if there is exactly one backend (OpenCode).
Making these per-client for parallel agents would be a refactor of that same surface area, far larger than the "Must" acceptance criteria, which describe routing "a session" to "an agent" (singular) behind a feature flag.

## Options Considered

### Option A: Single active client at a time (swappable transport) *(chosen)*

One agent backend is active for the app at a time: OpenCode (default) or one ACP agent.
The agent transport is an abstraction behind which the active client is selected.
Sessions are bound to the client that created them.

**Pros:**
- Minimal viable decoupling; satisfies all "Must" acceptance criteria.
- Avoids the per-client store refactor for providers/models/skills/commands in the first milestone.
- Keeps the UI's existing single-source-of-truth assumptions intact.
- Can be designed so the transport abstraction is later promotable to a registry without rewriting the boundary.

**Cons:**
- Cannot run OpenCode and an ACP agent side by side in the same app instance.
- Switching the active client globally is a coarser UX than parallel clients.

### Option B: Multiple parallel clients (multi-tenant registry)

A registry of agent clients, each with its own providers, models, skills, slash commands, capabilities, and auth.
The sidebar merges sessions across clients with a per-session client indicator; tabs are scoped to the selected client.

**Pros:**
- Most flexible UX; matches the issue author's "merged sidebar" vision.
- Truly decouples the concept of "agent" from a singleton.

**Cons:**
- Requires refactoring every global assumption (providers, models, skills, commands, capabilities, auth) into per-client stores across 150+ files.
- Far exceeds "Must" scope; high risk of regressions in the working OpenCode path.
- Forces decisions on mid-session client switching and cross-client conflict resolution before any ACP code ships.

## Decision

Ship single-client-at-a-time first.
The ACP client is implemented as a swappable agent transport selected at the app/session level, with OpenCode remaining the default behind a feature flag.
Design the transport boundary (the `AgentClient` abstraction and the sync/session adapters) so it does not preclude a future registry, but do not build the registry, per-client stores, or merged-sidebar UX in this milestone.

## Trade-offs

- **Gained:** A deliverable that fits the "Must" criteria and the available risk budget; a clean transport boundary to extend later.
- **Sacrificed:** Parallel-client use cases until a follow-up milestone; the merged-sidebar UX described in the issue comment is deferred.

## Consequences

- Requirements and specification must define an `AgentClient` interface (transport + capability reporting) with one OpenCode implementation (wrapping today's behavior) and one ACP implementation (stdio JSON-RPC).
- Per-client concepts (providers, models, skills, commands) remain global in this milestone; a follow-up decision will address the multi-tenant model when parallel support is prioritized.
- Mid-session client switching is out of scope; a session is permanently bound to the client that created it.
- The "Should" criteria around remote transport, session lifecycle mapping, slash commands, plans, terminals, and MCP forwarding become follow-up milestones, not first-deliverable requirements.
