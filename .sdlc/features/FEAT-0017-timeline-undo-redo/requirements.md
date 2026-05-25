---
title: "Timeline / Undo / Redo"
status: draft
---

# Requirements: Timeline / Undo / Redo

## Overview

A timeline dialog showing all messages in a session chronologically, allowing users to jump to specific messages, revert to a point in conversation history, or fork a session from any message. Includes deferred rendering (staging) for large histories and turn-based keyboard navigation.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| Developers exploring approaches | Revert or fork from any earlier point in the conversation |
| Power users | Keyboard-driven turn navigation |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall display a timeline of all messages in a session with chronological ordering. |
| FR-02 | Must | The system shall support reverting to any earlier message, removing all subsequent messages. |
| FR-03 | Must | The system shall support forking from any message, creating a new session branch. |
| FR-04 | Must | The system shall support undo (revert to previous turn) and redo (restore reverted turn). |
| FR-05 | Should | The system shall support full-text search across all messages in the timeline. |
| FR-06 | Should | The system shall support keyboard turn navigation (arrow keys). |
| FR-07 | Should | The system shall use deferred/staged rendering for large timelines. |

## Acceptance Criteria

- [ ] FR-01: Given a session with 50+ messages, the timeline shows all messages chronologically
- [ ] FR-02: Given a timeline, clicking revert on message N removes messages N+1 onward
- [ ] FR-03: Given a timeline, clicking fork on message N creates a new branch from that point
- [ ] FR-04: Given a conversation with undo history, redo restores the previously undone turn
- [ ] FR-05: Given the timeline dialog, search filters messages by content

## Open Questions

1. Is there a limit on undo/redo depth?
2. Are undo/redo operations reflected in the git history?
