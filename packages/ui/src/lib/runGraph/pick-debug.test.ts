import { describe, expect, test } from 'bun:test';
import { sanitizeRunSessionIndex } from '@/lib/runGraph/sanitize';
import { pickGraphForSession } from '@/lib/runGraph/editorGraph';

describe('phone reproduction', () => {
  test('the seeded config yields the linked graph', () => {
    const raw = {
      ses_faff9f71fffejrcadWpeMO4B3W: {
        graphId: 'graph_mtf1y0bc_2elu6w5c',
        graphName: 'Untitled graph',
        nodeId: 'node_mtf1ydev_jdojvkft',
        nodeTitle: 'Run 1',
        directory: '/home/tomzx/src/openchamber-src',
        at: 1788048967904,
      },
    };
    const index = sanitizeRunSessionIndex(raw);
    expect(Object.keys(index)).toHaveLength(1);
    const graphs = [
      { id: 'graph_mtf1y0bc_2elu6w5c', name: 'Untitled graph', nodes: [], worktrees: [], edges: [], nodeWorktreeBindings: {}, createdAt: 0, updatedAt: 0 },
    ];
    const picked = pickGraphForSession(graphs as never, index, 'ses_faff9f71fffejrcadWpeMO4B3W');
    expect(picked?.link.nodeId).toBe('node_mtf1ydev_jdojvkft');
  });
});
