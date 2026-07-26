---
issue: "#2010"
title: "Add Agent Client Protocol (ACP) support"
status: approved
---

# Needs Assessment: Add Agent Client Protocol (ACP) support

## Problem Statement

OpenChamber is hard-coupled to a single agent backend, OpenCode.
The UI imports the OpenCode SDK directly in 152 files, the web server embeds and boots the OpenCode server in-process, and every chat session, permission, tool call, provider, model, skill, and slash command is routed through that one integration.
The underlying problem is vendor lock-in: users cannot choose a different coding agent, and OpenChamber cannot adopt emerging agents that speak the standardized Agent Client Protocol (ACP).
As ACP adoption grows (Claude Code, Gemini CLI already appear in the public registry), OpenChamber's inability to talk to any ACP-compatible agent becomes a competitive and flexibility gap, not just a code-structure smell.

## Stakeholders

| Stakeholder | Role | How they experience the problem |
|---|---|---|
| End users | user | Locked to OpenCode; cannot use Claude Code, Gemini CLI, or any future ACP agent from OpenChamber's UI |
| OpenChamber maintainers | developer | Every agent-related feature is built against OpenCode-specific types; switching or adding backends requires touching 150+ files |
| Agent ecosystem | third-party | ACP-compatible agents cannot reach OpenChamber's polished multi-runtime UI |

## Evidence of Need

| Source | What it shows | Strength |
|---|---|---|
| ACP public registry | Claude Code, Gemini CLI already listed as compatible agents | Moderate (ecosystem traction is real but early) |
| Issue author scoping comment | Detailed architectural questions about single-vs-parallel clients indicate committed intent to build | Moderate (author conviction, not user demand) |
| User demand / support tickets | None surfaced; issue-tracker search found no prior ACP requests and no requests for other agents | Weak (no external demand data) |
| Codebase coupling analysis | 152 files import `@opencode-ai/sdk`; 182 reference opencode client/server | Architectural indicator (explains difficulty and the absence of a code-free alternative; not a demand signal) |

**Evidence rating:** Moderate

The strongest *need*-evidence (registry traction, author intent) is Moderate, and external user demand is genuinely Weak, confirmed by an issue-tracker search that found no prior requests for ACP or for other agents.
The need is therefore strategic (position OpenChamber for ACP growth) and architectural (reduce lock-in), rather than demand-driven.
This is an assumption-led bet and is flagged as such.

## Cost of Inaction

| Aspect | Impact |
|---|---|
| What breaks or degrades today | Nothing breaks; OpenCode works and is the default. The cost is opportunity, not breakage. |
| Existing workarounds | Users who want a non-OpenCode agent must leave OpenChamber entirely and use that agent's own CLI/UI. No in-product workaround exists. |
| Trend | Growing. ACP is a young but standardizing protocol; agent diversity is increasing. Lock-in cost compounds as more agents ship ACP support. |

**Cost-of-inaction rating:** Moderate

The status quo is tolerable today but the gap widens as the ACP ecosystem matures.
Acting early means integrating against a still-stable protocol surface and shaping the decoupling before more OpenCode-specific assumptions accrete.

## Alternative Paths

| Alternative | How it addresses the need | Trade-offs |
|---|---|---|
| Stay coupled to OpenCode only | Removes the need entirely by accepting the lock-in | Abandons the strategic goal; users who want other agents leave the product |
| Document how to swap OpenCode for another backend manually | None; the coupling is in 150+ files, not configuration | Not viable; there is no config-level escape hatch |
| Wait for OpenCode itself to gain an ACP bridge | If OpenCode exposed an ACP front-end, OpenChamber could remain an ACP client to OpenCode | Speculative; depends on OpenCode's roadmap and does not help reach non-OpenCode agents |
| Build ACP client now (this proposal) | Decouples UI/runtime from a single backend behind an ACP transport | Largest effort but the only path that satisfies the strategic goal and keeps OpenCode as default |

**Could the need be met without new code?** No

The coupling is structural and pervasive; no configuration, documentation, or process change can substitute for an ACP client transport.

## Strategic Alignment

| Criterion | Assessment |
|---|---|
| Aligns with project goals | Yes; OpenChamber's stated goal is to be a multi-runtime UI for coding agents, not a single-agent shell |
| Serves core or edge use case | Core; agent interaction is the product's central function |
| Dependency enabler | High; once an agent-transport abstraction exists, providers, models, skills, slash commands, and capabilities all become multi-backend-capable |

**Alignment rating:** Strong

This is a core, strategically aligned capability that unblocks future agent diversity rather than an edge feature.

## Verdict

**Overall needs assessment:** Needed

**Rationale:** The need is strongly aligned with the project's core purpose and unblocks a broad set of future capabilities, and the structural coupling is measurably deep (152 SDK imports).
The verdict is held to **Needed** rather than something stronger only because external user demand is not yet demonstrated, making this a strategic/architectural bet rather than a demand-pulled feature.
The cost of inaction is moderate and growing, and there is no code-free alternative, so building the ACP client is justified.
Downstream artifacts (feasibility, plan) must weight the large decoupling cost heavily and should favor a minimal-viable first milestone (stdio `initialize` + one prompt turn) behind a feature flag, with parallel-client support explicitly deferred (see Open Questions).

## Conditions to Proceed

- The single-vs-parallel-client architectural decision must be resolved in `create-requirements` (or recorded as a formal decision/assumption before then), because it determines whether the agent abstraction is a single swappable transport or a multi-tenant registry. The issue author has explicitly flagged this as unresolved.
- Scope must be bounded to the "Must" acceptance criteria for the first deliverable; "Should" items are follow-up milestones and should not enter the initial requirements.

## Open Questions

1. Single client-at-a-time or multiple parallel clients? This shapes the entire abstraction (swappable transport vs multi-tenant registry), the store model (global vs per-client providers/models/skills/commands), and the sidebar model (unified merged list vs per-client with filter). Must be decided before requirements.
2. Is mid-session client switching in scope, or is a session permanently bound to one agent (as the ACP spec suggests)? Affects session lifecycle and store design.
3. Where does the ACP agent configuration live alongside the existing provider config, and what is the selection UX (sidebar dropdown vs settings section)?
4. Local stdio first, or local + remote (HTTP/WebSocket) in the first milestone? The "Must" criteria specify stdio; remote is "Should".
