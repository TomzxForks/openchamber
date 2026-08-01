// ACP HTTP routes. Wires the AcpEventSource to Express endpoints behind the
// OPENCHAMBER_ACP_ENABLED feature flag. All endpoints are partial-failure-safe:
// transport/handshake failures return a non-success status with an explicit
// error payload, never an empty success that could masquerade as authoritative
// state (NFR-4).
//
// Per decision FEAT-2010-DEC-1, one ACP agent connection is active at a time
// (single-client); initialize replaces any active source.

import express from 'express';
import { isAcpEnabled, getStartupAcpConfig } from './env.js';
import { AcpEventSource } from './acp-event-source.js';
import { acpTelemetry } from './telemetry.js';
import { writeAcpAgentConfig, clearAcpAgentConfig } from './acp-config.js';

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
/**
 * Initialize the ACP agent at server startup if OPENCHAMBER_ACP_COMMAND is set.
 * Spawns the agent, completes the handshake, and creates an initial session so
 * session/list and prompt are immediately available without waiting for the
 * first /initialize from the UI.
 */
export async function initAcpOnStartup(hub) {
  if (!isAcpEnabled()) return;
  const config = getStartupAcpConfig();
  if (!config) return;

  console.log(`[acp] startup init: command=${config.command}`);
  const source = new AcpEventSource({
    hub,
    directory: config.cwd,
    agentId: config.agentId,
    agentName: config.agentName,
    command: config.command,
    args: config.args,
    cwd: config.cwd,
  });

  try {
    await source.start();
    activeSource = source;
    activeConfig = { command: config.command, agentId: config.agentId };
    console.log(`[acp] startup init complete: sessionId=${source.sessionID}`);
    // Fetch sessions for the sidebar.
    try {
      const sessions = await source.listSessions(config.cwd);
      console.log(`[acp] startup session/list returned ${sessions.length} session(s)`);
    } catch (e) {
      console.warn(`[acp] startup session/list failed: ${e?.message ?? e}`);
    }
  } catch (error) {
    console.error(`[acp] startup init failed: ${error?.message ?? error}`);
    await source.stop().catch(() => {});
  }
}

export function registerAcpRoutes(app, options = {}) {
  if (!app) return;
  const hub = options.globalMessageStreamHub;

  // Persist the ACP agent config when the user changes it in settings.
  // The server reads this at startup to initialize the agent.
  app.put('/api/agent/acp/config', express.json({ limit: '1mb' }), async (req, res) => {
    if (!ensureEnabled(res)) return;
    const body = req.body ?? {};
    if (typeof body.command !== 'string' || body.command.trim().length === 0) {
      // Empty command = clear the config (ACP agent removed or disabled).
      clearAcpAgentConfig();
      return json(res, 200, { ok: true });
    }
    writeAcpAgentConfig({
      command: body.command,
      args: Array.isArray(body.args) ? body.args : undefined,
      agentName: typeof body.agentName === 'string' ? body.agentName : undefined,
      agentId: typeof body.agentId === 'string' ? body.agentId : 'acp-startup',
      cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
    });
    return json(res, 200, { ok: true });
  });

  app.post('/api/agent/acp/initialize', express.json({ limit: "1mb" }), async (req, res) => {
    if (!ensureEnabled(res)) return;

    // If the agent was already initialized at startup (or a previous call),
    // reuse it instead of re-spawning. Return the existing session + sessions.
    if (activeSource) {
      try {
        const sessions = await activeSource.listSessions(req.body?.cwd);
        return json(res, 200, {
          sessionID: activeSource.sessionID,
          backend: 'acp',
          sessions,
        });
      } catch {
        // Fall through to re-initialize if the existing source is broken.
        await teardownActive();
      }
    }

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
      agentName: (typeof body.name === 'string' && body.name.length > 0 ? body.name : null) || (typeof body.agentId === 'string' ? body.agentId : 'ACP'),
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
      // Fetch existing sessions so the sidebar can populate immediately.
      let existingSessions = [];
      try {
        existingSessions = await source.listSessions(body.cwd);
        console.log(`[acp] session/list returned ${existingSessions.length} session(s)`);
      } catch (e) {
        console.warn(`[acp] session/list failed: ${e?.message ?? e}`);
      }
      return json(res, 200, {
        sessionID: session.sessionId,
        capabilities: source.options,
        backend: 'acp',
        sessions: existingSessions,
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
      const stopReason = await activeSource.prompt({ text, sessionID, userMessageId: body.userMessageId });
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

  // Session lifecycle: list / delete existing agent sessions (FR-9).
  app.get('/api/agent/acp/sessions', async (req, res) => {
    if (!ensureEnabled(res)) return;
    if (!activeSource) return json(res, 200, { sessions: [] });
    try {
      const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : undefined;
      const sessions = await activeSource.listSessions(cwd);
      return json(res, 200, { sessions });
    } catch (error) {
      return json(res, 502, { error: error?.message ?? 'ACP session/list failed' });
    }
  });

  app.delete('/api/agent/acp/sessions/:sessionId', async (req, res) => {
    if (!ensureEnabled(res)) return;
    if (!activeSource) return json(res, 409, { error: 'No active ACP session' });
    const sessionId = req.params?.sessionId;
    if (!sessionId) return json(res, 400, { error: 'Missing sessionId' });
    try {
      await activeSource.deleteSession(sessionId);
      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, 502, { error: error?.message ?? 'ACP session/delete failed' });
    }
  });
}

/** Test helper: reset module-level state between route tests. */
export const _resetAcpRoutesState = async () => {
  await teardownActive();
};
