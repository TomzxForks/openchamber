import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'yaml';
import { registerWorkflowRoutes } from './workflow-routes.js';
import { WORKFLOW_SCOPE, deleteWorkflow, discoverWorkflows, saveWorkflow } from './workflows.js';

const createTempDir = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

const createFakeOs = (homeDir) => ({ homedir: () => homeDir });

const queryDirectory = (req) => {
  const requested = Array.isArray(req.query?.directory) ? req.query.directory[0] : req.query?.directory;
  return requested ? path.resolve(String(requested)) : null;
};

const startWorkflowsApp = ({ projectRoot, homeDir }) => {
  const app = express();
  app.use(express.json());

  registerWorkflowRoutes(app, {
    os: createFakeOs(homeDir),
    resolveProjectDirectory: async (req) => {
      const directory = queryDirectory(req);
      if (!directory) {
        return { directory: null, error: 'Directory parameter or active project is required' };
      }
      return { directory, error: null };
    },
    resolveOptionalProjectDirectory: async (req) => ({ directory: queryDirectory(req), error: null }),
    discoverWorkflows,
    saveWorkflow,
    deleteWorkflow,
    WORKFLOW_SCOPE,
  });

  const server = app.listen(0);
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
};

describe('workflow-routes', () => {
  let projectRoot = null;
  let homeDir = null;
  let appHandle = null;

  const startApp = () => {
    appHandle = startWorkflowsApp({ projectRoot, homeDir });
    return appHandle.baseUrl;
  };

  afterEach(async () => {
    if (appHandle) {
      await appHandle.close();
      appHandle = null;
    }
    for (const dir of [projectRoot, homeDir]) {
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    projectRoot = null;
    homeDir = null;
  });

  it('lists project and user workflows with graphs and project precedence', async () => {
    projectRoot = createTempDir('oc-wf-project-');
    homeDir = createTempDir('oc-wf-home-');
    const baseUrl = startApp();

    const projectDir = path.join(projectRoot, '.agents', 'workflows');
    const userDir = path.join(homeDir, '.agents', 'workflows');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(userDir, { recursive: true });

    const shared = { id: 'graph-project-copy', name: 'Shared', nodes: [], worktrees: [], edges: [] };
    const userOnly = { id: 'graph-user-only', name: 'User only', nodes: [], worktrees: [], edges: [] };
    fs.writeFileSync(path.join(projectDir, 'shared.yaml'), yaml.stringify(shared));
    fs.writeFileSync(path.join(userDir, 'shared.yml'), yaml.stringify({ ...shared, id: 'graph-user-copy' }));
    fs.writeFileSync(path.join(userDir, 'user-only.yaml'), yaml.stringify(userOnly));

    const response = await fetch(`${baseUrl}/api/config/workflows?directory=${encodeURIComponent(projectRoot)}`);
    expect(response.status).toBe(200);
    const payload = await response.json();

    const byName = new Map(payload.workflows.map((entry) => [entry.name, entry]));
    expect(payload.workflows).toHaveLength(2);
    expect(byName.get('shared')).toMatchObject({ scope: 'project', graph: shared });
    expect(byName.get('user-only')).toMatchObject({ scope: 'user', graph: userOnly });
  });

  it('skips malformed and non-mapping workflow files', async () => {
    projectRoot = createTempDir('oc-wf-project-');
    homeDir = createTempDir('oc-wf-home-');
    const baseUrl = startApp();

    const projectDir = path.join(projectRoot, '.agents', 'workflows');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'broken.yaml'), 'nodes: [unclosed');
    fs.writeFileSync(path.join(projectDir, 'list.yaml'), '- just\n- a list\n');
    fs.writeFileSync(path.join(projectDir, 'readme.txt'), 'ignored');
    fs.writeFileSync(path.join(projectDir, 'valid.yaml'), yaml.stringify({ id: 'graph-ok', name: 'Ok' }));

    const response = await fetch(`${baseUrl}/api/config/workflows?directory=${encodeURIComponent(projectRoot)}`);
    const payload = await response.json();
    expect(payload.workflows).toHaveLength(1);
    expect(payload.workflows[0]).toMatchObject({ name: 'valid', scope: 'project' });
  });

  it('lists user workflows without a project directory', async () => {
    projectRoot = createTempDir('oc-wf-project-');
    homeDir = createTempDir('oc-wf-home-');
    const baseUrl = startApp();

    const userDir = path.join(homeDir, '.agents', 'workflows');
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(path.join(userDir, 'home-graph.yaml'), yaml.stringify({ id: 'graph-home', name: 'Home' }));

    const response = await fetch(`${baseUrl}/api/config/workflows`);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.workflows).toHaveLength(1);
    expect(payload.workflows[0]).toMatchObject({ name: 'home-graph', scope: 'user', graph: { id: 'graph-home' } });
  });

  it('creates project workflow files via PUT', async () => {
    projectRoot = createTempDir('oc-wf-project-');
    homeDir = createTempDir('oc-wf-home-');
    const baseUrl = startApp();

    const graph = { id: 'graph-1', name: 'My graph', nodes: [], worktrees: [], edges: [] };
    const response = await fetch(`${baseUrl}/api/config/workflows/my-graph?directory=${encodeURIComponent(projectRoot)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'project', graph }),
    });
    expect(response.status).toBe(200);

    const filePath = path.join(projectRoot, '.agents', 'workflows', 'my-graph.yaml');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(yaml.parse(fs.readFileSync(filePath, 'utf8'))).toEqual(graph);
  });

  it('refuses to overwrite an existing workflow without previousName', async () => {
    projectRoot = createTempDir('oc-wf-project-');
    homeDir = createTempDir('oc-wf-home-');
    const baseUrl = startApp();

    const graph = { id: 'graph-1', name: 'Existing', nodes: [], worktrees: [], edges: [] };
    const createResponse = await fetch(`${baseUrl}/api/config/workflows/existing?directory=${encodeURIComponent(projectRoot)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'project', graph }),
    });
    expect(createResponse.status).toBe(200);

    const overwriteResponse = await fetch(`${baseUrl}/api/config/workflows/existing?directory=${encodeURIComponent(projectRoot)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'project', graph: { ...graph, name: 'Other' } }),
    });
    expect(overwriteResponse.status).toBe(409);
    const filePath = path.join(projectRoot, '.agents', 'workflows', 'existing.yaml');
    expect(yaml.parse(fs.readFileSync(filePath, 'utf8')).name).toBe('Existing');
  });

  it('overwrites in place when name equals previousName', async () => {
    projectRoot = createTempDir('oc-wf-project-');
    homeDir = createTempDir('oc-wf-home-');
    const baseUrl = startApp();

    const createResponse = await fetch(`${baseUrl}/api/config/workflows/my-graph?directory=${encodeURIComponent(projectRoot)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'project', graph: { id: 'graph-1', name: 'My graph' } }),
    });
    expect(createResponse.status).toBe(200);

    const updateResponse = await fetch(`${baseUrl}/api/config/workflows/my-graph?directory=${encodeURIComponent(projectRoot)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'project', previousName: 'my-graph', graph: { id: 'graph-1', name: 'My graph', nodes: [{ id: 'n1' }] } }),
    });
    expect(updateResponse.status).toBe(200);
    const filePath = path.join(projectRoot, '.agents', 'workflows', 'my-graph.yaml');
    expect(yaml.parse(fs.readFileSync(filePath, 'utf8')).nodes).toEqual([{ id: 'n1' }]);
  });

  it('renames by writing the new file and removing the previous one', async () => {
    projectRoot = createTempDir('oc-wf-project-');
    homeDir = createTempDir('oc-wf-home-');
    const baseUrl = startApp();

    const createResponse = await fetch(`${baseUrl}/api/config/workflows/old-name?directory=${encodeURIComponent(projectRoot)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'project', graph: { id: 'graph-1', name: 'Old name' } }),
    });
    expect(createResponse.status).toBe(200);

    const renameResponse = await fetch(`${baseUrl}/api/config/workflows/new-name?directory=${encodeURIComponent(projectRoot)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'project', previousName: 'old-name', graph: { id: 'graph-1', name: 'New name' } }),
    });
    expect(renameResponse.status).toBe(200);

    const workflowsDir = path.join(projectRoot, '.agents', 'workflows');
    expect(fs.existsSync(path.join(workflowsDir, 'old-name.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(workflowsDir, 'new-name.yaml'))).toBe(true);
  });

  it('rejects renames onto an existing different workflow', async () => {
    projectRoot = createTempDir('oc-wf-project-');
    homeDir = createTempDir('oc-wf-home-');
    const baseUrl = startApp();

    const put = (name, graphId, graphName) => fetch(`${baseUrl}/api/config/workflows/${name}?directory=${encodeURIComponent(projectRoot)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'project', graph: { id: graphId, name: graphName } }),
    });
    const rename = (name, previousName, graph) => fetch(`${baseUrl}/api/config/workflows/${name}?directory=${encodeURIComponent(projectRoot)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'project', previousName, graph }),
    });

    expect((await put('one', 'graph-one', 'One')).status).toBe(200);
    expect((await put('two', 'graph-two', 'Two')).status).toBe(200);
    const conflictResponse = await rename('two', 'one', { id: 'graph-one', name: 'One moved' });
    expect(conflictResponse.status).toBe(409);

    const workflowsDir = path.join(projectRoot, '.agents', 'workflows');
    expect(fs.existsSync(path.join(workflowsDir, 'one.yaml'))).toBe(true);
    expect(yaml.parse(fs.readFileSync(path.join(workflowsDir, 'two.yaml'), 'utf8')).name).toBe('Two');
  });

  it('writes user-scoped workflows to the home directory', async () => {
    projectRoot = createTempDir('oc-wf-project-');
    homeDir = createTempDir('oc-wf-home-');
    const baseUrl = startApp();

    const response = await fetch(`${baseUrl}/api/config/workflows/global-graph`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'user', graph: { id: 'graph-g', name: 'Global' } }),
    });
    expect(response.status).toBe(200);

    const filePath = path.join(homeDir, '.agents', 'workflows', 'global-graph.yaml');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('requires a directory for project-scope saves', async () => {
    projectRoot = createTempDir('oc-wf-project-');
    homeDir = createTempDir('oc-wf-home-');
    const baseUrl = startApp();

    const response = await fetch(`${baseUrl}/api/config/workflows/no-dir`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'project', graph: { id: 'graph-x', name: 'X' } }),
    });
    expect(response.status).toBe(400);
  });

  it('rejects invalid workflow names', async () => {
    projectRoot = createTempDir('oc-wf-project-');
    homeDir = createTempDir('oc-wf-home-');
    const baseUrl = startApp();

    const response = await fetch(`${baseUrl}/api/config/workflows/Bad%20Name?directory=${encodeURIComponent(projectRoot)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'project', graph: { id: 'graph-y', name: 'Y' } }),
    });
    expect(response.status).toBe(400);
  });

  it('deletes workflows and reports missing files', async () => {
    projectRoot = createTempDir('oc-wf-project-');
    homeDir = createTempDir('oc-wf-home-');
    const baseUrl = startApp();

    const filePath = path.join(projectRoot, '.agents', 'workflows', 'doomed.yaml');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, yaml.stringify({ id: 'graph-d', name: 'Doomed' }));

    const deleteResponse = await fetch(`${baseUrl}/api/config/workflows/doomed?scope=project&directory=${encodeURIComponent(projectRoot)}`, {
      method: 'DELETE',
    });
    expect(deleteResponse.status).toBe(200);
    expect(fs.existsSync(filePath)).toBe(false);

    const missingResponse = await fetch(`${baseUrl}/api/config/workflows/doomed?scope=project&directory=${encodeURIComponent(projectRoot)}`, {
      method: 'DELETE',
    });
    expect(missingResponse.status).toBe(404);
  });
});
