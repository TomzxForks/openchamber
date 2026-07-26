import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerAcpRoutes, _resetAcpRoutesState } from './routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resolveMockAgent = () => {
  const cwdRelative = join(process.cwd(), 'server/lib/acp/__tests__/fixtures/mock-agent.js');
  const fileRelative = join(__dirname, 'fixtures', 'mock-agent.js');
  return existsSync(cwdRelative) ? cwdRelative : fileRelative;
};
const mockAgentPath = resolveMockAgent();

const captureHub = () => {
  const events = [];
  return { events, publishEvent(event) { events.push(event); } };
};

const buildApp = (hub) => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  registerAcpRoutes(app, { globalMessageStreamHub: hub });
  return app;
};

const ORIGINAL_FLAG = process.env.OPENCHAMBER_ACP_ENABLED;
beforeEach(() => { process.env.OPENCHAMBER_ACP_ENABLED = 'true'; });
afterEach(async () => {
  await _resetAcpRoutesState();
  if (ORIGINAL_FLAG === undefined) delete process.env.OPENCHAMBER_ACP_ENABLED;
  else process.env.OPENCHAMBER_ACP_ENABLED = ORIGINAL_FLAG;
});

const request = (app, method, path, body) =>
  app.inject
    ? app.inject({ method, url: path, body })
    : import('supertest').then(({ default: supertest }) =>
        supertest(app)[method](path).send(body).set('Content-Type', 'application/json'));

describe('ACP routes partial-failure safety (TC-17)', () => {
  it('returns 400 when initialize is missing the command field', async () => {
    const app = buildApp(captureHub());
    const res = await request(app, 'post', '/api/agent/acp/initialize', {});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 502 with an explicit error (never empty success) on a bad agent command', async () => {
    const app = buildApp(captureHub());
    const res = await request(app, 'post', '/api/agent/acp/initialize', {
      command: 'this-command-does-not-exist-anywhere-xyz',
    });
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBeTruthy();
    expect(res.body).not.toEqual({});
  });

  it('returns 409 when prompting with no active session', async () => {
    const app = buildApp(captureHub());
    const res = await request(app, 'post', '/api/agent/acp/session/prompt', { text: 'hi' });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBeTruthy();
  });

  it('initializes and prompts end-to-end through the routes', async () => {
    const hub = captureHub();
    const app = buildApp(hub);
    const init = await request(app, 'post', '/api/agent/acp/initialize', {
      command: process.execPath,
      args: [mockAgentPath],
    });
    expect(init.statusCode).toBe(200);
    expect(init.body.sessionID).toBeTruthy();

    const prompt = await request(app, 'post', '/api/agent/acp/session/prompt', {
      sessionID: init.body.sessionID,
      text: 'Hello',
    });
    expect(prompt.statusCode).toBe(200);
    expect(prompt.body.stopReason).toBe('end_turn');
    // The streamed turn produced normalized events through the hub.
    expect(hub.events.some((e) => e.type === 'message.part.updated')).toBe(true);
    expect(hub.events.some((e) => e.type === 'session.status')).toBe(true);

    const shutdown = await request(app, 'post', '/api/agent/acp/shutdown', {});
    expect(shutdown.statusCode).toBe(200);
  }, 15000);
});
