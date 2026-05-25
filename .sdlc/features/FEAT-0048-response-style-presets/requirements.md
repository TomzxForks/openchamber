---
title: "Response Style Presets"
status: draft
---

# Requirements: Response Style Presets

## Overview

Pre-defined response style presets that configure how the AI formats its output (concise, detailed, technical, etc.). Users can select a preset to apply formatting constraints to all subsequent responses in a session.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| All users | Control AI response verbosity and formatting |
| Power users | Fine-tune AI output style per session |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall provide pre-defined response style presets. |
| FR-02 | Must | The system shall allow selecting a preset per session. |
| FR-03 | Must | The system shall apply the selected style to AI responses. |
| FR-04 | Should | The system shall allow creating custom presets. |
| FR-05 | Should | The system shall preview a description of each preset. |

## Acceptance Criteria

- [ ] FR-01: Given the preset selector, multiple built-in styles are available
- [ ] FR-02: Given a session, the user selects a response style preset
- [ ] FR-03: Given an active preset, AI responses follow the style constraints

## Open Questions

1. Are presets sent as system prompts or as formatting instructions?
2. Can presets be shared between users?
