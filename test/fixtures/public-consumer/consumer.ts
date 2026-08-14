import { createRuntime } from 'ste-runtime';
import type { GraphNodeRef } from 'ste-runtime';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function run(sourcePath: string): Promise<void> {
  const runtime = createRuntime();
  try {
    const registration = await runtime.createRegistration({
      repositories: [{ source: { kind: 'local', path: sourcePath } }],
    });
    if (!UUID_V7.test(registration.workspaceId)) throw new Error('WorkspaceId is not UUIDv7');
    if (runtime.capabilities().mechanical !== true || runtime.capabilities().federation !== false) {
      throw new Error('Invalid public capability manifest');
    }

    const workspace = await runtime.open(registration);
    const snapshot = await workspace.refresh();
    if (snapshot.workspaceId !== registration.workspaceId || !UUID_V7.test(snapshot.snapshotId)) {
      throw new Error('Snapshot identity did not bind to the registration');
    }
    const start: GraphNodeRef | undefined = snapshot.graph.nodes[0]?.ref;
    if (!start) throw new Error('Packed consumer received no graph node');
    const traversed = snapshot.graph.traverse(start, { maxDepth: 0, maxNodes: 1 });
    if (traversed.length !== 1 || traversed[0]?.snapshotId !== snapshot.snapshotId) {
      throw new Error('Snapshot-bound graph traversal failed');
    }
  } finally {
    await runtime.close();
  }
}
