---
title: "Electron Desktop App"
status: draft
---

# Requirements: Electron Desktop App

## Overview

The Electron desktop app (packages/electron/) is the forward desktop runtime for OpenChamber. It boots the web server in the same Node process, loads the web UI from localhost, and provides native integrations: macOS menu, dialogs, notifications, auto-update, deep-links, multi-window support, Mini Chat windows, and SSH remote connections.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| macOS developers | Native desktop experience for AI-assisted coding |
| Remote workers | SSH connections to remote OpenChamber instances |
| Multi-taskers | Mini Chat and multi-window for parallel workflows |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall boot the web server in-process (no sidecar subprocess) and load the UI from localhost. |
| FR-02 | Must | The system shall provide native macOS menu integration with app actions. |
| FR-03 | Must | The system shall support auto-update via electron-updater with GitHub releases. |
| FR-04 | Must | The system shall support deep-link handling for opening projects and sessions. |
| FR-05 | Must | The system shall support Mini Chat windows for focused conversations. |
| FR-06 | Must | The system shall support connecting to remote OpenChamber instances over SSH. |
| FR-07 | Should | The system shall support multi-window for parallel project/session workflows. |
| FR-08 | Should | The system shall support "Open In" shortcuts for Finder, Terminal, and preferred editor. |
| FR-09 | Should | The system shall support workspace-first startup flow with directory picker. |
| FR-10 | Should | The system shall support system notifications via desktop notification callback. |
| FR-11 | May | The system shall support Windows and Linux (on roadmap). |

## Non-Functional Requirements

| ID | Priority | Category | Requirement |
|---|---|---|---|
| NFR-01 | Must | Security | The Electron app shall use hardened runtime and notarization on macOS. |
| NFR-02 | Should | Performance | The splash window shall appear early while the server starts. |
| NFR-03 | Should | Reliability | Window state (size, position) shall be restored across launches. |

## Constraints

- Electron 41 is the current version
- Builds are distributed as DMG and ZIP for macOS (arm64)
- The preload script exposes `__TAURI__` IPC shim for backward compatibility with shared UI
- Notarization requires an Apple Developer certificate

## Acceptance Criteria

- [ ] FR-01: Given the app launches, the web server starts in-process and the UI loads
- [ ] FR-02: Given the app is running, the macOS menu bar shows OpenChamber actions
- [ ] FR-03: Given a new release on GitHub, the app detects, downloads, and applies the update
- [ ] FR-05: Given the Mini Chat is opened, it shows a compact session view independent of the main window
- [ ] FR-06: Given SSH credentials, the app connects to a remote OpenChamber instance
- [ ] FR-09: Given first launch, the app shows a directory picker to select a workspace

## Open Questions

1. When will Windows and Linux support ship?
2. What is the migration plan for Tauri users to Electron?
