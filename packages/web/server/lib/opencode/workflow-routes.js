const isWorkflowExistsError = (error) => error?.code === 'WORKFLOW_EXISTS';

export const registerWorkflowRoutes = (app, dependencies) => {
  const {
    os,
    resolveOptionalProjectDirectory,
    resolveProjectDirectory,
    discoverWorkflows,
    saveWorkflow,
    deleteWorkflow,
    WORKFLOW_SCOPE,
  } = dependencies;

  const resolveScope = (value) => (value === WORKFLOW_SCOPE.USER ? WORKFLOW_SCOPE.USER : WORKFLOW_SCOPE.PROJECT);

  /**
   * Resolve the active project directory for project-scoped operations. The
   * client passes the project path via `?directory=`/header; without one the
   * server falls back to the active project (project scope) or succeeds without
   * a directory (user scope).
   */
  const resolveDirectoryForScope = async (req, scope) => {
    if (scope === WORKFLOW_SCOPE.PROJECT) {
      return resolveProjectDirectory(req);
    }
    return resolveOptionalProjectDirectory(req);
  };

  app.get('/api/config/workflows', async (req, res) => {
    try {
      const { directory, error } = await resolveOptionalProjectDirectory(req);
      if (error) {
        return res.status(400).json({ error });
      }
      const workflows = discoverWorkflows(directory, { homeDir: os.homedir() });
      res.json({ workflows });
    } catch (error) {
      console.error('Failed to list workflows:', error);
      res.status(500).json({ error: 'Failed to list workflows' });
    }
  });

  app.put('/api/config/workflows/:name', async (req, res) => {
    try {
      const name = req.params.name;
      const body = req.body || {};
      const scope = resolveScope(body.scope);
      const { directory, error } = await resolveDirectoryForScope(req, scope);
      if (error) {
        return res.status(400).json({ error });
      }
      if (scope === WORKFLOW_SCOPE.PROJECT && !directory) {
        return res.status(400).json({ error: 'Project workflows require a directory' });
      }

      try {
        saveWorkflow(name, body.graph, {
          workingDirectory: directory,
          scope,
          previousName: typeof body.previousName === 'string' ? body.previousName : null,
          homeDir: os.homedir(),
        });
      } catch (saveError) {
        if (isWorkflowExistsError(saveError)) {
          return res.status(409).json({ error: saveError.message });
        }
        throw saveError;
      }
      res.json({ ok: true, scope });
    } catch (error) {
      console.error('Failed to save workflow:', error);
      res.status(400).json({ error: error.message || 'Failed to save workflow' });
    }
  });

  app.delete('/api/config/workflows/:name', async (req, res) => {
    try {
      const name = req.params.name;
      const scope = resolveScope(req.query.scope);
      const { directory, error } = await resolveDirectoryForScope(req, scope);
      if (error) {
        return res.status(400).json({ error });
      }
      if (scope === WORKFLOW_SCOPE.PROJECT && !directory) {
        return res.status(400).json({ error: 'Project workflows require a directory' });
      }

      try {
        deleteWorkflow(name, { workingDirectory: directory, scope, homeDir: os.homedir() });
      } catch (deleteError) {
        if (deleteError?.code === 'WORKFLOW_NOT_FOUND') {
          return res.status(404).json({ error: deleteError.message });
        }
        throw deleteError;
      }
      res.json({ ok: true, scope });
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      res.status(400).json({ error: error.message || 'Failed to delete workflow' });
    }
  });
};
