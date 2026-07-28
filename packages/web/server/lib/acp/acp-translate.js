// Pure translation of ACP session/update notifications into OpenChamber's
// normalized event payloads ({ type, properties }). This is the correctness-
// critical seam that lets the UI sync layer be reused as-is (assumption #1).
//
// These functions are pure and side-effect-free so they can be unit-tested
// without a subprocess (test cases TC-3..TC-8). The orchestrator
// (acp-event-source.js) feeds ACP notifications in and publishes the resulting
// payloads via the global hub.

// Synthesize ids using the SAME scheme as the UI's ascendingId
// (packages/ui/src/lib/opencode/client.ts): timestamp*0x1000 + counter, top
// 6 bytes as hex. This guarantees monotonically increasing ids that sort in
// chronological order, so the assistant message sorts AFTER the user message
// (the reply is generated later than the send) and the chat renders the turn.
let idCounter = 0;
let lastIdTimestamp = 0;
const hexId = (prefix) => {
  const timestamp = Date.now();
  if (timestamp !== lastIdTimestamp) {
    lastIdTimestamp = timestamp;
    idCounter = 0;
  }
  idCounter += 1;
  const sortable = BigInt(timestamp) * BigInt(0x1000) + BigInt(idCounter);
  const timeBytes = new Uint8Array(6);
  for (let index = 0; index < 6; index += 1) {
    timeBytes[index] = Number((sortable >> BigInt(40 - 8 * index)) & BigInt(0xff));
  }
  const hex = Array.from(timeBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}${Math.random().toString(36).slice(2, 8)}`;
};

/**
 * @typedef {Object} TranslateContext
 * @property {string} sessionID      The OpenChamber session id for this ACP session.
 * @property {() => string} [newMessageId]  Generate a fresh assistant message id.
 * @property {() => string} [newPartId]     Generate a fresh part id.
 */

/**
 * Translate a single ACP `session/update` params object into zero or more
 * normalized event payloads.
 *
 * ACP shapes (v1 prompt turn):
 *   - sessionUpdate "agent_message_chunk" { messageId, content: { type, text } }
 *   - sessionUpdate "tool_call"            { toolCallId, title, kind, status }
 *   - sessionUpdate "tool_call_update"     { toolCallId, status, content[] }
 *   - sessionUpdate "plan" | "usage_update" | ...  -> [] (deferred Should items)
 *
 * OpenChamber payloads:
 *   - { type: "message.part.updated", properties: { part: {...} } }
 *   - { type: "message.part.delta",   properties: { messageID, partID, field, delta } }
 *
 * @param {any} params   The ACP session/update `params` ({ sessionId, update }).
 * @param {TranslateContext} ctx
 * @param {object} [acc]  Mutable accumulator tracking the current assistant message/part.
 * @returns {Array<{ type: string, properties: Record<string, unknown> }>}
 */
export const acpUpdateToEvents = (params, ctx, acc = { messageID: null, partID: null, partsCreated: new Set() }) => {
  const update = params?.update;
  if (!update || typeof update !== 'object') return [];
  const kind = update.sessionUpdate;

  if (kind === 'agent_message_chunk') {
    return agentMessageChunkToUpdate(update, ctx, acc);
  }
  if (kind === 'tool_call') {
    return toolCallToUpdate(update, ctx, acc);
  }
  if (kind === 'tool_call_update') {
    return toolCallUpdateToUpdate(update, ctx, acc);
  }
  // plan, usage_update, agent_thought_chunk, user_message_chunk -> deferred (Should).
  return [];
};

const ensureAssistantMessage = (ctx, acc, acpMessageId) => {
  if (acc.messageID && (typeof acpMessageId !== 'string' || acpMessageId === acc._acpMessageId)) {
    acc.messageIsNew = false;
    return acc.messageID;
  }
  acc._acpMessageId = typeof acpMessageId === 'string' ? acpMessageId : undefined;
  acc.messageID = (typeof acpMessageId === 'string' && acpMessageId.length > 0)
    ? acpMessageId
    : (ctx.newMessageId ? ctx.newMessageId() : hexId('msg'));
  acc.partID = `${acc.messageID}-text`;
  acc.partsCreated = new Set();
  acc.messageIsNew = true;
  return acc.messageID;
};

// Register the assistant message in the session's message list so the UI reducer
// links subsequent parts to it (otherwise parts are orphaned and never render).
// parentID MUST point at the user message id so projectTurnRecords attaches the
// assistant reply to the user's turn (without it the assistant is dropped).
const registerMessageEvent = (messageID, sessionID, parentID) => {
  const now = Date.now();
  return {
    type: 'message.updated',
    properties: {
      info: {
        id: messageID,
        sessionID,
        role: 'assistant',
        ...(parentID ? { parentID } : {}),
        time: { created: now, updated: now },
      },
    },
  };
};

const agentMessageChunkToUpdate = (update, ctx, acc) => {
  const content = update.content;
  if (!content || content.type !== 'text' || typeof content.text !== 'string') {
    // Non-text content blocks are out of scope for Must (FR-4 covers text + tool).
    return [];
  }
  const sessionID = ctx.sessionID;
  const messageID = ensureAssistantMessage(ctx, acc, update.messageId);
  const partID = acc.partID;
  const events = [];
  if (acc.messageIsNew) {
    events.push(registerMessageEvent(messageID, sessionID, ctx.parentID));
  }

  // First chunk for this text part -> create it via message.part.updated.
  // Subsequent chunks -> append via message.part.delta (streaming-efficient).
  if (!acc.partsCreated.has(partID)) {
    acc.partsCreated.add(partID);
    events.push({
      type: 'message.part.updated',
      properties: {
        sessionID,
        part: {
          id: partID,
          type: 'text',
          messageID,
          sessionID,
          text: content.text,
        },
      },
    });
    return events;
  }
  events.push({
    type: 'message.part.delta',
    properties: {
      messageID,
      partID,
      field: 'text',
      delta: content.text,
    },
  });
  return events;
};

const toolCallToUpdate = (update, ctx, acc) => {
  const sessionID = ctx.sessionID;
  const toolCallId = typeof update.toolCallId === 'string' && update.toolCallId.length > 0
    ? update.toolCallId
    : (ctx.newPartId ? ctx.newPartId() : hexId('part'));
  // Ensure an owning assistant message exists for the tool part.
  const messageID = ensureAssistantMessage(ctx, acc, undefined);
  acc.partsCreated.add(toolCallId);
  const events = [];
  if (acc.messageIsNew) {
    events.push(registerMessageEvent(messageID, sessionID, ctx.parentID));
  }
  events.push({
    type: 'message.part.updated',
    properties: {
      sessionID,
      part: {
        id: toolCallId,
        type: 'tool',
        messageID,
        sessionID,
        tool: update.title ?? '',
        state: update.status ?? 'pending',
        // Preserve ACP-specific metadata for the renderer.
        ...(update.kind ? { acpKind: update.kind } : {}),
      },
    },
  });
  return events;
};

const toolCallUpdateToUpdate = (update, ctx, acc) => {
  const toolCallId = update.toolCallId;
  if (typeof toolCallId !== 'string' || toolCallId.length === 0) return [];
  const sessionID = ctx.sessionID;
  const messageID = acc.messageID ?? null;
  const resultText = extractToolResultText(update.content);
  return [{
    type: 'message.part.updated',
    properties: {
      sessionID,
      part: {
        id: toolCallId,
        type: 'tool',
        ...(sessionID ? { sessionID } : {}),
        ...(messageID ? { messageID } : {}),
        ...(update.status ? { state: update.status } : {}),
        ...(resultText ? { output: resultText } : {}),
      },
    },
  }];
};

// ACP tool_call_update content is an array of { type, content: { type, text } }.
const extractToolResultText = (content) => {
  if (!Array.isArray(content)) return undefined;
  const texts = [];
  for (const item of content) {
    const inner = item?.content;
    if (inner && inner.type === 'text' && typeof inner.text === 'string') {
      texts.push(inner.text);
    }
  }
  return texts.length > 0 ? texts.join('\n') : undefined;
};

/**
 * Translate an ACP prompt-turn stop reason into a session.status payload.
 * `end_turn` / `cancelled` / `max_tokens` -> idle. A transport failure should
 * be translated by the caller into an error status (never an empty success).
 *
 * @param {string} sessionID
 * @param {string} stopReason
 * @returns {{ type: string, properties: Record<string, unknown> }}
 */
export const acpStopReasonToSessionStatus = (sessionID, stopReason) => {
  const isCancel = stopReason === 'cancelled';
  return {
    type: 'session.status',
    properties: {
      sessionID,
      status: 'idle',
      ...(isCancel ? { reason: 'cancelled' } : {}),
    },
  };
};

/**
 * Build an explicit error session.status for a transport/handshake failure.
 * Never an empty success (NFR-4).
 */
export const acpErrorToSessionStatus = (sessionID, message) => ({
  type: 'session.status',
  properties: {
    sessionID,
    status: 'error',
    error: typeof message === 'string' && message.length > 0 ? message : 'ACP transport error',
  },
});

/** Reset the internal id counter (test helper). */
export const _resetTranslateCounter = () => { idCounter = 0; };
