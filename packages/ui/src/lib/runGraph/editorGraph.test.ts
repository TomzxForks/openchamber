import { describe, expect, test } from 'bun:test';
import type { RunGraphDefinition, RunGraphFormNode, RunGraphNode, RunGraphRunNode } from '@/types/runGraph';
import type { MultiRunSessionLink } from '@/types/runGraph';
import {
  createEmptyRunGraph,
  createRunGraphFormField,
  createRunGraphNodeInput,
  listNodeSessions,
  pickGraphForSession,
  withEdge,
  withFormField,
  withNodeBinding,
  withNodeInput,
  withUpdatedFormField,
  withUpdatedFormNode,
  withUpdatedInstance,
  withUpdatedNode,
  withUpdatedNodeInput,
  withWorktree,
  withoutEdge,
  withoutFormField,
  withoutInstance,
  withoutNode,
  withoutNodeInput,
  withoutWorktree,
} from './editorGraph';

let counter = 0;
const nextId = (prefix: string): string => {
  counter += 1;
  return `${prefix}_${counter}`;
};

const buildNode = (overrides: Partial<RunGraphRunNode> = {}): RunGraphRunNode => ({
  kind: 'run',
  id: nextId('node'),
  title: `Node ${counter}`,
  instances: [{ id: nextId('inst'), providerID: 'p', modelID: 'm' }],
  inputs: [],
  promptTemplate: '',
  position: { x: 0, y: 0 },
  ...overrides,
});

const buildFormNode = (overrides: Partial<RunGraphFormNode> = {}): RunGraphFormNode => ({
  kind: 'form',
  id: nextId('form'),
  title: `Form ${counter}`,
  fields: [],
  position: { x: 0, y: 0 },
  ...overrides,
});

const findRunNode = (graph: RunGraphDefinition, nodeId: string): RunGraphRunNode => {
  const node = graph.nodes.find((entry) => entry.id === nodeId);
  if (!node || node.kind !== 'run') throw new Error(`run node ${nodeId} not found`);
  return node;
};

const findFormNode = (graph: RunGraphDefinition, nodeId: string): RunGraphFormNode => {
  const node = graph.nodes.find((entry) => entry.id === nodeId);
  if (!node || node.kind !== 'form') throw new Error(`form node ${nodeId} not found`);
  return node;
};

const buildGraph = (nodes: RunGraphNode[] = []): RunGraphDefinition => ({
  id: nextId('graph'),
  name: 'Graph',
  nodes,
  worktrees: [],
  edges: [],
  nodeWorktreeBindings: {},
  createdAt: 0,
  updatedAt: 0,
});

const link = (overrides: Partial<MultiRunSessionLink> = {}): MultiRunSessionLink => ({
  graphId: 'graph_1',
  graphName: 'Graph',
  nodeId: 'node_a',
  nodeTitle: 'Run 1',
  directory: '/proj',
  at: 1,
  ...overrides,
});

describe('pickGraphForSession', () => {
  const graph = buildGraph([buildNode({ id: 'node_a', title: 'A' })]);

  test('returns the graph and link for a known session', () => {
    const picked = pickGraphForSession([graph], { ses_1: link({ graphId: graph.id }) }, 'ses_1');
    expect(picked?.graph.id).toBe(graph.id);
    expect(picked?.link.nodeId).toBe('node_a');
  });

  test('returns null for unknown sessions or missing graphs', () => {
    expect(pickGraphForSession([graph], {}, 'ses_x')).toBeNull();
    expect(pickGraphForSession([graph], { ses_1: link({ graphId: 'ghost' }) }, 'ses_1')).toBeNull();
    expect(pickGraphForSession([graph], { ses_1: link() }, null)).toBeNull();
  });
});

describe('listNodeSessions', () => {
  test('filters by node and sorts newest first', () => {
    const index = {
      ses_old: link({ nodeId: 'node_a', at: 1 }),
      ses_new: link({ nodeId: 'node_a', at: 9 }),
      ses_other: link({ nodeId: 'node_b', at: 5 }),
    };
    const sessions = listNodeSessions(index, 'node_a');
    expect(sessions.map((entry) => entry.sessionId)).toEqual(['ses_new', 'ses_old']);
  });
});

