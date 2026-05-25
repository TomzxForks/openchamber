---
title: "Context Panel"
status: draft
---

# Requirements: Context Panel

## Overview

The context panel provides detailed visibility into session resource usage and raw data. It shows token breakdowns (input/output/reasoning/cache), context usage bars, message statistics (count, cost), per-message token details, context breakdown by role (user/assistant/tool/other), and a raw message JSON inspector. This gives users transparency into how their AI budget is being consumed.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| Developers | Understand token usage and cost per session |
| Cost-conscious users | Monitor API spending in real time |
| Power users | Inspect raw message JSON for debugging agent behavior |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall display a context usage overview with token counts (input, output, reasoning, cache) and percentage bar. |
| FR-02 | Must | The system shall display message statistics including total count, cost estimate, and per-role breakdown. |
| FR-03 | Must | The system shall display per-message token details (input tokens, output tokens, cost). |
| FR-04 | Must | The system shall provide a raw message JSON inspector for viewing the exact data sent to and received from the AI. |
| FR-05 | Should | The system shall display context breakdown by role (user, assistant, tool, other). |
| FR-06 | Should | The system shall show a header-level context usage indicator (compact percentage). |

## Non-Functional Requirements

| ID | Priority | Category | Requirement |
|---|---|---|---|
| NFR-01 | Must | Performance | Context panel shall not re-render on every streaming delta; updates should be batched. |

## Constraints

- Token counts come from OpenCode SSE events
- Cost estimates are calculated client-side based on model pricing
- The context panel opens as a tab in the context panel overlay

## Acceptance Criteria

- [ ] FR-01: Given an active session, the context panel shows token counts and a usage percentage bar
- [ ] FR-02: Given a session with messages, statistics show count, cost, and per-role breakdown
- [ ] FR-03: Given individual messages, each shows its token consumption
- [ ] FR-04: Given the JSON inspector, raw message data is viewable in formatted JSON

## Open Questions

1. Are cost estimates accurate for all providers, or are they approximations?
2. Is there a cumulative cost view across all sessions?
