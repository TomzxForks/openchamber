import type { RunGraphDefinition, RunGraphEdge, RunGraphNode } from '@/types/runGraph';
import { MAX_INSTANCES_PER_NODE, RUN_GRAPH_INPUT_NAME_PATTERN } from '@/types/runGraph';
import { resolveInstancePlacement } from '@/types/runGraph';
import { scanRunTemplate } from './template';

export type RunGraphIssueCode =
  | 'empty-graph'
  | 'duplicate-title'
  | 'node-missing-instances'
  | 'node-too-many-instances'
  | 'instance-missing-model'
  | 'edge-dangling-node'
  | 'edge-dangling-instance'
  | 'edge-duplicate'
  | 'edge-self'
  | 'edge-cycle'
  | 'edge-source-port-invalid'
  | 'edge-input-target-invalid'
  | 'edge-form-target-invalid'
  | 'input-missing-name'
  | 'input-duplicate-name'
  | 'input-invalid-name'
  | 'form-missing-fields'
  | 'form-field-missing-title'
  | 'form-field-duplicate-title'
  | 'form-field-select-options'
  | 'form-field-slider-bounds'
  | 'form-field-range'
  | 'form-unused'
  | 'template-syntax'
  | 'template-no-inputs'
  | 'template-input-range'
  | 'template-unknown-input'
  | 'binding-dangling'
  | 'worktree-missing-path'
  | 'worktree-missing-name'
  | 'worktree-duplicate-title'
  | 'instance-pool-dangling'
  | 'shared-worktree'
  | 'worktree-orphan';

export interface RunGraphValidationIssue {
  severity: 'error' | 'warning';
  code: RunGraphIssueCode;
  message: string;
  count?: number;
  nodeId?: string;
  instanceId?: string;
  edgeId?: string;
  worktreeId?: string;
  fieldTitle?: string;
  inputName?: string;
}

export const hasRunGraphErrors = (issues: RunGraphValidationIssue[]): boolean =>
  issues.some((issue) => issue.severity === 'error');

const findIncomingEdges = (edges: RunGraphEdge[]): Map<string, RunGraphEdge[]> => {
  const incoming = new Map<string, RunGraphEdge[]>();
  for (const edge of edges) {
    const list = incoming.get(edge.target);
    if (list) {
      list.push(edge);
    } else {
      incoming.set(edge.target, [edge]);
    }
  }
  return incoming;
};

const detectCyclicNodeIds = (nodes: RunGraphNode[], edges: RunGraphEdge[]): Set<string> => {
  const acyclicEdges = edges.filter((edge) => edge.source !== edge.target);
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }
  for (const edge of acyclicEdges) {
    if (!inDegree.has(edge.source) || !inDegree.has(edge.target)) continue;
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    adjacency.get(edge.source)?.push(edge.target);
  }

  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) queue.push(nodeId);
  }

  let processed = 0;
  while (queue.length > 0) {
    const nodeId = queue.pop();
    if (nodeId === undefined) break;
    processed += 1;
    for (const nextId of adjacency.get(nodeId) ?? []) {
      const nextDegree = (inDegree.get(nextId) ?? 0) - 1;
      inDegree.set(nextId, nextDegree);
      if (nextDegree === 0) queue.push(nextId);
    }
  }

  const cyclic = new Set<string>();
  if (processed < nodes.length) {
    for (const node of nodes) {
      if ((inDegree.get(node.id) ?? 0) > 0) cyclic.add(node.id);
    }
  }
  return cyclic;
};

