---
title: "AI-Generated Commits & PR Descriptions"
status: draft
---

# Requirements: AI-Generated Commits & PR Descriptions

## Overview

AI-powered generation of commit messages (subject + highlights) and PR descriptions (title + body) with structured JSON parsing, one-click copy/insert into commit input or PR form, and visual result cards. The AI generates these from staged changes or branch diffs.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| Developers | Generate meaningful commit messages and PR descriptions from code changes |
| Teams | Consistent, descriptive commit and PR documentation |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall generate commit messages from staged changes via AI. |
| FR-02 | Must | The system shall generate PR descriptions from branch diffs via AI. |
| FR-03 | Must | The system shall parse structured JSON output for subject + body separation. |
| FR-04 | Must | The system shall support one-click insert of generated content into commit input or PR form. |
| FR-05 | Should | The system shall display AI-generated highlights alongside commit messages. |
| FR-06 | Should | The system shall show a visual result card for generated content. |

## Acceptance Criteria

- [ ] FR-01: Given staged changes, clicking "Generate" produces a commit message
- [ ] FR-02: Given a branch with commits ahead, clicking "Generate" produces a PR description
- [ ] FR-04: Given generated content, clicking "Insert" fills the commit input or PR form

## Open Questions

1. What model is used for generation?
2. Can users customize the generation prompt?
