---
title: "Diff Viewer"
status: draft
---

# Requirements: Diff Viewer

## Overview

OpenChamber provides a full-screen diff viewer for inspecting code changes. It supports side-by-side and stacked layouts, file tree navigation for multi-file changesets, per-file diff expansion for large files, image diffs, and actions like copy and delete. The diff viewer is used both standalone and inline in chat tool output.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| Developers | Review AI-generated code changes before accepting |
| Code reviewers | Inspect diffs from pull requests and commits |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall display file diffs in side-by-side and stacked (unified) modes. |
| FR-02 | Must | The system shall show a file tree for multi-file changesets with navigation. |
| FR-03 | Must | The system shall support expanding/collapsing per-file diff sections for large changesets. |
| FR-04 | Must | The system shall render syntax-highlighted diffs with added/removed line indicators. |
| FR-05 | Must | The system shall support inline diff rendering within chat tool output messages. |
| FR-06 | Should | The system shall display image diffs (before/after comparison). |
| FR-07 | Should | The system shall support inline comment drafts on diff lines. |
| FR-08 | Should | The system shall handle multi-file tool diffs with mixed line endings safely. |
| FR-09 | May | The system shall support copy/delete actions on diffed files. |

## Non-Functional Requirements

| ID | Priority | Category | Requirement |
|---|---|---|---|
| NFR-01 | Must | Reliability | Large changesets (100+ files) shall display reliably without UI freeze. |
| NFR-02 | Should | Performance | Lazy loading of per-file diff content for large changesets. |

## Constraints

- Uses `@pierre/diffs` library for diff rendering
- Diffs are computed server-side and streamed to the UI
- Inline diffs in chat must handle mixed line endings (CRLF/LF)

## Acceptance Criteria

- [ ] FR-01: Given a diff, the user can toggle between side-by-side and stacked modes
- [ ] FR-02: Given a multi-file changeset, the file tree shows all changed files with navigation
- [ ] FR-04: Given a diff with syntax-highlighted code, added lines show green and removed lines show red
- [ ] FR-05: Given an assistant tool call with a file diff, the diff renders inline in the chat message
- [ ] FR-08: Given a diff with mixed CRLF/LF line endings, it renders without errors

## Open Questions

1. Is there a maximum diff size before truncation?
2. Are three-way merge diffs supported?
