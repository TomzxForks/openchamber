---
title: "GitHub Issue / PR Starters"
status: draft
---

# Requirements: GitHub Issue / PR Starters

## Overview

Dialogs that let users pick a GitHub issue or pull request and automatically start a new AI session (optionally in a new worktree branch) with the issue/PR context pre-loaded. The PR picker loads PR context including description, comments, and checks.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| Open-source contributors | Start coding sessions directly from issues |
| Code reviewers | Start review sessions from pull requests |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall provide a GitHub issue picker dialog to browse and select issues. |
| FR-02 | Must | The system shall provide a GitHub PR picker dialog to browse and select pull requests. |
| FR-03 | Must | The system shall start a new session with issue/PR context pre-loaded. |
| FR-04 | Must | The system shall support creating a worktree from the selected issue/PR branch. |
| FR-05 | Should | The system shall support entering issue/PR by URL or number. |
| FR-06 | Should | The system shall load PR description, comments, and check status as context. |
| FR-07 | Should | The system shall support fork-aware issue/PR listing. |

## Acceptance Criteria

- [ ] FR-01: Given the issue picker, the user can browse open issues and select one
- [ ] FR-02: Given the PR picker, the user can browse open PRs and select one
- [ ] FR-03: Given a selected issue, a new session starts with the issue body as context
- [ ] FR-04: Given a selected PR, the user can create a worktree from its branch
- [ ] FR-05: Given an issue URL, the picker resolves it to the correct issue

## Open Questions

1. Are there rate limits on GitHub API calls for issue/PR browsing?
2. Can users start sessions from issues across different repositories?
