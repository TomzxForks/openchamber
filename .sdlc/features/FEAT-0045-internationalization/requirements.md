---
title: "Internationalization (i18n)"
status: draft
---

# Requirements: Internationalization (i18n)

## Overview

Full localization system supporting 7 locales (English, Simplified Chinese, Spanish, Portuguese-BR, Ukrainian, Korean, Polish) with lazy-loaded dictionaries, browser language detection, and persistent locale preference. Settings pages have dedicated locale-specific translation files.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| Non-English-speaking users | Use the app in their native language |
| Translators | Contribute and maintain translations |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall support 7+ locales with lazy-loaded translation dictionaries. |
| FR-02 | Must | The system shall auto-detect browser language on first use. |
| FR-03 | Must | The system shall persist the user's locale preference. |
| FR-04 | Must | The system shall support runtime locale switching without restart. |
| FR-05 | Should | The system shall retry failed locale loads. |
| FR-06 | Should | The system shall default to English for missing translations. |

## Acceptance Criteria

- [ ] FR-01: Given 7 locales, the user can switch between them in settings
- [ ] FR-02: Given a browser set to Korean, the app defaults to Korean on first use
- [ ] FR-03: Given a locale preference, it persists after app restart
- [ ] FR-04: Given a locale switch, the UI updates without page reload

## Open Questions

1. How are new translations contributed?
2. Are all settings pages fully translated?
