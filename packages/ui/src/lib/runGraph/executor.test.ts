import { describe, expect, test } from 'bun:test';
import type { Session } from '@opencode-ai/sdk/v2';
import type { RunGraphDefinition, RunGraphFormNode, RunGraphRunNode, RunGraphWorktree } from '@/types/runGraph';
import type { RunGraphDispatchParams, RunGraphExecutorDeps, RunGraphFormRequest, RunGraphRunState } from './executor';
import { RunGraphExecutor } from './executor';

let counter = 0;
const nextId = (prefix: string): string => {
  counter += 1;
  return `${prefix}_${counter}`;
};

const buildNode = (overrides: Partial<RunGraphRunNode> = {}): RunGraphRunNode => ({
  kind: 'run',
  id: nextId('node'),
  title: `Node ${counter}`,
  instances: [{ id: nextId('inst'), providerID: 'anthropic', modelID: 'claude' }],
  inputs: [],
  promptTemplate: 'Do the thing.',
  position: { x: 0, y: 0 },
  ...overrides,
});

const buildFormNode = (overrides: Partial<RunGraphFormNode> = {}): RunGraphFormNode => ({
  kind: 'form',
  id: nextId('form'),
  title: `Form ${counter}`,
  fields: [
    { id: nextId('field'), title: 'Topic', type: 'text', required: true },
  ],
  position: { x: 0, y: 0 },
  ...overrides,
});