export const validateRunGraph = (graph: RunGraphDefinition): RunGraphValidationIssue[] => {
  const issues: RunGraphValidationIssue[] = [];
  const nodes = graph.nodes ?? [];
  const worktrees = graph.worktrees ?? [];
  const edges = graph.edges ?? [];
  const bindings = graph.nodeWorktreeBindings ?? {};

  if (nodes.length === 0 || !nodes.some((node) => node.kind === 'run')) {
    issues.push({
      severity: 'error',
      code: 'empty-graph',
      message: 'The graph needs at least one run node',
    });
  }

  const worktreeIds = new Set(worktrees.map((worktree) => worktree.id));

  const titles = new Map<string, string>();
  for (const node of nodes) {
    const existingId = titles.get(node.title);
    if (existingId !== undefined) {
      issues.push({
        severity: 'error',
        code: 'duplicate-title',
        message: `Node title "${node.title}" is used more than once`,
        nodeId: node.id,
      });
    } else {
      titles.set(node.title, node.id);
    }
  }

  const worktreeTitles = new Map<string, string>();
  for (const worktree of worktrees) {
    const existingId = worktreeTitles.get(worktree.title);
    if (existingId !== undefined) {
      issues.push({
        severity: 'error',
        code: 'worktree-duplicate-title',
        message: `Worktree title "${worktree.title}" is used more than once`,
        worktreeId: worktree.id,
      });
    } else {
      worktreeTitles.set(worktree.title, worktree.id);
    }

    if (worktree.kind === 'existing' && !(worktree.path ?? '').trim()) {
      issues.push({
        severity: 'error',
        code: 'worktree-missing-path',
        message: `Worktree "${worktree.title}" needs a path`,
        worktreeId: worktree.id,
      });
    }
    if (worktree.kind === 'new' && !(worktree.name ?? '').trim()) {
      issues.push({
        severity: 'error',
        code: 'worktree-missing-name',
        message: `Worktree "${worktree.title}" needs a name`,
        worktreeId: worktree.id,
      });
    }
  }

  for (const node of nodes) {
    if (node.kind === 'form') {
      if (node.fields.length === 0) {
        issues.push({
          severity: 'error',
          code: 'form-missing-fields',
          message: `Form "${node.title}" needs at least one field`,
          nodeId: node.id,
        });
      }
      const fieldTitles = new Map<string, string>();
      for (const field of node.fields) {
        if (!field.title.trim()) {
          issues.push({
            severity: 'error',
            code: 'form-field-missing-title',
            message: `Form "${node.title}" has a field without a title`,
            nodeId: node.id,
          });
        } else if (fieldTitles.has(field.title)) {
          issues.push({
            severity: 'error',
            code: 'form-field-duplicate-title',
            message: `Form "${node.title}" uses the field title "${field.title}" more than once`,
            nodeId: node.id,
            fieldTitle: field.title,
          });
        } else {
          fieldTitles.set(field.title, field.id);
        }
        if (field.type === 'select' && (field.options ?? []).every((option) => !option.trim())) {
          issues.push({
            severity: 'error',
            code: 'form-field-select-options',
            message: `Form "${node.title}" has a select field without options`,
            nodeId: node.id,
          });
        }
        if (field.type === 'slider' && (field.min === undefined || field.max === undefined)) {
          issues.push({
            severity: 'error',
            code: 'form-field-slider-bounds',
            message: `Form "${node.title}" has a slider field without a minimum and maximum value`,
            nodeId: node.id,
          });
        }
        if (
          field.type === 'slider' || field.type === 'number'
        ) {
          if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
            issues.push({
              severity: 'error',
              code: 'form-field-range',
              message: `Form "${node.title}" has a field whose minimum exceeds its maximum`,
              nodeId: node.id,
            });
          }
        }
      }
      const hasOutgoing = edges.some((edge) => edge.source === node.id);
      if (!hasOutgoing && node.fields.length > 0) {
        issues.push({
          severity: 'warning',
          code: 'form-unused',
          message: `Form "${node.title}" is not connected to any run and will not be shown`,
          nodeId: node.id,
        });
      }
      continue;
    }

    if (node.instances.length === 0) {
      issues.push({
        severity: 'error',
        code: 'node-missing-instances',
        message: `Node "${node.title}" needs at least one model`,
        nodeId: node.id,
      });
    }
    if (node.instances.length > MAX_INSTANCES_PER_NODE) {
      issues.push({
        severity: 'error',
        code: 'node-too-many-instances',
        message: `Node "${node.title}" exceeds the maximum of ${MAX_INSTANCES_PER_NODE} models`,
        nodeId: node.id,
      });
    }
    for (const instance of node.instances) {
      if (!instance.providerID.trim() || !instance.modelID.trim()) {
        issues.push({
          severity: 'error',
          code: 'instance-missing-model',
          message: `Node "${node.title}" has a model entry without provider/model`,
          nodeId: node.id,
          instanceId: instance.id,
        });
      }
      const override = instance.worktree;
      if (override?.mode === 'pool' && !worktreeIds.has(override.worktreeId)) {
        issues.push({
          severity: 'error',
          code: 'instance-pool-dangling',
          message: `Node "${node.title}" references a missing worktree`,
          nodeId: node.id,
          instanceId: instance.id,
        });
      }
    }

    const inputNames = new Map<string, string>();
    for (const input of node.inputs) {
      if (!input.name.trim()) {
        issues.push({
          severity: 'error',
          code: 'input-missing-name',
          message: `Node "${node.title}" has an input without a name`,
          nodeId: node.id,
        });
        continue;
      }
      if (!RUN_GRAPH_INPUT_NAME_PATTERN.test(input.name)) {
        issues.push({
          severity: 'error',
          code: 'input-invalid-name',
          message: `Node "${node.title}" has an invalid input name "${input.name}"`,
          nodeId: node.id,
          inputName: input.name,
        });
      }
      if (inputNames.has(input.name)) {
        issues.push({
          severity: 'error',
          code: 'input-duplicate-name',
          message: `Node "${node.title}" uses the input name "${input.name}" more than once`,
          nodeId: node.id,
          inputName: input.name,
        });
      } else {
        inputNames.set(input.name, input.id);
      }
    }
  }

  const seenEdges = new Set<string>();
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const instanceIdsByNode = new Map<string, Set<string>>();
  const fieldIdsByNode = new Map<string, Set<string>>();
  const inputIdsByNode = new Map<string, Set<string>>();
  for (const node of nodes) {
    if (node.kind === 'run') {
      instanceIdsByNode.set(node.id, new Set(node.instances.map((instance) => instance.id)));
      inputIdsByNode.set(node.id, new Set(node.inputs.map((input) => input.id)));
    } else {
      fieldIdsByNode.set(node.id, new Set(node.fields.map((field) => field.id)));
    }
  }

  for (const edge of edges) {
    if (edge.source === edge.target) {
      issues.push({
        severity: 'error',
        code: 'edge-self',
        message: 'A node cannot be its own input',
        edgeId: edge.id,
        nodeId: edge.source,
      });
    }
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    if (!sourceNode || !targetNode) {
      issues.push({
        severity: 'error',
        code: 'edge-dangling-node',
        message: 'An edge references a missing node',
        edgeId: edge.id,
      });
      continue;
    }

    let sourcePortValid: boolean;
    if (sourceNode.kind === 'run') {
      sourcePortValid =
        !edge.sourceFieldId &&
        !!edge.sourceInstanceId &&
        (instanceIdsByNode.get(edge.source)?.has(edge.sourceInstanceId) ?? false);
    } else {
      sourcePortValid =
        !edge.sourceInstanceId &&
        !!edge.sourceFieldId &&
        (fieldIdsByNode.get(edge.source)?.has(edge.sourceFieldId) ?? false);
    }
    if (!sourcePortValid) {
      issues.push({
        severity: 'error',
        code: 'edge-source-port-invalid',
        message: `A connection from "${sourceNode.title}" does not point at an existing output`,
        edgeId: edge.id,
        nodeId: edge.source,
      });
    }

    if (targetNode.kind === 'run') {
      const targetValid =
        !edge.targetFieldId &&
        !!edge.targetInputId &&
        (inputIdsByNode.get(edge.target)?.has(edge.targetInputId) ?? false);
      if (!targetValid) {
        issues.push({
          severity: 'error',
          code: 'edge-input-target-invalid',
          message: `A connection into "${targetNode.title}" does not point at an existing input`,
          edgeId: edge.id,
          nodeId: edge.target,
        });
      }
    } else {
      const targetValid =
        !edge.targetInputId &&
        !!edge.targetFieldId &&
        (fieldIdsByNode.get(edge.target)?.has(edge.targetFieldId) ?? false);
      if (!targetValid) {
        issues.push({
          severity: 'error',
          code: 'edge-form-target-invalid',
          message: `A connection into "${targetNode.title}" does not point at an existing form field`,
          edgeId: edge.id,
          nodeId: edge.target,
        });
      }
    }

    const edgeKey = `${edge.source}|${edge.sourceInstanceId ?? ''}|${edge.sourceFieldId ?? ''}|${edge.target}|${edge.targetInputId ?? ''}|${edge.targetFieldId ?? ''}`;
    if (seenEdges.has(edgeKey)) {
      issues.push({
        severity: 'error',
        code: 'edge-duplicate',
        message: 'A duplicate connection exists between the same output and node',
        edgeId: edge.id,
      });
    }
    seenEdges.add(edgeKey);
  }

  const cyclicNodeIds = detectCyclicNodeIds(nodes, edges);
  for (const nodeId of cyclicNodeIds) {
    const node = nodes.find((entry) => entry.id === nodeId);
    issues.push({
      severity: 'error',
      code: 'edge-cycle',
      message: `"${node?.title ?? nodeId}" is part of a dependency cycle`,
      nodeId,
    });
  }

  const incomingEdges = findIncomingEdges(edges);
  for (const node of nodes) {
    if (node.kind !== 'run') continue;
    const scan = scanRunTemplate(node.promptTemplate ?? '');
    const incoming = incomingEdges.get(node.id) ?? [];
    const inputsByName = new Map(node.inputs.map((input) => [input.name, input.id]));

    for (const error of scan.errors) {
      issues.push({
        severity: 'error',
        code: 'template-syntax',
        message: `Node "${node.title}": ${error.message}`,
        nodeId: node.id,
      });
    }
    for (const placeholder of scan.placeholders) {
      const inputId = inputsByName.get(placeholder.name);
      if (inputId === undefined) {
        issues.push({
          severity: 'error',
          code: 'template-unknown-input',
          message: `Node "${node.title}" references "${placeholder.name}" but has no input with that name`,
          nodeId: node.id,
          inputName: placeholder.name,
        });
        continue;
      }
      const connectedCount = incoming.filter((edge) => edge.targetInputId === inputId).length;
      if (connectedCount === 0) {
        issues.push({
          severity: 'error',
          code: 'template-no-inputs',
          message: `Node "${node.title}" references "${placeholder.name}" but nothing is connected to it`,
          nodeId: node.id,
          inputName: placeholder.name,
        });
        continue;
      }
      if (placeholder.kind === 'index' && placeholder.index >= connectedCount) {
        issues.push({
          severity: 'error',
          code: 'template-input-range',
          message: `Node "${node.title}" references "${placeholder.name}[${placeholder.index}]" but the input has only ${connectedCount} value(s)`,
          nodeId: node.id,
          inputName: placeholder.name,
        });
      }
    }
  }

  for (const [boundNodeId, worktreeId] of Object.entries(bindings)) {
    if (!worktreeIds.has(worktreeId)) {
      issues.push({
        severity: 'error',
        code: 'binding-dangling',
        message: 'A node references a missing worktree',
        nodeId: boundNodeId,
      });
    }
  }

  const usageByWorktree = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.kind !== 'run') continue;
    for (const instance of node.instances) {
      const placement = resolveInstancePlacement(instance, node.id, bindings);
      if (placement.mode === 'pool') {
        const users = usageByWorktree.get(placement.worktreeId);
        if (users) {
          users.push(`${node.title}`);
        } else {
          usageByWorktree.set(placement.worktreeId, [`${node.title}`]);
        }
      }
    }
  }
  for (const [worktreeId, users] of usageByWorktree) {
    if (users.length > 1) {
      issues.push({
        severity: 'warning',
        code: 'shared-worktree',
        message: `${users.length} runs share worktree "${worktreeTitles.get(worktreeId) ?? worktreeId}" and will execute concurrently`,
        count: users.length,
        worktreeId,
      });
    }
  }

  const referencedWorktreeIds = new Set<string>(Object.values(bindings));
  for (const node of nodes) {
    if (node.kind !== 'run') continue;
    for (const instance of node.instances) {
      if (instance.worktree?.mode === 'pool') {
        referencedWorktreeIds.add(instance.worktree.worktreeId);
      }
    }
  }
  for (const worktree of worktrees) {
    if (!referencedWorktreeIds.has(worktree.id)) {
      issues.push({
        severity: 'warning',
        code: 'worktree-orphan',
        message: `Worktree "${worktree.title}" is not used by any run`,
        worktreeId: worktree.id,
      });
    }
  }

  return issues;
};
