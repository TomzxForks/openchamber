import { describe, expect, test } from 'bun:test';
import type { RunGraphDefinition, RunGraphFormNode, RunGraphRunNode } from '@/types/runGraph';
import { hasRunGraphErrors, validateRunGraph } from './validate';

let counter = 0;
const nextId = (prefix: string): string => {
  counter += 1;
  return `${prefix}_${counter}`;
};

const buildNode = (overrides: Partial<RunGraphRunNode> = {}): RunGraphRunNode => {
  counter += 1;
  return {
    kind: 'run',
    id: nextId('node'),
    title: `Node ${counter}`,
    instances: [
      {
        id: nextId('inst'),
        providerID: 'anthropic',
        modelID: 'claude-sonnet',
      },
    ],
    inputs: [],
    promptTemplate: 'Do the thing.',
    position: { x: 0, y: 0 },
    ...overrides,
  };
};

const buildFormNode = (overrides: Partial<RunGraphFormNode> = {}): RunGraphFormNode => {
  counter += 1;
  return {
    kind: 'form',
    id: nextId('form'),
    title: `Form ${counter}`,
    fields: [{ id: nextId('field'), title: 'Topic', type: 'text' }],
    position: { x: 0, y: 0 },
    ...overrides,
  };
};

const buildGraph = (overrides: Partial<RunGraphDefinition> = {}): RunGraphDefinition => {
  counter += 1;
  return {
    id: nextId('graph'),
    name: `Graph ${counter}`,
    nodes: [],
    worktrees: [],
    edges: [],
    nodeWorktreeBindings: {},
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
};

const codesOf = (graph: RunGraphDefinition) => validateRunGraph(graph).map((issue) => issue.code);

describe('validateRunGraph', () => {
  test('an empty graph reports exactly the empty-graph error', () => {
    const issues = validateRunGraph(buildGraph());
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('empty-graph');
    expect(issues[0].severity).toBe('error');
  });

  test('a single valid node passes with no issues', () => {
    const node = buildNode();
    const issues = validateRunGraph(buildGraph({ nodes: [node] }));
    expect(issues).toEqual([]);
  });

  test('duplicate node titles are errors', () => {
    const a = buildNode({ title: 'Research' });
    const b = buildNode({ title: 'Research' });
    const issues = validateRunGraph(buildGraph({ nodes: [a, b] }));
    expect(issues.filter((issue) => issue.code === 'duplicate-title')).toHaveLength(1);
    expect(issues.find((issue) => issue.code === 'duplicate-title')?.message).toContain('Research');
  });

  test('a node without instances is an error', () => {
    const node = buildNode({ instances: [] });
    expect(codesOf(buildGraph({ nodes: [node] }))).toContain('node-missing-instances');
  });

  test('an instance without model identifiers is an error', () => {
    const node = buildNode({
      instances: [{ id: 'inst_x', providerID: '', modelID: '' }],
    });
    const issues = validateRunGraph(buildGraph({ nodes: [node] }));
    const issue = issues.find((entry) => entry.code === 'instance-missing-model');
    expect(issue?.instanceId).toBe('inst_x');
  });

  test('edges to missing nodes or instances are errors', () => {
    const a = buildNode();
    const b = buildNode({ promptTemplate: '{{inputs[0]}}' });
    const graph = buildGraph({
      nodes: [a, b],
      edges: [
        { id: 'e1', source: 'missing_node', sourceInstanceId: a.instances[0].id, target: b.id },
        { id: 'e2', source: a.id, sourceInstanceId: 'missing_inst', target: b.id },
      ],
    });
    const codes = codesOf(graph);
    expect(codes).toContain('edge-dangling-node');
    expect(codes).toContain('edge-source-port-invalid');
  });

  test('self edges and cycles are errors', () => {
    const a = buildNode({ promptTemplate: '{{inputs[0]}}' });
    const b = buildNode({ promptTemplate: '{{inputs[0]}}' });
    const graph = buildGraph({
      nodes: [a, b],
      edges: [
        { id: 'e1', source: a.id, sourceInstanceId: a.instances[0].id, target: a.id },
        { id: 'e2', source: a.id, sourceInstanceId: a.instances[0].id, target: b.id },
        { id: 'e3', source: b.id, sourceInstanceId: b.instances[0].id, target: a.id },
      ],
    });
    const codes = codesOf(graph);
    expect(codes).toContain('edge-self');
    expect(codes).toContain('edge-cycle');
    expect(hasRunGraphErrors(validateRunGraph(graph))).toBe(true);
  });

  test('a valid two-node chain with a named input produces no issues', () => {
    const a = buildNode({ title: 'Research' });
    const b = buildNode({
      title: 'Synth',
      inputs: [{ id: 'b_in', name: 'value' }],
      promptTemplate: 'Merge: {{value}}',
    });
    const graph = buildGraph({
      nodes: [a, b],
      edges: [{ id: 'e1', source: a.id, sourceInstanceId: a.instances[0].id, target: b.id, targetInputId: 'b_in' }],
    });
    expect(validateRunGraph(graph)).toEqual([]);
  });

  test('template range errors reference the node, the input, and the problem', () => {
    const a = buildNode({ title: 'Research' });
    const b = buildNode({
      title: 'Synth',
      inputs: [{ id: 'b_in', name: 'value' }],
      promptTemplate: 'A: {{value[0]}} B: {{value[1]}}',
    });
    const graph = buildGraph({
      nodes: [a, b],
      edges: [{ id: 'e1', source: a.id, sourceInstanceId: a.instances[0].id, target: b.id, targetInputId: 'b_in' }],
    });
    const issues = validateRunGraph(graph);
    const rangeIssue = issues.find((issue) => issue.code === 'template-input-range');
    expect(rangeIssue?.nodeId).toBe(b.id);
    expect(rangeIssue?.inputName).toBe('value');
    expect(rangeIssue?.message).toContain('only 1 value(s)');
  });

  test('a template referencing an undeclared input is an error', () => {
    const node = buildNode({ promptTemplate: '{{topic}}' });
    const issues = validateRunGraph(buildGraph({ nodes: [node] }));
    const issue = issues.find((entry) => entry.code === 'template-unknown-input');
    expect(issue?.nodeId).toBe(node.id);
    expect(issue?.inputName).toBe('topic');
  });

  test('a declared input with nothing connected is an error when referenced', () => {
    const node = buildNode({
      inputs: [{ id: 'in_1', name: 'topic' }],
      promptTemplate: '{{topic}}',
    });
    const issues = validateRunGraph(buildGraph({ nodes: [node] }));
    const issue = issues.find((entry) => entry.code === 'template-no-inputs');
    expect(issue?.nodeId).toBe(node.id);
    expect(issue?.inputName).toBe('topic');
  });

  test('invalid template syntax is an error', () => {
    const node = buildNode({ promptTemplate: '{{topic.bad}}' });
    expect(codesOf(buildGraph({ nodes: [node] }))).toContain('template-syntax');
  });

  test('existing worktrees require a path and new worktrees require a name', () => {
    const missingPath = {
      id: 'wt1',
      title: 'Review',
      kind: 'existing' as const,
      position: { x: 0, y: 0 },
    };
    const missingName = {
      id: 'wt2',
      title: 'Fresh',
      kind: 'new' as const,
      position: { x: 0, y: 0 },
    };
    const codes = codesOf(buildGraph({ worktrees: [missingPath, missingName] }));
    expect(codes).toContain('worktree-missing-path');
    expect(codes).toContain('worktree-missing-name');
    expect(codes).toContain('worktree-orphan');
  });

  test('bindings to missing worktrees are errors', () => {
    const node = buildNode();
    const graph = buildGraph({ nodes: [node], nodeWorktreeBindings: { [node.id]: 'nope' } });
    expect(codesOf(graph)).toContain('binding-dangling');
  });

  test('instances referencing a missing pool worktree are errors', () => {
    const node = buildNode({
      instances: [
        {
          id: 'inst_pool',
          providerID: 'anthropic',
          modelID: 'claude',
          worktree: { mode: 'pool', worktreeId: 'ghost' },
        },
      ],
    });
    expect(codesOf(buildGraph({ nodes: [node] }))).toContain('instance-pool-dangling');
  });

  test('sharing a worktree produces a warning, not an error', () => {
    const worktree = { id: 'wt1', title: 'Shared', kind: 'existing' as const, path: '/repo/wt', position: { x: 0, y: 0 } };
    const a = buildNode({ title: 'A' });
    const b = buildNode({ title: 'B' });
    const graph = buildGraph({
      nodes: [a, b],
      worktrees: [worktree],
      nodeWorktreeBindings: { [a.id]: 'wt1', [b.id]: 'wt1' },
    });
    const issues = validateRunGraph(graph);
    const shared = issues.find((issue) => issue.code === 'shared-worktree');
    expect(shared?.severity).toBe('warning');
    expect(shared?.message).toContain('concurrently');
    expect(hasRunGraphErrors(issues)).toBe(false);
  });

  test('instance-level overrides referencing a shared worktree also warn', () => {
    const worktree = { id: 'wt1', title: 'Shared', kind: 'existing' as const, path: '/repo/wt', position: { x: 0, y: 0 } };
    const a = buildNode({
      title: 'A',
      instances: [
        { id: 'i1', providerID: 'p', modelID: 'm', worktree: { mode: 'pool', worktreeId: 'wt1' } },
      ],
    });
    const b = buildNode({ title: 'B' });
    const graph = buildGraph({
      nodes: [a, b],
      worktrees: [worktree],
      nodeWorktreeBindings: { [b.id]: 'wt1' },
    });
    const shared = validateRunGraph(graph).find((issue) => issue.code === 'shared-worktree');
    expect(shared).toBeDefined();
  });

  test('inherit resolves to root when unbound and produces no warning', () => {
    const a = buildNode({ title: 'A' });
    const b = buildNode({ title: 'B' });
    expect(validateRunGraph(buildGraph({ nodes: [a, b] }))).toEqual([]);
  });

  test('a form feeding a run through a field edge produces no issues', () => {
    const form = buildFormNode();
    const a = buildNode({
      title: 'A',
      inputs: [{ id: 'a_in', name: 'topic' }],
      promptTemplate: 'Research {{topic}}',
    });
    const graph = buildGraph({
      nodes: [form, a],
      edges: [{ id: 'e1', source: form.id, sourceFieldId: form.fields[0].id, target: a.id, targetInputId: 'a_in' }],
    });
    expect(validateRunGraph(graph)).toEqual([]);
  });

  test('form field problems are errors', () => {
    const empty = buildFormNode({ fields: [] });
    const untitled = buildFormNode({
      fields: [{ id: 'f1', title: '', type: 'text' }],
    });
    const duplicated = buildFormNode({
      fields: [
        { id: 'f1', title: 'Same', type: 'text' },
        { id: 'f2', title: 'Same', type: 'text' },
      ],
    });
    const selectWithoutOptions = buildFormNode({
      fields: [{ id: 'f1', title: 'Pick', type: 'select', options: [] }],
    });
    const sliderWithoutBounds = buildFormNode({
      fields: [{ id: 'f1', title: 'Size', type: 'slider' }],
    });
    const invertedRange = buildFormNode({
      fields: [{ id: 'f1', title: 'Size', type: 'slider', min: 10, max: 0 }],
    });

    expect(codesOf(buildGraph({ nodes: [empty] }))).toContain('form-missing-fields');
    const untitledIssues = validateRunGraph(buildGraph({ nodes: [untitled] }));
    expect(untitledIssues.map((issue) => issue.code)).toContain('form-field-missing-title');
    const duplicatedIssues = validateRunGraph(buildGraph({ nodes: [duplicated] }));
    expect(duplicatedIssues.find((issue) => issue.code === 'form-field-duplicate-title')?.fieldTitle).toBe('Same');
    expect(codesOf(buildGraph({ nodes: [selectWithoutOptions] }))).toContain('form-field-select-options');
    expect(codesOf(buildGraph({ nodes: [sliderWithoutBounds] }))).toContain('form-field-slider-bounds');
    expect(codesOf(buildGraph({ nodes: [invertedRange] }))).toContain('form-field-range');
  });

  test('invalid edge ports into and out of forms are errors', () => {
    const form = buildFormNode();
    const a = buildNode();

    const badSource = buildGraph({
      nodes: [form, a],
      edges: [{ id: 'e1', source: form.id, sourceInstanceId: 'ghost', target: a.id }],
    });
    expect(codesOf(badSource)).toContain('edge-source-port-invalid');

    const badTarget = buildGraph({
      nodes: [form, a],
      edges: [{ id: 'e1', source: a.id, sourceInstanceId: a.instances[0].id, target: form.id }],
    });
    expect(codesOf(badTarget)).toContain('edge-form-target-invalid');

    const badFieldTarget = buildGraph({
      nodes: [form, a],
      edges: [{ id: 'e1', source: a.id, sourceInstanceId: a.instances[0].id, target: form.id, targetFieldId: 'ghost' }],
    });
    expect(codesOf(badFieldTarget)).toContain('edge-form-target-invalid');
  });

  test('an unconnected form produces a warning', () => {
    const form = buildFormNode();
    const a = buildNode();
    const issues = validateRunGraph(buildGraph({ nodes: [form, a] }));
    expect(issues.find((issue) => issue.code === 'form-unused')?.severity).toBe('warning');
  });

  test('a graph with only forms still reports the empty-graph error', () => {
    const form = buildFormNode();
    const codes = codesOf(buildGraph({ nodes: [form] }));
    expect(codes).toContain('empty-graph');
    expect(codes).toContain('form-unused');
  });

  test('run node input names are validated', () => {
    const missing = buildNode({
      inputs: [{ id: 'in_1', name: '' }],
    });
    expect(codesOf(buildGraph({ nodes: [missing] }))).toContain('input-missing-name');

    const duplicated = buildNode({
      inputs: [
        { id: 'in_1', name: 'topic' },
        { id: 'in_2', name: 'topic' },
      ],
    });
    const dupIssues = validateRunGraph(buildGraph({ nodes: [duplicated] }));
    const dup = dupIssues.find((issue) => issue.code === 'input-duplicate-name');
    expect(dup?.inputName).toBe('topic');

    const invalid = buildNode({
      inputs: [{ id: 'in_1', name: 'my topic' }],
    });
    const invalidIssues = validateRunGraph(buildGraph({ nodes: [invalid] }));
    const invalidIssue = invalidIssues.find((issue) => issue.code === 'input-invalid-name');
    expect(invalidIssue?.inputName).toBe('my topic');
  });

  test('connections into a run node must point at a declared input', () => {
    const a = buildNode();
    const b = buildNode({
      inputs: [{ id: 'b_other', name: 'value' }],
      promptTemplate: '{{value}}',
    });
    const graph = buildGraph({
      nodes: [a, b],
      edges: [{ id: 'e1', source: a.id, sourceInstanceId: a.instances[0].id, target: b.id }],
    });
    expect(codesOf(graph)).toContain('edge-input-target-invalid');

    const ghostTarget = buildGraph({
      nodes: [a, b],
      edges: [{ id: 'e1', source: a.id, sourceInstanceId: a.instances[0].id, target: b.id, targetInputId: 'ghost' }],
    });
    expect(codesOf(ghostTarget)).toContain('edge-input-target-invalid');

    const fieldIdOnRunTarget = buildGraph({
      nodes: [a, b],
      edges: [{ id: 'e1', source: a.id, sourceInstanceId: a.instances[0].id, target: b.id, targetFieldId: 'b_other' }],
    });
    expect(codesOf(fieldIdOnRunTarget)).toContain('edge-input-target-invalid');
  });

  test('multiple connections into one input are valid and indexed by order', () => {
    const a = buildNode({ title: 'A' });
    const b = buildNode({ title: 'B' });
    const c = buildNode({
      title: 'C',
      inputs: [{ id: 'c_in', name: 'values' }],
      promptTemplate: '{{values[0]}} / {{values[1]}}',
    });
    const graph = buildGraph({
      nodes: [a, b, c],
      edges: [
        { id: 'e1', source: a.id, sourceInstanceId: a.instances[0].id, target: c.id, targetInputId: 'c_in' },
        { id: 'e2', source: b.id, sourceInstanceId: b.instances[0].id, target: c.id, targetInputId: 'c_in' },
      ],
    });
    expect(validateRunGraph(graph)).toEqual([]);
  });
});
