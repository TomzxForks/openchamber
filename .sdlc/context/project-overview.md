# Project Overview

## What is OpenChamber

OpenChamber provides UI runtimes (web, desktop/Electron, VS Code) for interacting with an agent backend.
Today it is coupled to a single agent backend: OpenCode.
The UI talks to OpenCode through `@opencode-ai/sdk`, and the web server embeds and boots the OpenCode server in-process.

## Goals

- Give users a polished, multi-runtime (web/desktop/VS Code) interface for coding agents.
- Today: exclusively OpenCode.
- Future (this work): talk to any ACP-compatible agent, decoupling the UI/runtime from a single backend.

## Scope

- Shared UI: `packages/ui`
- Web app + server + CLI: `packages/web`
- Desktop shell: `packages/electron`
- VS Code extension: `packages/vscode`

## Key stakeholders

- `tomzx` (issue author, collaborator)
- Users who want to choose their agent backend rather than being locked to OpenCode.
