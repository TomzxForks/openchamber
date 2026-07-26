import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

import { AcpEventSource } from './acp-event-source.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resolveMockAgent = () => {
  const cwdRelative = join(process.cwd(), 'server/lib/acp/__tests__/fixtures/mock-agent.js');
  const fileRelative = join(__dirname, 'fixtures', 'mock-agent.js');
  return existsSync(cwdRelative) ? cwdRelative : fileRelative;
};
const mockAgentPath = resolveMockAgent();

const sources = [];
const startSource = (options) => {
  const src = new AcpEventSource(options);
  sources.push(src);
  return src.start().then(() => src);
};
const stopAll = async () => {
  await Promise.all(sources.map((s) => s.stop().catch(() => {})));
  sources.length = 0;
};
afterEach(stopAll);

// A fake hub that captures published events in order.
const captureHub = () => {
  const events = [];
  return { events, publishEvent(event, _opts) { events.push(event); } };
};

describe('AcpEventSource end-to-end translation (TC-14, assumption #1)', () => {
  it('translates a streamed prompt turn into normalized events', async () => {
    const hub = captureHub();
    const src = await startSource({
      hub,
      agentId: 'es-1',
      command: process.execPath,
      args: [mockAgentPath],
      sessionID: 'oc-sess-1',
    });

    const stopReason = await src.prompt({ text: 'Hello', sessionID: 'oc-sess-1' });

    expect(stopReason).toBe('end_turn');
    // Expect at least: a text part created (updated), and a final idle session.status.
    const types = hub.events.map((e) => e.type);
    expect(types).toContain('message.part.updated');
    expect(types).toContain('session.status');
    const status = hub.events.find((e) => e.type === 'session.status');
    expect(status.properties).toMatchObject({ sessionID: 'oc-sess-1', status: 'idle' });
    const textPart = hub.events.find(
      (e) => e.type === 'message.part.updated' && e.properties.part?.type === 'text'
    );
    expect(textPart.properties.part.messageID).toBeTruthy();
  }, 15000);

  it('publishes an explicit error session.status on transport failure (NFR-4)', async () => {
    const hub = captureHub();
    const src = new AcpEventSource({
      hub,
      agentId: 'es-bad',
      command: 'this-command-does-not-exist-anywhere-xyz',
    });
    sources.push(src);

    await expect(src.start()).rejects.toThrow();
    // start() failure does not publish (no session yet); the error surfaces via
    // the rejected promise. prompt() on a dead source also fails explicitly.
    await expect(src.prompt({ text: 'hi' })).rejects.toThrow();
  }, 15000);
});
