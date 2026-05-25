---
title: "Custom Slash Commands"
status: draft
---

# Requirements: Custom Slash Commands

## Overview

Users can define custom slash commands with name, description, agent, model, template, and scope. These appear in chat input autocomplete alongside built-in commands and skills. Commands have user or project scope with full CRUD management via a settings page.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| Power users | Create reusable prompt shortcuts for common workflows |
| Teams | Share project-scoped commands for consistent agent behavior |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall allow creating custom slash commands with name, description, template, agent, and model. |
| FR-02 | Must | The system shall support user-level and project-level command scope. |
| FR-03 | Must | The system shall show custom commands in chat input autocomplete. |
| FR-04 | Must | The system shall support editing and deleting custom commands. |
| FR-05 | Should | The system shall support slash command message ID preservation for undo/redo. |

## Acceptance Criteria

- [ ] FR-01: Given the commands settings page, the user creates a new command with a template
- [ ] FR-02: Given a project-scoped command, it only appears in that project's autocomplete
- [ ] FR-03: Given custom commands, typing `/` in chat shows them alongside built-in commands

## Open Questions

1. Can commands reference variables from the current context (e.g., selected file)?
2. Is there a command marketplace or sharing mechanism?
