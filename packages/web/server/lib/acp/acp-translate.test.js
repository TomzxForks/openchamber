import { describe, expect, it, beforeEach } from 'vitest';
import {
  acpUpdateToEvents,
  acpStopReasonToSessionStatus,
  acpErrorToSessionStatus,
  _resetTranslateCounter,
} from './acp-translate.js';

beforeEach(_resetTranslateCounter);

const ctx = { sessionID: 'sess-1' };

describe('acp-translate: agent_message_chunk (TC-3)', () => {
  it('creates a text part on the first chunk via message.part.updated', () => {
    const events = acpUpdateToEvents({
      sessionId: 'sess-1',
      update: {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'msg-a',
        content: { type: 'text', text: 'Hello' },
      },
    }, ctx);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('message.part.updated');
    expect(events[0].properties.part).toMatchObject({
      id: 'msg-a-text',
      type: 'text',
      messageID: 'msg-a',
      text: 'Hello',
    });
  });

  it('appends subsequent chunks via message.part.delta', () => {
    const acc = { messageID: null, partID: null, partsCreated: new Set() };
    acpUpdateToEvents({
      update: { sessionUpdate: 'agent_message_chunk', messageId: 'msg-a', content: { type: 'text', text: 'Hello' } },
    }, ctx, acc);
    const events = acpUpdateToEvents({
      update: { sessionUpdate: 'agent_message_chunk', messageId: 'msg-a', content: { type: 'text', text: ' world' } },
    }, ctx, acc);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('message.part.delta');
    expect(events[0].properties).toMatchObject({
      messageID: 'msg-a',
      partID: 'msg-a-text',
      field: 'text',
      delta: ' world',
    });
  });

  it('synthesizes a message id when the ACP chunk omits messageId', () => {
    const events = acpUpdateToEvents({
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hi' } },
    }, ctx);
    expect(events[0].properties.part.messageID).toBeTruthy();
    expect(typeof events[0].properties.part.messageID).toBe('string');
  });

  it('ignores non-text content blocks (out of Must scope)', () => {
    const events = acpUpdateToEvents({
      update: { sessionUpdate: 'agent_message_chunk', messageId: 'm', content: { type: 'image', data: 'x' } },
    }, ctx);
    expect(events).toEqual([]);
  });
});

describe('acp-translate: tool_call (TC-4)', () => {
  it('creates a tool part from a new tool_call', () => {
    const acc = { messageID: 'msg-a', partID: 'msg-a-text', partsCreated: new Set(['msg-a-text']) };
    const events = acpUpdateToEvents({
      update: { sessionUpdate: 'tool_call', toolCallId: 'call_1', title: 'Read file', kind: 'read', status: 'pending' },
    }, ctx, acc);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('message.part.updated');
    expect(events[0].properties.part).toMatchObject({
      id: 'call_1',
      type: 'tool',
      messageID: 'msg-a',
      tool: 'Read file',
      state: 'pending',
      acpKind: 'read',
    });
  });
});

describe('acp-translate: tool_call_update (TC-5)', () => {
  it('updates status and attaches result content', () => {
    const acc = { messageID: 'msg-a', partID: 'msg-a-text', partsCreated: new Set() };
    const events = acpUpdateToEvents({
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'call_1',
        status: 'completed',
        content: [{ type: 'content', content: { type: 'text', text: 'done' } }],
      },
    }, ctx, acc);

    expect(events).toHaveLength(1);
    expect(events[0].properties.part).toMatchObject({
      id: 'call_1',
      type: 'tool',
      state: 'completed',
      output: 'done',
    });
  });
});

describe('acp-translate: stopReason (TC-6)', () => {
  it('maps end_turn to an idle session.status', () => {
    const ev = acpStopReasonToSessionStatus('sess-1', 'end_turn');
    expect(ev.type).toBe('session.status');
    expect(ev.properties).toMatchObject({ sessionID: 'sess-1', status: 'idle' });
  });

  it('maps cancelled to idle with a reason', () => {
    const ev = acpStopReasonToSessionStatus('sess-1', 'cancelled');
    expect(ev.properties).toMatchObject({ sessionID: 'sess-1', status: 'idle', reason: 'cancelled' });
  });
});

describe('acp-translate: error (TC-7, NFR-4)', () => {
  it('builds an explicit error session.status, never empty success', () => {
    const ev = acpErrorToSessionStatus('sess-1', 'connection reset');
    expect(ev.type).toBe('session.status');
    expect(ev.properties).toMatchObject({ sessionID: 'sess-1', status: 'error', error: 'connection reset' });
  });

  it('provides a default message when none is given', () => {
    const ev = acpErrorToSessionStatus('sess-1');
    expect(ev.properties.status).toBe('error');
    expect(typeof ev.properties.error).toBe('string');
  });
});

describe('acp-translate: deferred updates', () => {
  it('returns no events for plan and usage_update (Should milestones)', () => {
    expect(acpUpdateToEvents({ update: { sessionUpdate: 'plan', entries: [] } }, ctx)).toEqual([]);
    expect(acpUpdateToEvents({ update: { sessionUpdate: 'usage_update', used: 1, size: 2 } }, ctx)).toEqual([]);
  });
});
