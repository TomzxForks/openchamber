import { describe, expect, test } from 'bun:test';
import type { RunGraphDefinition, RunGraphRunNode } from '@/types/runGraph';
import {
  MAX_NODES_PER_GRAPH,
  sanitizeRunGraph,
  sanitizeRunGraphs,
  sanitizeRunSessionIndex,
} from './sanitize';

const runNodeAt = (graph: RunGraphDefinition | null, index: number): RunGraphRunNode => {
  const node = graph?.nodes[index];
  if (!node || node.kind !== 'run') throw new Error(`expected a run node at index ${index}`);
  return node;
};

const validGraph: RunGraphDefinition = {
  id: 'graph_1',
  name: 'Review chain',
  nodes: [
    {
      kind: 'run',
      id: 'node_a',
      title: 'Research',
      agent: 'build',
      instances: [
        { id: 'inst_a1', providerID: 'anthropic', modelID: 'claude-sonnet', variant: 'think', displayName: 'Claude' },
        {
          id: 'inst_a2',
          providerID: 'openai',
          modelID: 'gpt-5',
          worktree: { mode: 'dedicated-new' },
        },
      ],
      inputs: [{ id: 'in_a', name: 'specs' }],
      promptTemplate: 'Investigate {{specs}}',
      position: { x: 10, y: 20 },
    },
    {
      kind: 'run',
      id: 'node_b',
      title: 'Synth',
      instances: [{ id: 'inst_b1', providerID: 'google', modelID: 'gemini' }],
      inputs: [{ id: 'in_b', name: 'reviews' }],
      promptTemplate: 'Merge {{reviews[0]}} and {{reviews[1]}}',
      position: { x: 40, y: 20 },
    },
  ],
  worktrees: [
    {
      id: 'wt_1',
      title: 'Shared review',
      kind: 'existing',
      path: '/repo/worktrees/review',
      position: { x: 0, y: 80 },
    },
    {
      id: 'wt_2',
      title: 'Fresh',
      kind: 'new',
      name: 'graphs/fresh',
      baseBranch: 'main',
      setupCommands: ['bun install'],
      position: { x: 0, y: 120 },
    },
  ],
  edges: [
    { id: 'edge_1', source: 'node_a', sourceInstanceId: 'inst_a1', target: 'node_b', targetInputId: 'in_b' },
    { id: 'edge_2', source: 'node_a', sourceInstanceId: 'inst_a2', target: 'node_b', targetInputId: 'in_b' },
  ],
  nodeWorktreeBindings: { node_a: 'wt_1' },
  baseBranch: 'develop',
  createdAt: 100,
  updatedAt: 200,
};

// Exercises the runtime parser with fixtures that violate the declared type.
const unsafe = <T,>(value: T): RunGraphDefinition => JSON.parse(JSON.stringify(value));
const unsafeList = <T,>(value: T): RunGraphDefinition[] => JSON.parse(JSON.stringify(value));

