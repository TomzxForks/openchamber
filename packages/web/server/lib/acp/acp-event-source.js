// ACP event source: drives an ACP session over a managed connection and
// translates session/update notifications into OpenChamber's normalized event
// protocol, publishing them through the global hub so the existing UI sync
// layer renders the turn live without changes (assumption #1, validated by
// acp-translate tests).
//
// Lifecycle:
//   start()  -> spawns the agent, handshakes, builds a session, parks.
//   prompt() -> runs one prompt turn; translates each nextUpdate() and publishes.
//   stop()   -> tears down the connection.
//
// On any transport/handshake failure it publishes an explicit error
// session.status (never an empty success — NFR-4).

import { AcpAgentConnection } from './acp-connection.js';
import {
  acpUpdateToEvents,
  acpStopReasonToSessionStatus,
  acpErrorToSessionStatus,
} from './acp-translate.js';

/**
 * @typedef {Object} AcpEventSourceOptions
 * @property {object} hub                       Global message-stream hub (publishEvent).
 * @property {string} [directory]               Directory scope for published events.
 * @property {string} agentId                   Stable agent id (for the process registry).
 * @property {string} command                   Agent executable.
 * @property {string[]} [args]                  Agent args.
 * @property {Record<string,string>} [env]      Agent env.
 * @property {string} [cwd]                     Session cwd.
 * @property {string} [clientName="openchamber"]
 */

export class AcpEventSource {
  /**
   * @param {AcpEventSourceOptions} options
   */
  constructor(options) {
    this.options = options;
    this.sessionID = null;
    this._session = null;
    this._ctx = null;
    this._resolveSessionDone = null;
    this._connection = null;
    this._acc = { messageID: null, partID: null, partsCreated: new Set() };
    this._promptAbort = null;
  }

  /** Spawn + handshake + build a session. Resolves when the session is ready. */
  async start() {
    const { agentId, command, args, env, cwd, clientName } = this.options;

    this._connection = new AcpAgentConnection({
      agentId,
      command,
      args,
      env,
      cwd,
      clientName,
      onReady: async (ctx) => {
        this._ctx = ctx;
        const builder = ctx.buildSession(cwd || process.cwd());
        await builder.withSession(async (session) => {
          this._session = session;
          this.sessionID = session.sessionId;
          // Park for the connection's lifetime; prompts are driven via prompt().
          await new Promise((resolve) => { this._resolveSessionDone = resolve; });
        });
      },
    });

    await this._connection.start();
    // The onReady callback builds the session asynchronously; wait until the
    // session id is known (or fail explicitly).
    const session = await this._waitForSession();
    return session;
  }

  _waitForSession(timeoutMs = 5000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        if (this._session) return resolve(this._session);
        if (Date.now() - start > timeoutMs) {
          return reject(new Error('ACP session was not established before timeout'));
        }
        setTimeout(tick, 20);
      };
      tick();
    });
  }

  /**
   * Run one prompt turn. Each streamed update is translated and published to
   * the hub. Resolves with the ACP stopReason on turn completion; publishes an
   * error session.status and rethrows on transport failure.
   *
   * @param {object} params
   * @param {string} params.text       The user prompt text.
   * @param {string} [params.sessionID] OpenChamber session id to tag published events.
   * @param {string} [params.userMessageId] The user message id to set as the assistant reply's parentID.
   */
  async prompt({ text, sessionID, userMessageId } = {}) {
    const tag = sessionID ?? this.sessionID ?? 'acp-session';
    if (!this._session) {
      throw new Error('ACP event source has no active session');
    }

    // Reset the per-turn accumulator so a new assistant message is started.
    this._acc = { messageID: null, partID: null, partsCreated: new Set() };
    this._promptAbort = new AbortController();

    try {
      this._session.prompt(text);
      for (;;) {
        if (this._promptAbort.signal.aborted) {
          this._publish(acpStopReasonToSessionStatus(tag, 'cancelled'));
          return 'cancelled';
        }
        const message = await this._session.nextUpdate();
        if (message?.kind === 'stop') {
          const stopReason = message.response?.stopReason ?? 'end_turn';
          console.log(`[acp] stop stopReason=${stopReason} session=${tag} raw=${JSON.stringify(message.response).slice(0, 300)}`);
          this._publish(acpStopReasonToSessionStatus(tag, stopReason));
          return stopReason;
        }
        const notification = message?.notification;
        if (notification) {
          const updateKind = notification?.update?.sessionUpdate;
          const events = acpUpdateToEvents(notification, { sessionID: tag, parentID: userMessageId }, this._acc);
          console.log(`[acp] update sessionUpdate=${updateKind} translated=${events.length} session=${tag} dir=${this.options.directory ?? '(none)'} raw=${JSON.stringify(notification.update).slice(0, 400)}`);
          for (const event of events) {
            this._publish(event);
          }
        }
      }
    } catch (error) {
      if (this._promptAbort?.signal.aborted) {
        this._publish(acpStopReasonToSessionStatus(tag, 'cancelled'));
        return 'cancelled';
      }
      console.warn(`[acp] transport error during prompt (session=${tag}): ${error?.message ?? error}`);
      this._publish(acpErrorToSessionStatus(tag, error?.message ?? String(error)));
      throw error;
    } finally {
      this._promptAbort = null;
    }
  }

  /** Best-effort cooperative cancel of the in-flight prompt turn. */
  cancel() {
    this._promptAbort?.abort();
  }

  _publish(event) {
    try {
      this.options.hub?.publishEvent?.(event, { directory: this.options.directory });
    } catch {
      // Publishing must never break the prompt loop; best-effort fan-out.
    }
  }

  /** Stop the underlying connection and end the session park. */
  async stop() {
    if (this._resolveSessionDone) this._resolveSessionDone();
    if (this._connection) await this._connection.stop();
    this._session = null;
    this._ctx = null;
    this._connection = null;
  }
}
