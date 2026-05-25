---
title: "Custom Theming System"
status: draft
---

# Requirements: Custom Theming System

## Overview

OpenChamber provides 18+ built-in themes with light/dark variants and supports custom themes via JSON files. The theme system uses CSS custom properties (tokens) that are consumed by all UI components. Custom themes hot-reload without restart.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| End users | Personalize the app appearance to their preference |
| Theme creators | Create and share custom themes |
| Accessibility users | High-contrast or reduced-motion variants |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall provide 18+ built-in themes with light and dark variants. |
| FR-02 | Must | The system shall support custom themes defined as JSON files in `~/.config/openchamber/themes/`. |
| FR-03 | Must | The system shall hot-reload custom themes without requiring a restart. |
| FR-04 | Must | All UI colors shall use theme tokens; no hardcoded color values. |
| FR-05 | Should | The system shall support configurable font size, spacing, corner radius, and layout controls. |
| FR-06 | Should | The system shall support custom icons via the SVG sprite system. |
| FR-07 | May | The system shall support importing themes from other editors (e.g., VS Code themes). |

## Non-Functional Requirements

| ID | Priority | Category | Requirement |
|---|---|---|---|
| NFR-01 | Must | Performance | Theme switching shall be instant with no visible flash of unstyled content. |

## Constraints

- All colors defined as CSS custom properties under a theme namespace
- Theme tokens are defined in `packages/ui/src/lib/theme/`
- Components must never use Tailwind color classes directly
- Custom theme files use JSON format with defined schema

## Acceptance Criteria

- [ ] FR-01: Given the settings UI, the user can select from 18+ built-in themes
- [ ] FR-02: Given a custom theme JSON file in the themes directory, it appears in the theme picker
- [ ] FR-03: Given a custom theme file is modified, the UI updates without restart
- [ ] FR-04: Given any UI component, no hardcoded color values are present in its code

## Open Questions

1. Is there a theme schema validator or linter?
2. Are community themes shared via a catalog or only manually?
