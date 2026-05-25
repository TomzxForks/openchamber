---
title: "Inline Comments & Annotations"
status: draft
---

# Requirements: Inline Comments & Annotations

## Overview

Users can create, edit, and delete inline comments anchored to specific lines in diff views, plan views, file editors, and preview console output. Comments are persisted per session and can be consumed (appended to chat input) when submitting a message. Supports diff-side annotations (original/modified) with overlay rendering.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| Developers reviewing AI changes | Annotate specific lines with feedback before sending to agent |
| Code reviewers | Add contextual notes to diff sections |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall support inline comment creation on diff lines (original and modified sides). |
| FR-02 | Must | The system shall support inline comments on file editor lines. |
| FR-03 | Must | The system shall support inline comments on plan sections. |
| FR-04 | Must | The system shall persist comments per session. |
| FR-05 | Must | The system shall support consuming comments (appending to chat input). |
| FR-06 | Should | The system shall render comment overlays on the Pierre diff viewer. |
| FR-07 | Should | The system shall use CodeMirror widgets for editor comments. |

## Acceptance Criteria

- [ ] FR-01: Given a diff view, the user can click a line and add an inline comment
- [ ] FR-02: Given a file editor, the user can add a comment on any line
- [ ] FR-04: Given a session with comments, they persist after navigation and return
- [ ] FR-05: Given comments on a diff, the user can send them as context to the AI

## Open Questions

1. Can comments be resolved or marked as addressed?
2. Are comments shared across sessions?
