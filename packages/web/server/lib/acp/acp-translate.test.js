import { describe, expect, it, beforeEach } from 'vitest';
import {
  acpUpdateToEvents,
  acpStopReasonToSessionStatus,
  acpErrorToSessionStatus,
  messageCompletionEvent,
  _resetTranslateCounter,
} from './acp-translate.js';

beforeEach(_resetTranslateCounter);

const ctx = { sessionID: 'sess-1', parentID: 'user-1', agentName: 'pi', modelLabel: null };
const newAcc = () => ({ messageID: null, partID: null, partsCreated: new Set(), lastKind: null });
const chunk = (text, messageId) => ({
  update: { sessionUpdate: 'agent_message_chunk', ...(messageId ? { messageId } : {}), content: { type: 'text', text } },
});

describe('acp-translate: agent_message_chunk (TC-3)', () => {
  it('registers the message then creates the text part on the first chunk', () => {
    const events = acpUpdateToEvents(chunk('Hello', 'msg-a'), ctx);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('message.updated');
    expect(events[0].properties.info).toMatchObject({ id: 'msg-a', sessionID: 'sess-1', role: 'assistant', parentID: 'user-1', agent: 'pi' });
    expect(events[1].type).toBe('message.part.updated');
    expect(events[1].properties.part).toMatchObject({ id: 'msg-a-text', type: 'text', messageID: 'msg-a', sessionID: 'sess-1', text: 'Hello' });
  });

  it('appends subsequent chunks via message.part.delta (same message)', () => {
    const acc = newAcc();
    acpUpdateToEvents(chunk('Hello', 'msg-a'), ctx, acc);
    const events = acpUpdateToEvents(chunk(' world', 'msg-a'), ctx, acc);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('message.part.delta');
    expect(events[0].properties).toMatchObject({ messageID: 'msg-a', partID: 'msg-a-text', field: 'text', delta: ' world' });
  });

  it('synthesizes a message id when the ACP chunk omits messageId', () => {
    const events = acpUpdateToEvents(chunk('Hi'), ctx);
    const part = events.find((e) => e.type === 'message.part.updated');
    expect(part.properties.part.messageID).toBeTruthy();
    expect(typeof part.properties.part.messageID).toBe('string');
  });

  it('ignores non-text content blocks (out of Must scope)', () => {
    expect(acpUpdateToEvents({ update: { sessionUpdate: 'agent_message_chunk', messageId: 'm', content: { type: 'image', data: 'x' } } }, ctx)).toEqual([]);
  });
});

describe('acp-translate: message separation (preamble vs answer)', () => {
  it('starts a new message when a chunk follows a non-message update', () => {
    const acc = newAcc();
    acpUpdateToEvents(chunk('preamble', 'msg-a'), ctx, acc);               // message A
    acpUpdateToEvents({ update: { sessionUpdate: 'session_info_update' } }, ctx, acc); // interruption
    const events = acpUpdateToEvents(chunk('2'), ctx, acc);                // message B (new)
    // A new message.updated is emitted (registers message B), distinct from A.
    const registrations = events.filter((e) => e.type === 'message.updated');
    expect(registrations.length).toBe(1);
    expect(registrations[0].properties.info.id).not.toBe('msg-a');
    expect(registrations[0].properties.info.parentID).toBe('user-1');
  });

  it('does not start a new message for contiguous chunks', () => {
    const acc = newAcc();
    acpUpdateToEvents(chunk('a', 'msg-a'), ctx, acc);
    const events = acpUpdateToEvents(chunk('b', 'msg-a'), ctx, acc);
    expect(events.some((e) => e.type === 'message.updated')).toBe(false);
  });
});

describe('acp-translate: agent_thought_chunk (reasoning)', () => {
  it('creates a reasoning part on the first thought chunk', () => {
    const acc = newAcc();
    acpUpdateToEvents(chunk('answer', 'msg-a'), ctx, acc);
    const events = acpUpdateToEvents({ update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'thinking' } } }, ctx, acc);
    const part = events.find((e) => e.type === 'message.part.updated');
    expect(part.properties.part).toMatchObject({ type: 'reasoning', messageID: 'msg-a', text: 'thinking' });
  });

  it('appends subsequent thought chunks via delta', () => {
    const acc = newAcc();
    acpUpdateToEvents(chunk('answer', 'msg-a'), ctx, acc);
    acpUpdateToEvents({ update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'The' } } }, ctx, acc);
    const events = acpUpdateToEvents({ update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: ' answer' } } }, ctx, acc);
    expect(events[0].type).toBe('message.part.delta');
    expect(events[0].properties.delta).toBe(' answer');
  });
});

