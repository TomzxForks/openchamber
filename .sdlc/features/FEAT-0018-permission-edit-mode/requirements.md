---
title: "Permission / Edit Mode"
status: draft
---

# Requirements: Permission / Edit Mode

## Overview

A permission request/response system where the AI asks for user approval before executing potentially dangerous operations (file writes, command execution). Includes per-session auto-accept toggle, edit mode controls, permission cards in chat, and toast notifications for pending permissions.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| All users | Approve or deny AI actions before execution |
| Security-conscious users | Control which operations require approval |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall display permission request cards in chat when the AI needs approval. |
| FR-02 | Must | The system shall support approve and deny actions on permission requests. |
| FR-03 | Must | The system shall support per-session auto-accept toggle for permissions. |
| FR-04 | Must | The system shall display toast notifications for pending permissions. |
| FR-05 | Should | The system shall show file write/create tool previews in permission cards. |
| FR-06 | Should | The system shall support auto-approve scoped to session tree (parent auto-accepts for children). |
| FR-07 | Should | The system shall display edit mode with visual color coding. |

## Acceptance Criteria

- [ ] FR-01: Given an AI tool call requiring permission, a card appears with approve/deny buttons
- [ ] FR-03: Given auto-accept enabled, permissions are automatically approved
- [ ] FR-04: Given a permission request while the app is in the background, a toast appears
- [ ] FR-05: Given a file write permission, the card shows a preview of the changes

## Open Questions

1. What are the default permission levels for new sessions?
2. Can permission settings be configured globally?
