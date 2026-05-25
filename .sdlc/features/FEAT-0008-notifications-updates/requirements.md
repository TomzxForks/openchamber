---
title: "Notifications & Updates"
status: draft
---

# Requirements: Notifications & Updates

## Overview

OpenChamber supports browser push notifications, desktop (Electron) notifications, VS Code native notifications, and cross-tab session activity tracking. The system also provides in-app OpenCode update checks and upgrade actions, with dismissible prompts that do not reappear after dismissal.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| All users | Get notified about agent completion when the app is in the background |
| Desktop users | System-level notifications without browser |
| Self-hosters | Stay up to date with OpenCode upgrades |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall support browser push notifications for session events (agent completion, permissions, etc.). |
| FR-02 | Must | The system shall support desktop notifications on Electron via native callback. |
| FR-03 | Must | The system shall support VS Code native notifications without duplicates across panels. |
| FR-04 | Must | The system shall support cross-tab session activity tracking (active, unread indicators). |
| FR-05 | Must | The system shall support in-app OpenCode update checks and upgrade actions. |
| FR-06 | Must | The system shall allow dismissing update and PWA install prompts without repeated reappearance. |
| FR-07 | Should | The system shall support notification text preparation with truncation and optional summarization. |
| FR-08 | Should | The system shall support a setting to disable OpenCode update notifications. |
| FR-09 | Should | The system shall suppress inherited subagent completion notifications. |
| FR-10 | May | The system shall support web push (VAPID) for PWA background notifications. |

## Non-Functional Requirements

| ID | Priority | Category | Requirement |
|---|---|---|---|
| NFR-01 | Must | Reliability | Duplicate notifications shall be suppressed across panels and tabs. |
| NFR-02 | Should | Privacy | Notification content shall not expose sensitive code in the system notification area. |

## Constraints

- Push notifications use `web-push` library with VAPID keys on the server
- Desktop notifications flow via `onDesktopNotification` callback injected at Electron startup
- VS Code notifications use the extension host's `vscode.window.showInformationMessage`
- Dismissed prompt state is persisted to prevent repeated prompts

## Acceptance Criteria

- [ ] FR-01: Given the app is in the background and an agent completes, a browser notification appears
- [ ] FR-02: Given Electron desktop and an agent completes, a system notification appears
- [ ] FR-03: Given VS Code with multiple panels, notifications appear without duplicates
- [ ] FR-04: Given multiple browser tabs, activity indicators update across all tabs
- [ ] FR-05: Given a new OpenCode version available, the user can trigger the upgrade from within the app
- [ ] FR-06: Given an update prompt dismissed, it does not reappear on the next visit

## Open Questions

1. How long are push notification subscriptions maintained?
2. Is there a notification history or log?