describe('acp-translate: tool_call (TC-4)', () => {
  it('creates a tool part from a new tool_call', () => {
    const acc = newAcc();
    acpUpdateToEvents(chunk('answer', 'msg-a'), ctx, acc);
    const events = acpUpdateToEvents({ update: { sessionUpdate: 'tool_call', toolCallId: 'call_1', title: 'Read file', kind: 'read', status: 'pending' } }, ctx, acc);
    const part = events.find((e) => e.type === 'message.part.updated');
    expect(part.properties.part).toMatchObject({ id: 'call_1', type: 'tool', messageID: 'msg-a', tool: 'Read file', state: 'pending', acpKind: 'read' });
  });
});

describe('acp-translate: tool_call_update (TC-5)', () => {
  it('updates status and attaches result content', () => {
    const acc = newAcc();
    acpUpdateToEvents(chunk('answer', 'msg-a'), ctx, acc);
    const events = acpUpdateToEvents({
      update: { sessionUpdate: 'tool_call_update', toolCallId: 'call_1', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: 'done' } }] },
    }, ctx, acc);
    expect(events[0].properties.part).toMatchObject({ id: 'call_1', type: 'tool', state: 'completed', output: 'done' });
  });
});

describe('acp-translate: message completion (footer)', () => {
  it('preserves parentID/agent and sets completed time', () => {
    const acc = newAcc();
    acpUpdateToEvents(chunk('answer', 'msg-a'), ctx, acc);
    const ev = messageCompletionEvent(acc, 'sess-1', 'end_turn');
    expect(ev.type).toBe('message.updated');
    expect(ev.properties.info).toMatchObject({ id: 'msg-a', role: 'assistant', parentID: 'user-1', agent: 'pi', finish: 'stop' });
    expect(ev.properties.info.time.completed).toBeGreaterThan(0);
    expect(ev.properties.info.time.created).toBeGreaterThan(0);
  });

  it('returns null when no message was created', () => {
    expect(messageCompletionEvent(newAcc(), 'sess-1', 'end_turn')).toBeNull();
  });
});

describe('acp-translate: stopReason (TC-6)', () => {
  it('maps end_turn to an idle session.status', () => {
    const ev = acpStopReasonToSessionStatus('sess-1', 'end_turn');
    expect(ev.type).toBe('session.status');
    expect(ev.properties).toMatchObject({ sessionID: 'sess-1', status: 'idle' });
  });

  it('maps cancelled to idle with a reason', () => {
    expect(acpStopReasonToSessionStatus('sess-1', 'cancelled').properties).toMatchObject({ sessionID: 'sess-1', status: 'idle', reason: 'cancelled' });
  });
});

describe('acp-translate: error (TC-7, NFR-4)', () => {
  it('builds an explicit error session.status, never empty success', () => {
    expect(acpErrorToSessionStatus('sess-1', 'reset').properties).toMatchObject({ sessionID: 'sess-1', status: 'error', error: 'reset' });
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

describe('acp-translate: session preamble skip', () => {
  it('drops an agent_message_chunk matching the preamble fingerprint', () => {
    const preambleCtx = { ...ctx, preambleFingerprint: 'pi v0.83.0\n---\n\n## Skills\n- /home/tomzx/.pi/agent/skills/website' };
    const events = acpUpdateToEvents({
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'pi v0.83.0\n---\n\n## Skills\n- /home/tomzx/.pi/agent/skills/website-to-video/SKILL.md\n- more...' } },
    }, preambleCtx);
    expect(events).toEqual([]);
  });

  it('does not drop a real reply that differs from the preamble', () => {
    const preambleCtx = { ...ctx, preambleFingerprint: 'pi v0.83.0\n---\n\n## Skills' };
    const events = acpUpdateToEvents({
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '2' } },
    }, preambleCtx);
    expect(events.some((e) => e.type === 'message.part.updated')).toBe(true);
  });
});