describe('sanitizeRunGraph', () => {
  test('round-trips a valid graph unchanged', () => {
    const result = sanitizeRunGraph(structuredClone(validGraph));
    expect(result).toEqual(validGraph);
  });

  test('rejects non-object and missing-id entries', () => {
    expect(sanitizeRunGraph(null)).toBeNull();
    expect(sanitizeRunGraph(unsafe('nope'))).toBeNull();
    expect(sanitizeRunGraph(unsafe({ name: 'no id' }))).toBeNull();
  });

  test('falls back to a default name and drops malformed shapes', () => {
    const result = sanitizeRunGraph(unsafe({
      id: 'graph_2',
      name: '   ',
      nodes: 'nope',
      edges: 42,
      worktrees: null,
      nodeWorktreeBindings: [],
    }));
    expect(result?.name).toBe('Untitled graph');
    expect(result?.nodes).toEqual([]);
    expect(result?.edges).toEqual([]);
    expect(result?.worktrees).toEqual([]);
    expect(result?.nodeWorktreeBindings).toEqual({});
  });

  test('drops edges referencing missing nodes or instances', () => {
    const result = sanitizeRunGraph({
      ...structuredClone(validGraph),
      edges: [
        ...validGraph.edges,
        { id: 'edge_3', source: 'node_ghost', sourceInstanceId: 'inst_a1', target: 'node_b' },
        { id: 'edge_4', source: 'node_a', sourceInstanceId: 'inst_ghost', target: 'node_b' },
      ],
    });
    expect(result?.edges.map((edge) => edge.id)).toEqual(['edge_1', 'edge_2']);
  });

  test('drops bindings to missing worktrees and pool overrides to missing worktrees', () => {
    const graph: RunGraphDefinition = structuredClone(validGraph);
    graph.nodeWorktreeBindings = { node_a: 'wt_ghost' };
    const nodeA = runNodeAt(graph, 0);
    const nodeB = runNodeAt(graph, 1);
    nodeA.instances[1].worktree = { mode: 'pool', worktreeId: 'wt_1' };
    nodeB.instances[0].worktree = { mode: 'pool', worktreeId: 'wt_ghost' };
    const result = sanitizeRunGraph(graph);
    expect(result?.nodeWorktreeBindings).toEqual({});
    expect(runNodeAt(result, 0).instances[1].worktree).toEqual({ mode: 'pool', worktreeId: 'wt_1' });
    expect(runNodeAt(result, 1).instances[0].worktree).toEqual(undefined);
  });

  test('drops nodes without id or title and instances without model', () => {
    const result = sanitizeRunGraph(unsafe({
      id: 'graph_3',
      name: 'X',
      nodes: [
        { title: 'no id', instances: [], promptTemplate: '', position: {} },
        { id: 'node_ok', title: 'No models', instances: [{ providerID: '', modelID: '' }], promptTemplate: '', position: {} },
        { id: 'node_ok2', title: 'Kept', instances: [{ id: 'i1', providerID: 'p', modelID: 'm' }], promptTemplate: '', position: {} },
      ],
      worktrees: [],
      edges: [],
      nodeWorktreeBindings: {},
    }));
    expect(result?.nodes).toHaveLength(2);
    expect(runNodeAt(result, 0).instances).toEqual([]);
    expect(runNodeAt(result, 1).instances).toHaveLength(1);
  });

  test('caps node count and template length', () => {
    const nodes = Array.from({ length: MAX_NODES_PER_GRAPH + 5 }, (_, index) => ({
      id: `node_${index}`,
      title: `Node ${index}`,
      instances: [{ id: `i_${index}`, providerID: 'p', modelID: 'm' }],
      promptTemplate: 'x'.repeat(50),
      position: { x: index, y: 0 },
    }));
    const result = sanitizeRunGraph(unsafe({ id: 'graph_4', name: 'Big', nodes, worktrees: [], edges: [], nodeWorktreeBindings: {} }));
    expect(result?.nodes).toHaveLength(MAX_NODES_PER_GRAPH);
  });

  test('truncates oversized templates and titles', () => {
    const result = sanitizeRunGraph(unsafe({
      id: 'graph_5',
      name: 'T'.repeat(500),
      nodes: [
        {
          id: 'node_t',
          title: 'N'.repeat(500),
          instances: [{ id: 'i1', providerID: 'p', modelID: 'm' }],
          promptTemplate: 'x'.repeat(30000),
          position: { x: 0, y: 0 },
        },
      ],
      worktrees: [],
      edges: [],
      nodeWorktreeBindings: {},
    }));
    expect(result?.name.length).toBe(120);
    expect(runNodeAt(result, 0).title.length).toBe(120);
    expect(runNodeAt(result, 0).promptTemplate.length).toBe(20000);
  });

  test('normalizes position entries with non-finite numbers', () => {
    const result = sanitizeRunGraph(unsafe({
      id: 'graph_6',
      name: 'Pos',
      nodes: [
        {
          id: 'node_p',
          title: 'P',
          instances: [{ id: 'i1', providerID: 'p', modelID: 'm' }],
          promptTemplate: '',
          position: { x: Number.NaN, y: '12' },
        },
      ],
      worktrees: [],
      edges: [],
      nodeWorktreeBindings: {},
    }));
    expect(result?.nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  test('round-trips a graph with a form node and field edges', () => {
    const graph = sanitizeRunGraph({
      id: 'graph_7',
      name: 'With form',
      nodes: [
        {
          kind: 'form',
          id: 'form_1',
          title: 'Research input',
          fields: [
            { id: 'field_1', title: 'Topic', type: 'text', required: true, placeholder: 'a topic' },
            { id: 'field_2', title: 'Effort', type: 'slider', min: 1, max: 10, step: 1, defaultValue: '5' },
            { id: 'field_3', title: 'Flavour', type: 'select', options: ['quick', 'deep'] },
          ],
          position: { x: 0, y: 0 },
        },
        {
          kind: 'run',
          id: 'node_a',
          title: 'Research',
          instances: [{ id: 'i1', providerID: 'p', modelID: 'm' }],
          inputs: [{ id: 'in_a', name: 'topic' }],
          promptTemplate: 'Research {{topic}}',
          position: { x: 100, y: 0 },
        },
      ],
      worktrees: [],
      edges: [
        { id: 'edge_1', source: 'form_1', sourceFieldId: 'field_1', target: 'node_a', targetInputId: 'in_a' },
        { id: 'edge_2', source: 'node_a', sourceInstanceId: 'i1', target: 'form_1', targetFieldId: 'field_2' },
      ],
      nodeWorktreeBindings: {},
      createdAt: 1,
      updatedAt: 1,
    });
    expect(graph?.nodes[0].kind).toBe('form');
    if (graph?.nodes[0].kind !== 'form') throw new Error('expected the form node to survive');
    expect(graph.nodes[0].fields).toHaveLength(3);
    expect(graph.edges).toEqual([
      { id: 'edge_1', source: 'form_1', sourceFieldId: 'field_1', target: 'node_a', targetInputId: 'in_a' },
      { id: 'edge_2', source: 'node_a', sourceInstanceId: 'i1', target: 'form_1', targetFieldId: 'field_2' },
    ]);
  });

  test('treats persisted nodes without a kind as run nodes', () => {
    const result = sanitizeRunGraph(unsafe({
      id: 'graph_8',
      name: 'Legacy',
      nodes: [
        {
          id: 'node_a',
          title: 'Research',
          instances: [{ id: 'i1', providerID: 'p', modelID: 'm' }],
          promptTemplate: 'Go {{inputs[0]}}',
          position: { x: 0, y: 0 },
        },
      ],
      edges: [{ id: 'edge_1', source: 'node_a', sourceInstanceId: 'i1', target: 'node_a' }],
      nodeWorktreeBindings: {},
      createdAt: 1,
      updatedAt: 1,
    }));
    expect(result?.nodes[0].kind).toBe('run');
  });

  test('migrates legacy graphs to a named "inputs" input', () => {
    const result = sanitizeRunGraph(unsafe({
      id: 'graph_10',
      name: 'Legacy edges',
      nodes: [
        {
          kind: 'run',
          id: 'node_a',
          title: 'Research',
          instances: [{ id: 'i1', providerID: 'p', modelID: 'm' }],
          promptTemplate: 'Go {{inputs[0]}}',
          position: { x: 0, y: 0 },
        },
        {
          kind: 'run',
          id: 'node_b',
          title: 'Synth',
          instances: [{ id: 'i2', providerID: 'p', modelID: 'm' }],
          promptTemplate: 'Merge {{inputs}}',
          position: { x: 100, y: 0 },
        },
      ],
      worktrees: [],
      edges: [
        { id: 'edge_1', source: 'node_a', sourceInstanceId: 'i1', target: 'node_b' },
      ],
      nodeWorktreeBindings: {},
      createdAt: 1,
      updatedAt: 1,
    }));
    const nodeB = runNodeAt(result, 1);
    expect(nodeB.inputs).toHaveLength(1);
    expect(nodeB.inputs[0].name).toBe('inputs');
    expect(result?.edges[0].targetInputId).toBe(nodeB.inputs[0].id);
  });

  test('resolves legacy edges onto an existing input named "inputs"', () => {
    const result = sanitizeRunGraph(unsafe({
      id: 'graph_11',
      name: 'Legacy with declared input',
      nodes: [
        {
          kind: 'run',
          id: 'node_a',
          title: 'Research',
          instances: [{ id: 'i1', providerID: 'p', modelID: 'm' }],
          promptTemplate: 'Go',
          position: { x: 0, y: 0 },
        },
        {
          kind: 'run',
          id: 'node_b',
          title: 'Synth',
          instances: [{ id: 'i2', providerID: 'p', modelID: 'm' }],
          inputs: [{ id: 'in_custom', name: 'inputs' }],
          promptTemplate: 'Merge {{inputs}}',
          position: { x: 100, y: 0 },
        },
      ],
      worktrees: [],
      edges: [
        { id: 'edge_1', source: 'node_a', sourceInstanceId: 'i1', target: 'node_b' },
      ],
      nodeWorktreeBindings: {},
      createdAt: 1,
      updatedAt: 1,
    }));
    expect(runNodeAt(result, 1).inputs).toHaveLength(1);
    expect(result?.edges[0].targetInputId).toBe('in_custom');
  });

  test('keeps more form fields than the old cap', () => {
    const fields = Array.from({ length: 20 }, (_, index) => ({
      id: `f_${index}`,
      title: `Field ${index}`,
      type: 'text',
    }));
    const result = sanitizeRunGraph(unsafe({
      id: 'graph_12',
      name: 'Many fields',
      nodes: [
        { kind: 'form', id: 'form_1', title: 'Form', fields, position: { x: 0, y: 0 } },
        { kind: 'run', id: 'node_a', title: 'Run', instances: [{ id: 'i1', providerID: 'p', modelID: 'm' }], promptTemplate: '', position: { x: 0, y: 0 } },
      ],
      worktrees: [],
      edges: [],
      nodeWorktreeBindings: {},
      createdAt: 1,
      updatedAt: 1,
    }));
    if (result?.nodes[0].kind !== 'form') throw new Error('expected the form node to survive');
    expect(result.nodes[0].fields).toHaveLength(20);
  });

  test('drops malformed form fields and invalid form edges', () => {
    const result = sanitizeRunGraph(unsafe({
      id: 'graph_9',
      name: 'Messy forms',
      nodes: [
        {
          kind: 'form',
          id: 'form_1',
          title: 'Form',
          fields: [
            { id: 'f1', title: '', type: 'text' },
            { id: 'f2', title: 'Pick', type: 'select', options: [] },
            { id: 'f3', title: 'Range', type: 'slider', min: 10, max: 0 },
            { id: 'f4', title: 'Kept', type: 'text' },
          ],
          position: { x: 0, y: 0 },
        },
        {
          kind: 'run',
          id: 'node_a',
          title: 'Run',
          instances: [{ id: 'i1', providerID: 'p', modelID: 'm' }],
          promptTemplate: 'x',
          position: { x: 100, y: 0 },
        },
      ],
      edges: [
        { id: 'edge_1', source: 'form_1', sourceInstanceId: 'i1', target: 'node_a' },
        { id: 'edge_2', source: 'node_a', sourceInstanceId: 'i1', target: 'form_1' },
        { id: 'edge_3', source: 'node_a', sourceInstanceId: 'ghost', target: 'node_a' },
        { id: 'edge_4', source: 'form_1', sourceFieldId: 'f4', target: 'node_a' },
      ],
      nodeWorktreeBindings: { form_1: 'wt_missing' },
      createdAt: 1,
      updatedAt: 1,
    }));
    if (result?.nodes[0].kind !== 'form') throw new Error('expected the form node to survive');
    expect(result.nodes[0].fields.map((field) => field.id)).toEqual(['f4']);
    expect(result.edges.map((edge) => edge.id)).toEqual(['edge_4']);
    expect(result.nodeWorktreeBindings).toEqual({});
  });
});

describe('sanitizeRunSessionIndex', () => {
  test('keeps valid links and drops entries without graph or node ids', () => {
    const index = sanitizeRunSessionIndex({
      ses_1: { graphId: 'g', nodeId: 'n', graphName: 'G', nodeTitle: 'T', directory: '/d', at: 5 },
      ses_2: { graphId: '', nodeId: 'n', at: 3 },
      ses_3: { graphId: 'g', nodeId: '', at: 2 },
      'bad id!': { graphId: 'g', nodeId: 'n', at: 1 },
    });
    expect(Object.keys(index)).toEqual(['ses_1']);
    expect(index.ses_1.directory).toBe('/d');
  });

  test('keeps only the newest MAX_SESSION_LINKS entries', () => {
    const raw: Record<string, { graphId: string; nodeId: string; at: number }> = {};
    for (let i = 0; i < 260; i += 1) {
      raw[`ses_${i}`] = { graphId: 'g', nodeId: 'n', at: i };
    }
    const index = sanitizeRunSessionIndex(raw);
    expect(Object.keys(index)).toHaveLength(200);
    expect(index.ses_259).toBeDefined();
    expect(index.ses_0).toBeUndefined();
  });

  test('returns empty for malformed input', () => {
    expect(sanitizeRunSessionIndex(undefined)).toEqual({});
    expect(sanitizeRunSessionIndex('nope')).toEqual({});
  });
});

describe('sanitizeRunGraphs', () => {
  test('returns an empty array for malformed input', () => {
    expect(sanitizeRunGraphs(undefined)).toEqual([]);
    expect(sanitizeRunGraphs(unsafeList('nope'))).toEqual([]);
    expect(sanitizeRunGraphs(unsafeList([null, 3, { id: '' }]))).toEqual([]);
  });

  test('deduplicates ids and preserves order', () => {
    const a = { ...structuredClone(validGraph), id: 'graph_a' };
    const result = sanitizeRunGraphs([a, { ...a }, validGraph]);
    expect(result.map((graph) => graph.id)).toEqual(['graph_a', 'graph_1']);
  });

  test('respects the graph count cap', () => {
    const graphs = Array.from({ length: 60 }, (_, index) => ({
      ...structuredClone(validGraph),
      id: `graph_${index}`,
    }));
    expect(sanitizeRunGraphs(graphs)).toHaveLength(50);
  });
});
