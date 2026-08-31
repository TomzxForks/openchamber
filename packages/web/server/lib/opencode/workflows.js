import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'yaml';

export const WORKFLOW_SCOPE = {
  PROJECT: 'project',
  USER: 'user',
};

const WORKFLOW_DIR_NAME = path.join('.agents', 'workflows');
const WORKFLOW_FILE_EXTENSIONS = ['.yaml', '.yml'];
const MAX_WORKFLOW_FILE_BYTES = 512 * 1024;
const MAX_WORKFLOW_FILES = 200;
const WORKFLOW_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
const WORKFLOW_NAME_MAX_LENGTH = 64;

function getUserWorkflowsDir(homeDir = os.homedir()) {
  return path.join(homeDir, WORKFLOW_DIR_NAME);
}

function getProjectWorkflowsDir(workingDirectory) {
  return path.join(workingDirectory, WORKFLOW_DIR_NAME);
}

function getWorkflowsDir(scope, workingDirectory, homeDir) {
  return scope === WORKFLOW_SCOPE.PROJECT
    ? getProjectWorkflowsDir(workingDirectory)
    : getUserWorkflowsDir(homeDir);
}

function isValidWorkflowName(name) {
  return typeof name === 'string'
    && name.length > 0
    && name.length <= WORKFLOW_NAME_MAX_LENGTH
    && WORKFLOW_NAME_PATTERN.test(name);
}

function assertValidWorkflowName(name) {
  if (!isValidWorkflowName(name)) {
    throw new Error(`Invalid workflow name "${name}". Must be 1-64 lowercase alphanumeric characters with hyphens, cannot start or end with hyphen.`);
  }
}

function parseWorkflowFile(filePath) {
  let raw = null;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  if (!raw || raw.length > MAX_WORKFLOW_FILE_BYTES) {
    return null;
  }
  try {
    const parsed = yaml.parse(raw);
    // A workflow file must hold a mapping; lists and scalars are not graphs.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function listWorkflowFiles(dir) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!WORKFLOW_FILE_EXTENSIONS.includes(extension)) continue;
    const name = path.basename(entry.name, extension);
    if (!isValidWorkflowName(name)) continue;
    names.push({ name, extension });
    if (names.length >= MAX_WORKFLOW_FILES) break;
  }
  return names;
}

/**
 * Discover workflow graph files from the project `.agents/workflows` directory
 * and the user `~/.agents/workflows` directory. Project files win over user
 * files with the same name. Files that fail to parse or hold no YAML mapping
 * are skipped so one bad file cannot hide the others.
 */
function discoverWorkflows(workingDirectory, { homeDir = os.homedir() } = {}) {
  const discovered = new Map();

  const scan = (dir, scope) => {
    for (const { name, extension } of listWorkflowFiles(dir)) {
      if (discovered.has(name)) continue;
      const filePath = path.join(dir, `${name}${extension}`);
      const graph = parseWorkflowFile(filePath);
      if (!graph) continue;
      discovered.set(name, {
        name,
        scope,
        graph,
      });
    }
  };

  // Requests without a project (no directory, no active project) still list
  // the user scope, so the project scan is conditional on a real directory.
  if (typeof workingDirectory === 'string' && workingDirectory.trim()) {
    scan(getProjectWorkflowsDir(workingDirectory), WORKFLOW_SCOPE.PROJECT);
  }
  scan(getUserWorkflowsDir(homeDir), WORKFLOW_SCOPE.USER);

  return Array.from(discovered.values());
}

function resolveWorkflowScope(scope, workingDirectory) {
  if (scope === WORKFLOW_SCOPE.PROJECT) {
    if (!workingDirectory) {
      throw new Error('Project workflows require a directory');
    }
    return WORKFLOW_SCOPE.PROJECT;
  }
  return WORKFLOW_SCOPE.USER;
}

function writeWorkflowFile(dir, name, graph) {
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${name}.yaml`);
  fs.writeFileSync(filePath, yaml.stringify(graph), 'utf8');
  return filePath;
}

function workflowFilePath(dir, name) {
  for (const extension of WORKFLOW_FILE_EXTENSIONS) {
    const filePath = path.join(dir, `${name}${extension}`);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

/**
 * Write a graph as `<name>.yaml` in the requested scope directory. When
 * `previousName` names a different existing file of the same scope, it is
 * removed after a successful write so renames do not leave the old file
 * behind. Saving without `previousName` refuses to overwrite an existing
 * file, so a new graph cannot silently replace a file it never loaded.
 */
function saveWorkflow(name, graph, { workingDirectory = null, scope = WORKFLOW_SCOPE.PROJECT, previousName = null, homeDir = os.homedir() } = {}) {
  assertValidWorkflowName(name);
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    throw new Error('Workflow content must be an object');
  }

  const resolvedScope = resolveWorkflowScope(scope, workingDirectory);
  const dir = getWorkflowsDir(resolvedScope, workingDirectory, homeDir);
  const targetPath = path.join(dir, `${name}.yaml`);
  if (name !== previousName && fs.existsSync(targetPath)) {
    const error = new Error(`Workflow ${name} already exists at ${targetPath}`);
    error.code = 'WORKFLOW_EXISTS';
    throw error;
  }

  const previousNameValid = isValidWorkflowName(previousName) && previousName !== name;
  const previousPath = previousNameValid
    ? workflowFilePath(dir, previousName)
    : null;

  const writtenPath = writeWorkflowFile(dir, name, graph);
  if (previousPath) {
    try {
      fs.rmSync(previousPath, { force: true });
    } catch (error) {
      console.error(`Failed to remove previous workflow file ${previousPath}:`, error);
    }
  }

  console.log(`Saved workflow: ${name} (scope: ${resolvedScope}, path: ${writtenPath})`);
  return { scope: resolvedScope, path: writtenPath };
}

/**
 * Delete `<name>.yaml` (either extension tolerated) from the requested scope
 * directory. Throws when no file matches so stale client state surfaces
 * instead of reporting success.
 */
function deleteWorkflow(name, { workingDirectory = null, scope = WORKFLOW_SCOPE.PROJECT, homeDir = os.homedir() } = {}) {
  assertValidWorkflowName(name);

  const resolvedScope = resolveWorkflowScope(scope, workingDirectory);
  const dir = getWorkflowsDir(resolvedScope, workingDirectory, homeDir);
  const filePath = workflowFilePath(dir, name);
  if (!filePath) {
    const error = new Error(`Workflow "${name}" not found`);
    error.code = 'WORKFLOW_NOT_FOUND';
    throw error;
  }
  fs.rmSync(filePath, { force: true });
  console.log(`Deleted workflow: ${name} (scope: ${resolvedScope}, path: ${filePath})`);
}

export {
  discoverWorkflows,
  saveWorkflow,
  deleteWorkflow,
};
