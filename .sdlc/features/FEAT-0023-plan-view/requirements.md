---
title: "Plan View"
status: draft
---

# Requirements: Plan View

## Overview

OpenChamber provides a dedicated Plan/Build mode with a markdown-based plan editor. Users can draft implementation plans, preview them, add inline comments, send plans to the agent for improvement or implementation, and create worktrees directly from plan items. Plans integrate with the chat session for iterative refinement.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| Developers | Draft and iterate on implementation plans before coding |
| Team leads | Review and approve plans before agent execution |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall provide a markdown editor for writing implementation plans. |
| FR-02 | Must | The system shall support a preview toggle to render markdown as formatted HTML. |
| FR-03 | Must | The system shall support sending a plan to the chat session for improvement or implementation. |
| FR-04 | Must | The system shall support creating a worktree from a plan item. |
| FR-05 | Should | The system shall support inline comment drafts on plan sections. |
| FR-06 | Should | The system shall support saving plan content as a project file. |
| FR-07 | May | The system shall support associating a plan with a specific session for context. |

## Non-Functional Requirements

| ID | Priority | Category | Requirement |
|---|---|---|---|
| NFR-01 | Should | Performance | Plan editor shall use CodeMirror for responsive editing of large plans. |

## Constraints

- Plan mode is feature-flagged behind `planModeEnabled`
- Plans are stored as markdown text, optionally persisted as project files
- The plan view opens in the context panel overlay

## Acceptance Criteria

- [ ] FR-01: Given plan mode is enabled, the user can write a markdown plan
- [ ] FR-02: Given a plan with markdown, toggling preview renders formatted HTML
- [ ] FR-03: Given a plan, clicking "Send to session" submits it as a prompt
- [ ] FR-04: Given a plan with actionable items, the user can create a worktree from an item
- [ ] FR-06: Given a plan, the user can save it as a file in the project

## Open Questions

1. Is there a plan template system?
2. Can plans be shared across sessions?
