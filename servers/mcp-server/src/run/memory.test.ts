import { describe, expect, it } from 'vitest';
import { InMemoryTaskMemoryStore, TaskMemory } from './memory.js';

describe('TaskMemory', () => {
  it('creates a task with the requested number of pending steps', () => {
    const memory = new TaskMemory();
    const snapshot = memory.create('task-1', 'Open Settings and toggle Wi-Fi', 3);

    expect(snapshot.taskId).toBe('task-1');
    expect(snapshot.goal).toBe('Open Settings and toggle Wi-Fi');
    expect(snapshot.status).toBe('created');
    expect(snapshot.steps).toHaveLength(3);
    expect(snapshot.steps.every((s) => s.status === 'pending')).toBe(true);
  });

  it('records steps, marks them verified, and reflects state in the snapshot', () => {
    const memory = new TaskMemory();
    memory.create('task-2', 'Multi-step task', 4);

    memory.recordStep('task-2', 0, 'launchApp', 'Launch Settings');
    memory.recordStep('task-2', 1, 'tap', 'Tap Wi-Fi');
    memory.markVerified('task-2', 0);
    memory.markVerified('task-2', 1);

    const snapshot = memory.getSnapshot('task-2')!;
    expect(snapshot.steps[0]).toMatchObject({
      index: 0,
      capabilityId: 'launchApp',
      status: 'verified',
    });
    expect(snapshot.steps[0].verifiedAt).toBeDefined();
    expect(snapshot.steps[1].status).toBe('verified');
  });

  it('records a failed step without losing the verified earlier steps', () => {
    const memory = new TaskMemory();
    memory.create('task-3', 'Recoverable task', 3);
    memory.recordStep('task-3', 0, 'launchApp', 'Launch');
    memory.recordStep('task-3', 1, 'tap', 'Tap');
    memory.recordStep('task-3', 2, 'tap', 'Tap again');
    memory.markVerified('task-3', 0);
    memory.markVerified('task-3', 1);
    memory.markFailed('task-3', 2, 'element not found');

    const snapshot = memory.getSnapshot('task-3')!;
    expect(snapshot.steps[0].status).toBe('verified');
    expect(snapshot.steps[1].status).toBe('verified');
    expect(snapshot.steps[2].status).toBe('failed');
    expect(snapshot.steps[2].error).toBe('element not found');
  });

  it('tracks the foreground app and last observed screen', () => {
    const memory = new TaskMemory();
    memory.create('task-4', 'Observe task', 1);
    memory.updateObservation(
      'task-4',
      { bundleId: 'com.apple.Maps', name: 'Maps' },
      '{"role":"root"}'
    );

    const snapshot = memory.getSnapshot('task-4')!;
    expect(snapshot.currentApp).toBe('Maps (com.apple.Maps)');
    expect(snapshot.lastScreen).toBe('{"role":"root"}');
  });

  it('keeps a bounded rolling log of recent actions', () => {
    const memory = new TaskMemory();
    memory.create('task-5', 'Action log', 1);
    for (let i = 0; i < 30; i += 1) {
      memory.pushAction('task-5', `action-${i}`);
    }
    const snapshot = memory.getSnapshot('task-5')!;
    expect(snapshot.recentActions).toHaveLength(25);
    expect(snapshot.recentActions[0]).toBe('action-5');
  });

  it('persists across separate read calls (state survives longer runs)', () => {
    const store = new InMemoryTaskMemoryStore();
    const writer = new TaskMemory(store);
    const reader = new TaskMemory(store);

    writer.create('task-6', 'Spanning task', 2);
    writer.markVerified('task-6', 0);

    // A later phase of the run reads the same task from a fresh memory instance.
    const snapshot = reader.getSnapshot('task-6')!;
    expect(snapshot.steps[0].status).toBe('verified');
    expect(snapshot.status).toBe('created');
  });

  it('rolls up lifecycle status (running -> recovered -> completed)', () => {
    const memory = new TaskMemory();
    memory.create('task-7', 'Lifecycle task', 2);
    memory.start('task-7');
    memory.markRecovered('task-7');
    memory.complete('task-7');

    const snapshot = memory.getSnapshot('task-7')!;
    expect(snapshot.status).toBe('completed');
  });

  it('throws when reading an unknown task', () => {
    const memory = new TaskMemory();
    expect(memory.getSnapshot('nope')).toBeUndefined();
    expect(() => memory.markVerified('nope', 0)).toThrow(/No task memory/);
  });
});
