// ACP HTTP routes. Wires the AcpEventSource to Express endpoints behind the
// OPENCHAMBER_ACP_ENABLED feature flag. All endpoints are partial-failure-safe:
// transport/handshake failures return a non-success status with an explicit
// error payload, never an empty success that could masquerade as authoritative
// state (NFR-4).
//
// Per decision FEAT-2010-DEC-1, one ACP agent connection is active at a time
// (single-client); initialize replaces any active source.

import express from 'express';
import { isAcpEnabled } from './env.js';
import { AcpEventSource } from './acp-event-source.js';
import { acpTelemetry } from './telemetry.js';

let activeSource = null;
let activeConfig = null;

const json = (res, status, body) =>
  res.status(status).json(body);

const ensureEnabled = (res) => {
  if (isAcpEnabled()) return true;
  json(res, 404, { error: 'ACP support is disabled (OPENCHAMBER_ACP_ENABLED)' });
  return false;
};

const teardownActive = async () => {
  if (activeSource) {
    await activeSource.stop().catch(() => {});
    activeSource = null;
    activeConfig = null;
  }
};

/**
 * @param {import('express').Express} app
 * @param {{ globalMessageStreamHub?: { publishEvent: (payload: unknown, opts?: { directory?: string }) => void } }} options
 */
export function registerAcpRoutes(app, options = {}) {
  if (!app) return;
  const hub = options.globalMessageStreamHub;

  app.post('/api/agent/acp/initialize', express.json({ limit: "1mb" }), async (req, res) => {
    if (!ensureEnabled(res)) return;
    const body = req.body ?? {};
    const command = typeof body.command === 'string' ? body.command : '';
    if (!command) {
      return json(res, 400, { error: 'Missing required field: command' });
    }

    // Replace any active source (single-client-at-a-time).
    await teardownActive();

    const source = new AcpEventSource({
      hub,
      directory: typeof body.directory === 'string' ? body.directory : undefined,
      agentId: typeof body.agentId === 'string' ? body.agentId : 'acp-agent',
      command,
      args: Array.isArray(body.args) ? body.args : undefined,
      env: body.env && typeof body.env === 'object' ? body.env : undefined,
      cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
    });

    try {
      const startedAt = Date.now();
      acpTelemetry.initializeStart(body.agentId);
      const session = await source.start();
      activeSource = source;
      activeConfig = { command, agentId: body.agentId };
      acpTelemetry.initializeResult(body.agentId, 'success', Date.now() - startedAt);
      acpTelemetry.sessionCreated(body.agentId);
      return json(res, 200, {
        sessionID: session.sessionId,
        capabilities: source.options,
        backend: 'acp',
      });
    } catch (error) {
      acpTelemetry.initializeResult(body.agentId, 'error', 0, error?.code);
      acpTelemetry.transportError('initialize', error?.code);
      await source.stop().catch(() => {});
      return json(res, 502, { error: error?.message ?? 'ACP initialize failed' });
    }
  });

  app.post('/api/agent/acp/session/prompt', express.json({ limit: "1mb" }), async (req, res) => {
    if (!ensureEnabled(res)) return;
    if (!activeSource) {
      return json(res, 409, { error: 'No active ACP session (call /initialize first)' });
    }
    const body = req.body ?? {};
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text) {
      return json(res, 400, { error: 'Missing required field: text' });
    }
    const sessionID = typeof body.sessionID === 'string' ? body.sessionID : activeSource.sessionID;

    try {
      const startedAt = Date.now();
      acpTelemetry.promptSubmitted(activeConfig?.agentId);
      const stopReason = await activeSource.prompt({ text, sessionID });
      acpTelemetry.turnCompleted(activeConfig?.agentId, stopReason, Date.now() - startedAt);
      return json(res, 200, { stopReason, sessionID });
    } catch (error) {
      acpTelemetry.transportError('prompt', error?.code);
      return json(res, 502, { error: error?.message ?? 'ACP prompt failed' });
    }
  });

  app.post('/api/agent/acp/session/cancel', express.json({ limit: "1mb" }), async (req, res) => {
    if (!ensureEnabled(res)) return;
    if (!activeSource) {
      return json(res, 409, { error: 'No active ACP session' });
    }
    try {
      activeSource.cancel?.();
      return json(res, 202, { ok: true });
    } catch (error) {
      return json(res, 500, { error: error?.message ?? 'ACP cancel failed' });
    }
  });

  app.post('/api/agent/acp/shutdown', express.json({ limit: "1mb" }), async (_req, res) => {
    if (!ensureEnabled(res)) return;
    await teardownActive();
    return json(res, 200, { ok: true });
  });
}

/** Test helper: reset module-level state between route tests. */
export const _resetAcpRoutesState = async () => {
  await teardownActive();
};
