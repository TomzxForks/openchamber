---
title: "Text Selection Context Menu"
status: draft
---

# Requirements: Text Selection Context Menu

## Overview

A floating context menu that appears when users select text in chat messages, offering actions: copy, add to project notes as a distilled insight, ask AI about the selection, or add as a todo item. Positions itself near the selection and supports both mobile and desktop.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| All users | Quick actions on selected text without manual copy-paste |
| Note-takers | Distill insights from AI responses directly into project notes |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall display a floating context menu on text selection in chat messages. |
| FR-02 | Must | The system shall offer copy, add to notes, ask AI, and add as todo actions. |
| FR-03 | Must | The system shall position the menu near the selection. |
| FR-04 | Should | The system shall support both desktop (mouse) and mobile (touch) selection. |
| FR-05 | Should | The system shall wrap selected text in markdown fenced blocks when adding to chat. |

## Acceptance Criteria

- [ ] FR-01: Given text selected in a chat message, a context menu appears
- [ ] FR-02: Given the context menu, clicking "Add to notes" adds the selection as a distilled insight
- [ ] FR-03: Given the context menu, it appears near the selected text

## Open Questions

1. Can users customize which actions appear?
2. Is there a maximum selection length?