const buildGraph = (overrides: Partial<RunGraphDefinition> = {}): RunGraphDefinition => ({
  id: nextId('graph'),
  name: 'Graph',
  nodes: [],
  worktrees: [],
  edges: [],
  nodeWorktreeBindings: {},
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

const settle = async (): Promise<void> => {
  for (let index = 0; index < 12; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const createHarness = () => {
  let clock = 1000;
  let sessionCounter = 0;
  const statusListeners = new Set<() => void>();
  const activeSessions = new Set<string>();
  const outputs = new Map<string, string>();
  const dispatched: RunGraphDispatchParams[] = [];
  const createdSessions: Array<{ id: string; title: string; directory: string }> = [];
  const aborted: string[] = [];
  const published: RunGraphRunState[] = [];
  const recordedLinks: Array<{ sessionId: string; link: { graphId: string; nodeId: string; directory: string } }> = [];
  const formRequests: RunGraphFormRequest[] = [];
  const pendingFormResolvers = new Map<string, (values: Record<string, string> | null) => void>();

  const deps: RunGraphExecutorDeps = {
    now: () => {
      clock += 1;
      return clock;
    },
    projectPath: '/proj',
    createSessionInDirectory: async (title, directory) => {
      sessionCounter += 1;
      // SAFETY: the fake only needs the id field the executor consumes.
      const session = { id: `sess_${sessionCounter}` } as Session;
      createdSessions.push({ id: session.id, title, directory });
      return session;
    },
    registerSession: () => undefined,
    recordSessionLink: (sessionId, link) => {
      recordedLinks.push({ sessionId, link });
    },
    requestFormValues: (request: RunGraphFormRequest) =>
      new Promise<Record<string, string> | null>((resolve) => {
        formRequests.push(request);
        pendingFormResolvers.set(request.nodeId, resolve);
      }),
    dispatchPrompt: async (params) => {
      dispatched.push(params);
      activeSessions.add(params.sessionId);
      for (const listener of statusListeners) listener();
    },
    abortSessionInDirectory: async (sessionId) => {
      aborted.push(sessionId);
      activeSessions.delete(sessionId);
    },
    getSessionOutput: async (sessionId) => outputs.get(sessionId) ?? '',
    resolveExistingWorktree: async (worktree) => `/wt/${worktree.title}`,
    createPoolWorktree: async (worktree) => `/wt/${worktree.title}`,
    createDedicatedWorktree: async ({ preferredName }) => `/wt/dedicated/${preferredName}`,
    subscribeToSessionStatus: (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    isSessionActive: (sessionId) => activeSessions.has(sessionId),
    publish: (state) => published.push(state),
  };

  const finishSession = (sessionId: string, output: string): void => {
    outputs.set(sessionId, output);
    activeSessions.delete(sessionId);
    for (const listener of statusListeners) listener();
  };

  const endSessionWithoutOutput = (sessionId: string): void => {
    activeSessions.delete(sessionId);
    for (const listener of statusListeners) listener();
  };

  const notifyStatusChange = (): void => {
    for (const listener of statusListeners) listener();
  };

  const submitForm = (nodeId: string, values: Record<string, string>): void => {
    const resolve = pendingFormResolvers.get(nodeId);
    if (!resolve) throw new Error(`no pending form request for ${nodeId}`);
    pendingFormResolvers.delete(nodeId);
    resolve(values);
  };

  const cancelForm = (nodeId: string): void => {
    const resolve = pendingFormResolvers.get(nodeId);
    if (!resolve) throw new Error(`no pending form request for ${nodeId}`);
    pendingFormResolvers.delete(nodeId);
    resolve(null);
  };

  return { deps, finishSession, endSessionWithoutOutput, notifyStatusChange, dispatched, createdSessions, aborted, published, outputs, recordedLinks, formRequests, submitForm, cancelForm };
};

describe('RunGraphExecutor', () => {
  test('runs a single root node end to end', async () => {
    const harness = createHarness();
    const node = buildNode({ promptTemplate: 'Investigate the bug.' });
    const executor = new RunGraphExecutor(buildGraph({ nodes: [node] }), harness.deps);

    executor.start();
    await settle();

    expect(harness.dispatched).toHaveLength(1);
    expect(harness.dispatched[0].content).toBe('Investigate the bug.');
    expect(harness.dispatched[0].directory).toBe('/proj');
    expect(harness.dispatched[0].providerID).toBe('anthropic');
    expect(executor.getState().status).toBe('running');

    harness.finishSession(harness.dispatched[0].sessionId, 'analysis result');
    await settle();

    expect(executor.getState().status).toBe('completed');
    const runtime = executor.getState().instances[node.instances[0].id];
    expect(runtime.phase).toBe('done');
    expect(runtime.output).toBe('analysis result');
    expect(harness.recordedLinks).toHaveLength(1);
    expect(harness.recordedLinks[0].link.nodeId).toBe(node.id);
    expect(harness.recordedLinks[0].link.directory).toBe('/proj');
  });

  test('a child starts only after its parent finishes and receives its output', async () => {
    const harness = createHarness();
    const a = buildNode({ title: 'A', promptTemplate: 'map' });
    const b = buildNode({ title: 'B', inputs: [{ id: 'b_in', name: 'value' }], promptTemplate: 'reduce: {{value}}' });
    const graph = buildGraph({
      nodes: [a, b],
      edges: [{ id: 'e1', source: a.id, sourceInstanceId: a.instances[0].id, target: b.id, targetInputId: 'b_in' }],
    });
    const executor = new RunGraphExecutor(graph, harness.deps);

    executor.start();
    await settle();

    expect(harness.dispatched).toHaveLength(1);
    expect(executor.getState().instances[b.instances[0].id].phase).toBe('pending');

    harness.finishSession(harness.dispatched[0].sessionId, 'MAP OUTPUT');
    await settle();

    expect(harness.dispatched).toHaveLength(2);
    expect(harness.dispatched[1].content).toBe('reduce: MAP OUTPUT');
    expect(executor.getState().status).toBe('running');

    harness.finishSession(harness.dispatched[1].sessionId, 'REDUCED');
    await settle();

    expect(executor.getState().status).toBe('completed');
    expect(executor.getState().instances[b.instances[0].id].output).toBe('REDUCED');
  });

  test('inputs follow edge definition order', async () => {
    const harness = createHarness();
    const a = buildNode({ title: 'A', promptTemplate: 'PA' });
    const b = buildNode({ title: 'B', promptTemplate: 'PB' });
    const c = buildNode({ title: 'C', inputs: [{ id: 'c_in', name: 'values' }], promptTemplate: '{{values[0]}}+{{values[1]}}' });
    const graph = buildGraph({
      nodes: [a, b, c],
      edges: [
        { id: 'e1', source: b.id, sourceInstanceId: b.instances[0].id, target: c.id, targetInputId: 'c_in' },
        { id: 'e2', source: a.id, sourceInstanceId: a.instances[0].id, target: c.id, targetInputId: 'c_in' },
      ],
    });
    const executor = new RunGraphExecutor(graph, harness.deps);
    executor.start();
    await settle();

    expect(harness.dispatched).toHaveLength(2);
    const dispatchB = harness.dispatched.find((entry) => entry.content === 'PB');
    const dispatchA = harness.dispatched.find((entry) => entry.content === 'PA');
    if (!dispatchB || !dispatchA) throw new Error('expected both parent dispatches');

    harness.finishSession(dispatchB.sessionId, 'OUT_B');
    await settle();
    harness.finishSession(dispatchA.sessionId, 'OUT_A');
    await settle();

    expect(harness.dispatched).toHaveLength(3);
    expect(harness.dispatched[2].content).toBe('OUT_B+OUT_A');
    expect(executor.getState().status).toBe('running');

    harness.finishSession(harness.dispatched[2].sessionId, 'FINAL');
    await settle();
    expect(executor.getState().status).toBe('completed');
  });

  test('a failed parent blocks its descendants and the run still settles', async () => {
    const harness = createHarness();
    const a = buildNode({ title: 'A' });
    const b = buildNode({ title: 'B', inputs: [{ id: 'b_in', name: 'value' }], promptTemplate: '{{value}}' });
    const graph = buildGraph({
      nodes: [a, b],
      edges: [{ id: 'e1', source: a.id, sourceInstanceId: a.instances[0].id, target: b.id, targetInputId: 'b_in' }],
    });
    const executor = new RunGraphExecutor(graph, harness.deps);
    executor.start();
    await settle();

    expect(harness.dispatched).toHaveLength(1);
    harness.endSessionWithoutOutput(harness.dispatched[0].sessionId);
    await settle();

    expect(executor.getState().instances[a.instances[0].id].phase).toBe('failed');
    expect(executor.getState().instances[b.instances[0].id].phase).toBe('blocked');
    expect(executor.getState().status).toBe('completed');
  });

  test('finishing without assistant output fails the instance', async () => {
    const harness = createHarness();
    const a = buildNode({ title: 'A' });
    const executor = new RunGraphExecutor(buildGraph({ nodes: [a] }), harness.deps);
    executor.start();
    await settle();

    harness.finishSession(harness.dispatched[0].sessionId, '   ');
    await settle();

    const runtime = executor.getState().instances[a.instances[0].id];
    expect(runtime.phase).toBe('failed');
    expect(runtime.reason).toContain('without an assistant response');
    expect(executor.getState().status).toBe('completed');
  });

  test('multi-model node waits for all instances and labels sessions per model', async () => {
    const harness = createHarness();
    const a = buildNode({
      title: 'A',
      instances: [
        { id: 'i1', providerID: 'anthropic', modelID: 'claude' },
        { id: 'i2', providerID: 'openai', modelID: 'gpt' },
      ],
    });
    const b = buildNode({ title: 'B', inputs: [{ id: 'b_in', name: 'values' }], promptTemplate: '{{values}}' });
    const graph = buildGraph({
      nodes: [a, b],
      edges: [
        { id: 'e1', source: a.id, sourceInstanceId: 'i1', target: b.id, targetInputId: 'b_in' },
        { id: 'e2', source: a.id, sourceInstanceId: 'i2', target: b.id, targetInputId: 'b_in' },
      ],
    });
    const executor = new RunGraphExecutor(graph, harness.deps);
    executor.start();
    await settle();

    expect(harness.dispatched).toHaveLength(2);
    const titles = harness.createdSessions.map((session) => session.title);
    expect(titles.some((title) => title.includes('anthropic/claude'))).toBe(true);
    expect(titles.some((title) => title.includes('openai/gpt'))).toBe(true);

    harness.finishSession(harness.dispatched[0].sessionId, 'OUT1');
    await settle();
    expect(executor.getState().status).toBe('running');
    expect(harness.dispatched).toHaveLength(2);

    harness.finishSession(harness.dispatched[1].sessionId, 'OUT2');
    await settle();

    expect(harness.dispatched).toHaveLength(3);
    expect(harness.dispatched[2].content).toBe('OUT1\n\nOUT2');
  });

  test('partial parent readiness starts children early', async () => {
    const harness = createHarness();
    const a = buildNode({
      title: 'A',
      instances: [
        { id: 'i1', providerID: 'p1', modelID: 'm1' },
        { id: 'i2', providerID: 'p2', modelID: 'm2' },
      ],
    });
    const b = buildNode({ title: 'B', inputs: [{ id: 'b_in', name: 'value' }], promptTemplate: '{{value}}' });
    const graph = buildGraph({
      nodes: [a, b],
      edges: [{ id: 'e1', source: a.id, sourceInstanceId: 'i1', target: b.id, targetInputId: 'b_in' }],
    });
    const executor = new RunGraphExecutor(graph, harness.deps);
    executor.start();
    await settle();

    expect(harness.dispatched).toHaveLength(2);
    const i1Dispatch = harness.dispatched.find((entry) => entry.providerID === 'p1');
    if (!i1Dispatch) throw new Error('expected the p1 dispatch');
    const i1Session = i1Dispatch.sessionId;
    harness.finishSession(i1Session, 'EARLY');
    await settle();

    expect(harness.dispatched).toHaveLength(3);
    expect(harness.dispatched[2].content).toBe('EARLY');
    const i2Runtime = executor.getState().instances.i2;
    expect(i2Runtime.phase).toBe('running');

    harness.finishSession(harness.dispatched[2].sessionId, 'B DONE');
    await settle();
    harness.finishSession(harness.dispatched[1].sessionId, 'I2 DONE');
    await settle();

    expect(executor.getState().status).toBe('completed');
  });

  test('pool worktree gates launch and provides the directory', async () => {
    const harness = createHarness();
    const worktree: RunGraphWorktree = {
      id: 'wt1',
      title: 'Review',
      kind: 'existing',
      path: '/repo/wt',
      position: { x: 0, y: 0 },
    };
    const node = buildNode({
      title: 'A',
      instances: [{ id: 'i1', providerID: 'p', modelID: 'm' }],
    });
    const graph = buildGraph({
      nodes: [node],
      worktrees: [worktree],
      nodeWorktreeBindings: { [node.id]: 'wt1' },
    });
    const executor = new RunGraphExecutor(graph, harness.deps);
    executor.start();
    await settle();

    expect(harness.dispatched).toHaveLength(1);
    expect(harness.dispatched[0].directory).toBe('/wt/Review');
  });

  test('a failed worktree fails instances bound to it', async () => {
    const harness = createHarness();
    const worktree: RunGraphWorktree = {
      id: 'wt1',
      title: 'Ghost',
      kind: 'existing',
      path: '/missing',
      position: { x: 0, y: 0 },
    };
    const node = buildNode({
      title: 'A',
      instances: [{ id: 'i1', providerID: 'p', modelID: 'm' }],
    });
    const graph = buildGraph({
      nodes: [node],
      worktrees: [worktree],
      nodeWorktreeBindings: { [node.id]: 'wt1' },
    });
    harness.deps.resolveExistingWorktree = async () => {
      throw new Error('Worktree not found: /missing');
    };
    const executor = new RunGraphExecutor(graph, harness.deps);
    executor.start();
    await settle();

    expect(executor.getState().worktrees.wt1.phase).toBe('failed');
    expect(executor.getState().instances.i1.phase).toBe('failed');
    expect(executor.getState().status).toBe('completed');
  });

  test('dedicated-new placement creates a per-instance worktree lazily', async () => {
    const harness = createHarness();
    const node = buildNode({
      title: 'A',
      instances: [{ id: 'i1', providerID: 'anthropic', modelID: 'claude', worktree: { mode: 'dedicated-new' } }],
    });
    const executor = new RunGraphExecutor(buildGraph({ nodes: [node], name: 'My Graph' }), harness.deps);
    executor.start();
    await settle();

    expect(harness.dispatched[0].directory).toBe('/wt/dedicated/my-graph/a/anthropic-claude');
  });

  test('a dispatched session is not finished before it was observed busy', async () => {
    const harness = createHarness();
    const a = buildNode({ title: 'A' });
    const executor = new RunGraphExecutor(buildGraph({ nodes: [a] }), harness.deps);
    executor.start();
    await settle();

    expect(harness.dispatched).toHaveLength(1);
    harness.notifyStatusChange();
    await settle();

    const runtime = executor.getState().instances[a.instances[0].id];
    expect(runtime.phase).toBe('running');

    harness.finishSession(harness.dispatched[0].sessionId, 'OUTPUT');
    await settle();

    expect(executor.getState().instances[a.instances[0].id].phase).toBe('done');
    expect(executor.getState().status).toBe('completed');
  });

  test('an armed session that never becomes busy fails after the timeout', async () => {
    const harness = createHarness();
    harness.deps.dispatchPrompt = async () => undefined;
    harness.deps.armedTimeoutMs = 60;
    const a = buildNode({ title: 'A' });
    const executor = new RunGraphExecutor(buildGraph({ nodes: [a] }), harness.deps);
    executor.start();
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 250));

    const runtime = executor.getState().instances[a.instances[0].id];
    expect(runtime.phase).toBe('failed');
    expect(executor.getState().status).toBe('completed');
  });

  test('stop aborts the running session and skips pending work', async () => {
    const harness = createHarness();
    const a = buildNode({ title: 'A' });
    const b = buildNode({ title: 'B', inputs: [{ id: 'b_in', name: 'value' }], promptTemplate: '{{value}}' });
    const graph = buildGraph({
      nodes: [a, b],
      edges: [{ id: 'e1', source: a.id, sourceInstanceId: a.instances[0].id, target: b.id, targetInputId: 'b_in' }],
    });
    const executor = new RunGraphExecutor(graph, harness.deps);
    executor.start();
    await settle();

    await executor.stop();

    expect(executor.getState().status).toBe('stopped');
    expect(executor.getState().instances[a.instances[0].id].phase).toBe('skipped');
    expect(executor.getState().instances[b.instances[0].id].phase).toBe('skipped');
    expect(harness.aborted).toEqual([harness.dispatched[0].sessionId]);
  });

  test('dispatch failure marks the instance failed with the reason', async () => {
    const harness = createHarness();
    const a = buildNode({ title: 'A' });
    harness.deps.dispatchPrompt = async () => {
      throw new Error('send rejected');
    };
    const executor = new RunGraphExecutor(buildGraph({ nodes: [a] }), harness.deps);
    executor.start();
    await settle();

    const runtime = executor.getState().instances[a.instances[0].id];
    expect(runtime.phase).toBe('failed');
    expect(runtime.reason).toBe('send rejected');
  });

  test('a form gates its consumer and feeds field values into the template', async () => {
    const harness = createHarness();
    const form = buildFormNode();
    const field = form.fields[0];
    const a = buildNode({ title: 'A', inputs: [{ id: 'a_in', name: 'topic' }], promptTemplate: 'Research: {{topic}}' });
    const graph = buildGraph({
      nodes: [form, a],
      edges: [{ id: 'e1', source: form.id, sourceFieldId: field.id, target: a.id, targetInputId: 'a_in' }],
    });
    const executor = new RunGraphExecutor(graph, harness.deps);
    executor.start();
    await settle();

    expect(harness.dispatched).toHaveLength(0);
    expect(harness.formRequests).toHaveLength(1);
    expect(harness.formRequests[0].nodeId).toBe(form.id);
    expect(executor.getState().forms[form.id].phase).toBe('waiting-input');

    harness.submitForm(form.id, { [field.id]: 'run graphs' });
    await settle();

    expect(harness.dispatched).toHaveLength(1);
    expect(harness.dispatched[0].content).toBe('Research: run graphs');
    expect(executor.getState().forms[form.id].phase).toBe('submitted');

    harness.finishSession(harness.dispatched[0].sessionId, 'done');
    await settle();
    expect(executor.getState().status).toBe('completed');
  });

  test('a form waits for its own inputs and receives injected defaults', async () => {
    const harness = createHarness();
    const form = buildFormNode();
    const field = form.fields[0];
    const a = buildNode({ title: 'A' });
    const b = buildNode({ title: 'B', inputs: [{ id: 'b_ctx', name: 'context' }, { id: 'b_query', name: 'query' }], promptTemplate: 'Query {{context}} / {{query}}' });
    const graph = buildGraph({
      nodes: [form, a, b],
      edges: [
        { id: 'e1', source: a.id, sourceInstanceId: a.instances[0].id, target: b.id, targetInputId: 'b_ctx' },
        { id: 'e2', source: a.id, sourceInstanceId: a.instances[0].id, target: form.id, targetFieldId: field.id },
        { id: 'e3', source: form.id, sourceFieldId: field.id, target: b.id, targetInputId: 'b_query' },
      ],
    });
    const executor = new RunGraphExecutor(graph, harness.deps);
    executor.start();
    await settle();

    expect(harness.dispatched).toHaveLength(1);
    expect(harness.formRequests).toHaveLength(0);

    harness.finishSession(harness.dispatched[0].sessionId, 'A OUTPUT');
    await settle();

    expect(harness.formRequests).toHaveLength(1);
    expect(harness.formRequests[0].defaults[field.id]).toBe('A OUTPUT');

    harness.submitForm(form.id, { [field.id]: 'REFINED' });
    await settle();

    expect(harness.dispatched).toHaveLength(2);
    expect(harness.dispatched[1].content).toBe('Query A OUTPUT / REFINED');
  });

  test('cancelling a form fails it and blocks its consumers', async () => {
    const harness = createHarness();
    const form = buildFormNode();
    const a = buildNode({ title: 'A', inputs: [{ id: 'a_in', name: 'value' }], promptTemplate: '{{value}}' });
    const graph = buildGraph({
      nodes: [form, a],
      edges: [{ id: 'e1', source: form.id, sourceFieldId: form.fields[0].id, target: a.id, targetInputId: 'a_in' }],
    });
    const executor = new RunGraphExecutor(graph, harness.deps);
    executor.start();
    await settle();

    expect(harness.formRequests).toHaveLength(1);
    expect(executor.getState().forms[form.id].phase).toBe('waiting-input');

    harness.cancelForm(form.id);
    await settle();

    expect(executor.getState().forms[form.id].phase).toBe('failed');
    expect(executor.getState().forms[form.id].reason).toContain('cancelled');
    expect(executor.getState().instances[a.instances[0].id].phase).toBe('blocked');
    expect(executor.getState().status).toBe('completed');
  });

  test('a form with no consumers is never requested', async () => {
    const harness = createHarness();
    const form = buildFormNode();
    const a = buildNode({ title: 'A' });
    const executor = new RunGraphExecutor(buildGraph({ nodes: [form, a] }), harness.deps);
    executor.start();
    await settle();

    expect(harness.dispatched).toHaveLength(1);
    expect(harness.formRequests).toHaveLength(0);
    expect(executor.getState().forms[form.id]).toBeUndefined();

    harness.finishSession(harness.dispatched[0].sessionId, 'done');
    await settle();
    expect(executor.getState().status).toBe('completed');
  });

  test('a form is skipped when its only consumer is blocked', async () => {
    const harness = createHarness();
    const form = buildFormNode();
    const a = buildNode({ title: 'A' });
    const b = buildNode({ title: 'B', inputs: [{ id: 'b_in', name: 'value' }], promptTemplate: '{{value}}' });
    const graph = buildGraph({
      nodes: [form, a, b],
      edges: [
        { id: 'e1', source: a.id, sourceInstanceId: a.instances[0].id, target: b.id, targetInputId: 'b_in' },
        { id: 'e2', source: form.id, sourceFieldId: form.fields[0].id, target: b.id, targetInputId: 'b_in' },
      ],
    });
    const executor = new RunGraphExecutor(graph, harness.deps);
    executor.start();
    await settle();

    harness.endSessionWithoutOutput(harness.dispatched[0].sessionId);
    await settle();

    expect(executor.getState().instances[b.instances[0].id].phase).toBe('blocked');
    expect(executor.getState().forms[form.id].phase).toBe('skipped');
    expect(harness.formRequests).toHaveLength(0);
    expect(executor.getState().status).toBe('completed');
  });

  test('stop skips a form that is waiting for input', async () => {
    const harness = createHarness();
    const form = buildFormNode();
    const a = buildNode({ title: 'A', inputs: [{ id: 'a_in', name: 'value' }], promptTemplate: '{{value}}' });
    const graph = buildGraph({
      nodes: [form, a],
      edges: [{ id: 'e1', source: form.id, sourceFieldId: form.fields[0].id, target: a.id, targetInputId: 'a_in' }],
    });
    const executor = new RunGraphExecutor(graph, harness.deps);
    executor.start();
    await settle();
    expect(executor.getState().forms[form.id].phase).toBe('waiting-input');

    await executor.stop();

    expect(executor.getState().forms[form.id].phase).toBe('skipped');
    expect(executor.getState().status).toBe('stopped');
  });
});
