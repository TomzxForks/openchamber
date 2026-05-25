---
title: "Open In External Apps"
status: draft
---

# Requirements: "Open In" External Apps

## Overview

Users can configure a preferred external application (from a catalog of 23+ supported apps: VS Code, IntelliJ, Xcode, Terminal, iTerm2, Ghostty, Cursor, Zed, etc.) to open project directories. The system detects installed apps and lets users select their preferred one.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| Desktop users | Open project in preferred editor or terminal |
| Multi-tool developers | Switch between IDEs for different tasks |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall support opening project directories in a configured external application. |
| FR-02 | Must | The system shall provide a catalog of 23+ supported applications. |
| FR-03 | Must | The system shall detect which apps are installed on the system. |
| FR-04 | Should | The system shall allow the user to select their preferred app. |
| FR-05 | Should | The system shall support the "Open In" action from the header and file viewer. |

## Acceptance Criteria

- [ ] FR-01: Given a configured app, clicking "Open In" launches it with the project directory
- [ ] FR-02: Given the app catalog, 23+ apps are available for selection
- [ ] FR-03: Given the system, installed apps are detected and shown as available

## Open Questions

1. Can users add custom apps not in the catalog?
2. Is there per-project app preference?
