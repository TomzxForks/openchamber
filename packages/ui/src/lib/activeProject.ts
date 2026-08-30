import type { ProjectRef } from './worktrees/worktreeManager';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useProjectsStore } from '@/stores/useProjectsStore';

export const resolveActiveProjectRef = (): ProjectRef | null => {
  const projectsState = useProjectsStore.getState();
  const activeProjectId = projectsState.activeProjectId;
  if (!activeProjectId) return null;

  const project = projectsState.projects.find((entry) => entry.id === activeProjectId);
  if (project?.path) return { id: project.id, path: project.path };

  const currentDirectory = useDirectoryStore.getState().currentDirectory ?? null;
  if (currentDirectory && currentDirectory.trim().length > 0) {
    const normalized = currentDirectory.replace(/\\/g, '/').replace(/\/+$/, '') || currentDirectory;
    return { id: `path:${normalized}`, path: normalized };
  }

  return null;
};