describe('editorGraph', () => {
  test('createEmptyRunGraph initializes a blank graph', () => {
    const graph = createEmptyRunGraph('My graph', 42);
    expect(graph.name).toBe('My graph');
    expect(graph.nodes).toEqual([]);
    expect(graph.worktrees).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.createdAt).toBe(42);
    expect(graph.updatedAt).toBe(42);
  });

  test('withUpdatedNode patches one node and preserves others by reference', () => {
    const a = buildNode();
    const b = buildNode();
    const graph = buildGraph([a, b]);
    const updated = withUpdatedNode(graph, a.id, { title: 'Renamed' });
    expect(updated.nodes[0].title).toBe('Renamed');
    expect(updated.nodes[1]).toBe(b);
  });

  test('withoutNode removes edges and bindings for that node', () => {
    const a = buildNode();
    const b = buildNode();
    const graph = withNodeBinding(
      withEdge(buildGraph([a, b]), { source: a.id, sourceInstanceId: a.instances[0].id, target: b.id, id: 'e1' }),
      b.id,
      'wt1',
    );
    const updated = withoutNode(graph, a.id);
    expect(updated.nodes).toEqual([b]);
    expect(updated.edges).toEqual([]);
    expect(updated.nodeWorktreeBindings).toEqual({ [b.id]: 'wt1' });
    const withoutB = withoutNode(graph, b.id);
    expect(withoutB.edges).toEqual([]);
    expect(withoutB.nodeWorktreeBindings).toEqual({});
  });

  test('withEdge deduplicates identical connections', () => {
    const a = buildNode();
    const b = buildNode();
    const graph = buildGraph([a, b]);
    const once = withEdge(graph, { source: a.id, sourceInstanceId: a.instances[0].id, target: b.id });
    const twice = withEdge(once, { source: a.id, sourceInstanceId: a.instances[0].id, target: b.id });
    expect(once.edges).toHaveLength(1);
    expect(twice).toBe(once);
  });

  test('withoutEdge removes only the targeted edge', () => {
    const a = buildNode();
    const b = buildNode();
    const graph = buildGraph([a, b]);
    const withE1 = withEdge(graph, { source: a.id, sourceInstanceId: a.instances[0].id, target: b.id, id: 'e1' });
    const withE2 = withEdge(withE1, { source: b.id, sourceInstanceId: b.instances[0].id, target: a.id, id: 'e2' });
    const removed = withoutEdge(withE2, 'e1');
    expect(removed.edges.map((edge) => edge.id)).toEqual(['e2']);
  });

  test('withoutInstance cascades edges sourced from that instance', () => {
    const a = buildNode();
    const b = buildNode({ promptTemplate: '{{inputs[0]}}' });
    const graph = withEdge(buildGraph([a, b]), {
      source: a.id,
      sourceInstanceId: a.instances[0].id,
      target: b.id,
      id: 'e1',
    });
    const updated = withoutInstance(graph, a.id, a.instances[0].id);
    expect(findRunNode(updated, a.id).instances).toEqual([]);
    expect(updated.edges).toEqual([]);
  });

  test('withUpdatedInstance patches one instance', () => {
    const a = buildNode({
      instances: [
        { id: 'i1', providerID: 'p', modelID: 'm' },
        { id: 'i2', providerID: 'p2', modelID: 'm2' },
      ],
    });
    const updated = withUpdatedInstance(buildGraph([a]), a.id, 'i1', { variant: 'think' });
    const instances = findRunNode(updated, a.id).instances;
    expect(instances[0].variant).toBe('think');
    expect(instances[1].variant).toEqual(undefined);
  });

  test('withoutWorktree strips bindings and pool overrides', () => {
    const worktree = { id: 'wt1', title: 'W', kind: 'existing' as const, path: '/wt', position: { x: 0, y: 0 } };
    const a = buildNode({
      instances: [
        { id: 'i1', providerID: 'p', modelID: 'm', worktree: { mode: 'pool', worktreeId: 'wt1' } },
        { id: 'i2', providerID: 'p', modelID: 'm' },
      ],
    });
    let graph: RunGraphDefinition = withWorktree(buildGraph([a]), worktree);
    graph = withNodeBinding(graph, a.id, 'wt1');

    const updated = withoutWorktree(graph, 'wt1');
    expect(updated.worktrees).toEqual([]);
    expect(updated.nodeWorktreeBindings).toEqual({});
    const instances = findRunNode(updated, a.id).instances;
    expect(instances[0]).toEqual({ id: 'i1', providerID: 'p', modelID: 'm' });
    expect(instances[1].id).toBe('i2');
    expect(instances[1].worktree).toEqual(undefined);
  });

  test('form nodes support field CRUD with edge cascades', () => {
    const form = buildFormNode();
    const a = buildNode({ promptTemplate: '{{inputs[0]}}' });
    const field = createRunGraphFormField('Topic', 'text');
    let graph = withFormField(buildGraph([form, a]), form.id, field);
    expect(findFormNode(graph, form.id).fields).toEqual([field]);

    graph = withEdge(graph, {
      source: form.id,
      sourceFieldId: field.id,
      target: a.id,
      id: 'e1',
    });
    graph = withEdge(graph, {
      source: a.id,
      sourceInstanceId: a.instances[0].id,
      target: form.id,
      targetFieldId: field.id,
      id: 'e2',
    });

    const patched = withUpdatedFormField(graph, form.id, field.id, { required: true, defaultValue: 'x' });
    expect(findFormNode(patched, form.id).fields[0]).toEqual({ ...field, required: true, defaultValue: 'x' });

    const cleaned = withoutFormField(patched, form.id, field.id);
    expect(findFormNode(cleaned, form.id).fields).toEqual([]);
    expect(cleaned.edges).toEqual([]);
  });

  test('run node helpers ignore form nodes and vice versa', () => {
    const form = buildFormNode();
    const a = buildNode();
    const graph = buildGraph([form, a]);

    expect(withUpdatedNode(graph, form.id, { title: 'Nope' }).nodes[0].title).toBe(form.title);
    expect(withUpdatedFormNode(graph, a.id, { title: 'Nope' }).nodes[1].title).toBe(a.title);

    const renamedForm = withUpdatedFormNode(graph, form.id, { title: 'Renamed form' });
    expect(renamedForm.nodes[0].title).toBe('Renamed form');
    expect(renamedForm.nodes[1]).toBe(a);
  });

  test('run node inputs support CRUD with edge cascades', () => {
    const a = buildNode();
    const b = buildNode({ inputs: [{ id: 'b_in', name: 'value' }], promptTemplate: '{{value}}' });
    const input = createRunGraphNodeInput('topic');
    let graph = withNodeInput(buildGraph([a, b]), a.id, input);
    expect(findRunNode(graph, a.id).inputs).toEqual([input]);

    graph = withEdge(graph, {
      source: b.id,
      sourceInstanceId: b.instances[0].id,
      target: a.id,
      targetInputId: input.id,
      id: 'e1',
    });

    const renamed = withUpdatedNodeInput(graph, a.id, input.id, { name: 'subject' });
    expect(findRunNode(renamed, a.id).inputs[0].name).toBe('subject');

    const cleaned = withoutNodeInput(renamed, a.id, input.id);
    expect(findRunNode(cleaned, a.id).inputs).toEqual([]);
    expect(cleaned.edges).toEqual([]);
    expect(findRunNode(cleaned, b.id).inputs).toEqual([{ id: 'b_in', name: 'value' }]);
  });

  test('run node helpers ignore form nodes for input mutations', () => {
    const form = buildFormNode();
    const graph = buildGraph([form]);
    const input = createRunGraphNodeInput('topic');
    expect(withNodeInput(graph, form.id, input)).toBe(graph);
    expect(withUpdatedNodeInput(graph, form.id, input.id, { name: 'x' })).toBe(graph);
    expect(withoutNodeInput(graph, form.id, input.id)).toBe(graph);
  });
});
