---
title: "Docker / Self-Hosted Deployment"
status: draft
---

# Requirements: Docker / Self-Hosted Deployment

## Overview

Production-ready Docker deployment with multi-stage build, docker-compose configuration with volume management for data persistence, environment variable configuration for tunnels/password/external OpenCode, and Caddy reverse proxy config.

## Stakeholders

| Stakeholder | Interest |
|---|---|
| Self-hosters | Run OpenChamber on their own server |
| DevOps teams | Deploy via Docker with standard tooling |

## Functional Requirements

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | Must | The system shall provide a multi-stage Dockerfile for building and running OpenChamber. |
| FR-02 | Must | The system shall provide a docker-compose.yml with persistent volume mounts. |
| FR-03 | Must | The system shall support configuration via environment variables (port, password, tunnel, external OpenCode). |
| FR-04 | Must | The system shall include cloudflared for tunnel support inside the container. |
| FR-05 | Should | The system shall auto-install OpenCode CLI inside the container. |
| FR-06 | Should | The system shall provide a Caddy reverse proxy configuration for HTTPS. |

## Acceptance Criteria

- [ ] FR-01: Given the Dockerfile, `docker build` produces a working image
- [ ] FR-02: Given docker-compose up, the container starts with persistent data volumes
- [ ] FR-03: Given environment variables, the container configures password, tunnel, and OpenCode connection
- [ ] FR-06: Given the Caddyfile, HTTPS termination works with the reverse proxy

## Open Questions

1. Are there official Docker images published?
2. Is Kubernetes deployment supported?
