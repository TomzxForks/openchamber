---
issue: "#2010"
title: "Add Agent Client Protocol (ACP) support"
status: approved
---

# Feasibility Assessment: Add Agent Client Protocol (ACP) support

## Overview

This feature adds an ACP (Agent Client Protocol) client so OpenChamber can talk to any ACP-compatible agent over stdio JSON-RPC, decoupling the UI/runtime from the single OpenCode backend.
It is scoped to a single-client-at-a-time first milestone (decision FEAT-2010-DEC-1) behind a feature flag, covering initialize, `session/new`, a streamed prompt turn, content-block rendering, agent selection, and explicit error surfacing.
The assessment draws on the requirements, the existing-solutions survey (official `@agentclientprotocol/sdk`, internal process registry), and the codebase analysis (server event-stream normalization seam + `opencodeClient` singleton).

## Technical Feasibility

| Criterion | Assessment |
|---|---|
| Required technologies | Available in-house. TypeScript SDK (`@agentclientprotocol/sdk`, Apache-2.0, zero deps) handles the wire protocol; server already does subprocess management and event-stream normalization |
| Integration complexity | Medium. Two seams: server event-stream (additive ACP source feeding `global-hub`) and UI imperative plane (extract `AgentClient` interface + thin OpenCode adapter). Sync layer reused as-is if assumption #1 holds |
| Technical risks | (1) ACP notification → normalized-event mapping (assumption #1, High if wrong); (2) `opencodeClient` interface extraction across ~50 consumers without regression; (3) ACP failure/retry semantics differ from the OpenCode HTTP circuit (NFR-4) |
| Existing components to reuse | Official TS SDK; `managed-process-registry` (orphan-safe subprocess model); `global-hub`/`upstream-reader` (event fan-out); existing message-part renderers; settings-section pattern |

**Verdict:** Feasible with conditions

Conditions: validate assumption #1 (event-protocol mapping) in specification before committing to "sync layer untouched"; run an end-to-end spike with a local stdio test agent before finalizing the specification.

## Financial Feasibility

| Criterion | Assessment |
|---|---|
| Estimated effort | L (Large). Interface extraction + ACP client + server event source + process-manager generalization + settings affordance + end-to-end validation. Bounded by scoping to Must criteria; "Should" items are separate milestones |
| Infrastructure costs | None. ACP agents are local stdio subprocesses; no hosting or paid services in the Must scope |
| Third-party costs | None. Official SDK is Apache-2.0; ACP-compatible agents (Claude Code, Gemini CLI, codex-acp) are user-supplied |
| ROI expectation | High strategic value (removes single-backend lock-in, unlocks the ACP ecosystem) for a one-time L effort that establishes a reusable agent-transport boundary |

**Verdict:** Feasible

## Operational Feasibility

| Criterion | Assessment |
|---|---|
| Team availability | Available (maintainer-driven; issue author is a collaborator) |
| Skill gaps | None significant; TypeScript/React/Express are the existing stack; ACP protocol knowledge is acquired via the SDK + spec |
| Maintenance burden | Low-medium. The agent-transport boundary reduces future per-agent maintenance; the SDK tracks the protocol. Ongoing burden is monitoring the SDK/protocol stabilization (remote transport, v2) for later milestones |
| Organizational alignment | Strong. Aligns with the project's stated multi-runtime-agent goal; ACP is a standardizing protocol with broad editor/agent adoption |

**Verdict:** Feasible

## Go/No-Go Decision

**Overall verdict:** Go with conditions

**Conditions:**

- Validate assumption #1 (ACP streamed-turn notifications map onto the existing server event protocol) during `create-specification` via a shape diff and a local stdio spike. If it fails, re-scope the sync-layer change before implementation.
- Keep the first milestone strictly bounded to the Must acceptance criteria; "Should" items (permissions UI, remote transport, session lifecycle mapping, slash commands, plans, terminals, MCP forwarding) are explicit follow-up milestones, not part of this go decision.
- Preserve the OpenCode path byte-identically behind the feature flag (NFR-1); any change that risks the default backend blocks the go decision.

## Open Questions

1. After the event-protocol shape diff in specification, does any ACP field require an additive protocol extension (acceptable) or a reducer change (higher risk)? Determines final sync-layer scope.
2. Is the estimated L effort acceptable given current priorities, or should the first milestone be further trimmed (e.g. defer the settings UI in favor of an env-flag-only first cut)? This is a prioritization call for the issue author.
