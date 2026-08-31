import type { RunGraphDefinition, RunGraphScope } from '@/types/runGraph';
import { runtimeFetch } from '../runtime-fetch';
import {
  sanitizeRunGraphFileEntries,
  type RunGraphFileEntryInput,
  type SanitizedRunGraphFiles,
} from './sanitize';

interface WorkflowEntryPayload {
  name?: string;
  scope?: string;
  graph?: RunGraphDefinition;
}

interface WorkflowListPayload {
  workflows?: WorkflowEntryPayload[];
}

const directoryQuery = (directory: string | null): string =>
  directory ? `?directory=${encodeURIComponent(directory)}` : '';

const withDirectoryHeader = (directory: string | null): Record<string, string> | undefined =>
  directory ? { 'x-opencode-directory': directory } : undefined;

/**
 * Load every graph stored as YAML under `<project>/.agents/workflows` and
 * `~/.agents/workflows`. Throws on failure: an authoritative listing error
 * must not clear the previously loaded graphs.
 */
export const fetchWorkflowFiles = async (directory: string | null): Promise<SanitizedRunGraphFiles> => {
  const response = await runtimeFetch(`/api/config/workflows${directoryQuery(directory)}`, {
    cache: 'no-store',
    headers: withDirectoryHeader(directory),
  });
  if (!response.ok) {
    throw new Error(`Failed to list workflows: ${response.status}`);
  }
  // An HTML answer means the running server predates the workflows routes
  // (SPA fallback); surface that instead of a JSON parse error.
  const data: WorkflowListPayload | null = await response.json().catch(() => null);
  if (!data || !Array.isArray(data.workflows)) {
    throw new Error('Workflows are not available: restart the OpenChamber server to load the workflows API');
  }

  return sanitizeRunGraphFileEntries(
    (data.workflows ?? [])
      .map((entry): RunGraphFileEntryInput => ({
        fileName: entry.name ?? '',
        scope: entry.scope === 'user' ? 'user' : 'project',
        graph: entry.graph,
      })),
  );
};

interface SaveWorkflowFileParams {
  /** File name stem to write (the graph name slug). */
  name: string;
  scope: RunGraphScope;
  /** Active project path; required for project scope. */
  directory: string | null;
  graph: RunGraphDefinition;
  /**
   * File name stem this graph was loaded from, when updating an existing
   * workflow. Omit for new files: the server then refuses to overwrite an
   * existing file. When saving under a different name, the previous file is
   * removed after a successful write.
   */
  previousName?: string | null;
}

interface SaveWorkflowPayload {
  scope: RunGraphScope;
  graph: RunGraphDefinition;
  previousName?: string;
}

export const saveWorkflowFile = async (params: SaveWorkflowFileParams): Promise<void> => {
  const { name, scope, directory, graph, previousName } = params;
  const payload: SaveWorkflowPayload = { scope, graph };
  if (previousName) {
    payload.previousName = previousName;
  }
  const response = await runtimeFetch(`/api/config/workflows/${encodeURIComponent(name)}${directoryQuery(directory)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...withDirectoryHeader(directory),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail: { error?: string } | null = await response.json().catch(() => null);
    throw new Error(detail?.error ?? `Failed to save workflow: ${response.status}`);
  }
};

interface DeleteWorkflowFileParams {
  name: string;
  scope: RunGraphScope;
  directory: string | null;
}

export const deleteWorkflowFile = async (params: DeleteWorkflowFileParams): Promise<void> => {
  const { name, scope, directory } = params;
  const scopeQuery = directoryQuery(directory);
  const separator = scopeQuery ? '&' : '?';
  const response = await runtimeFetch(
    `/api/config/workflows/${encodeURIComponent(name)}${scopeQuery}${separator}scope=${scope}`,
    {
      method: 'DELETE',
      headers: withDirectoryHeader(directory),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to delete workflow: ${response.status}`);
  }
};
