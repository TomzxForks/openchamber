---
title: "Settings"
status: draft
---

# Requirements: Settings

## Overview

OpenChamber provides a comprehensive settings interface with 19 pages covering all aspects of the application: appearance, chat behavior, notifications, sessions, keyboard shortcuts, git identities, magic prompts, projects, remote instances, agents, behavior, commands, MCP servers, providers, usage, skills, voice, and tunnel configuration. Settings persist across sessions and sync with the OpenCode server.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| All users | Personalize the app experience |
| Power users | Fine-tune agent behavior, shortcuts, and tool permissions |
| Teams | Configure shared providers, MCP servers, and project settings |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall provide a settings dialog with sidebar navigation and 19 configurable pages. |
| FR-02 | Must | The system shall persist settings across sessions. |
| FR-03 | Must | The system shall support the following settings pages: Appearance, Chat, Notifications, Sessions, Shortcuts, Git, Magic Prompts, Projects, Remote Instances, Agents, Behavior, Commands, MCP, Providers, Usage, Skills, Voice, Tunnel. |
| FR-04 | Must | The system shall sync relevant settings with the OpenCode server. |
| FR-05 | Should | The system shall support keyboard shortcut customization. |
| FR-06 | Should | The system shall provide a windowed settings view for larger displays. |
| FR-07 | Should | The system shall support resizable settings navigation with keyboard and screen-reader support. |
| FR-08 | May | The system shall support importing and exporting settings. |

## Non-Functional Requirements

| ID | Priority | Category | Requirement |
|---|---|---|---|
| NFR-01 | Must | Accessibility | Settings shall be navigable via keyboard and screen reader. |
| NFR-02 | Should | Usability | Collapsible sidebar groups for organizing settings pages. |

## Constraints

- Settings are stored server-side via OpenCode config
- Settings UI uses shared primitives from `packages/ui/src/components/sections/shared/`
- Each settings section is a separate component under `packages/ui/src/components/sections/`

## Acceptance Criteria

- [ ] FR-01: Given the settings dialog, all 19 pages are accessible via sidebar navigation
- [ ] FR-02: Given a setting change, it persists after app restart
- [ ] FR-03: Given each settings page, the relevant options are present and functional
- [ ] FR-04: Given a provider API key change, the OpenCode server receives the update

## Open Questions

1. Are settings per-user or per-machine?
2. Is there a settings reset/defaults feature?
