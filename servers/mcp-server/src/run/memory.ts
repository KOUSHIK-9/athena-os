import type { ActiveApp } from '@athena-os/core';

export type StepStatus = 'pending' | 'executing' | 'verified' | 'failed';

export interface StepRecord {
  index: number;
  capabilityId: string;
  description: string;
  status: StepStatus;
  error?: string;
  executedAt?: string;
  verifiedAt?: string;
}

export type TaskStatus = 'created' | 'running' | 'recovered' | 'completed' | 'failed';

export interface TaskSnapshot {
  taskId: string;
  goal: string;
  status: TaskStatus;
  steps: StepRecord[];
  currentApp?: string;
  lastScreen?: string;
  lastError?: string;
  recentActions: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Pluggable storage for task memory. The default in-memory implementation
 * keeps state for the lifetime of the process; swap in a disk/DB-backed
 * store to persist across process restarts (long-horizon runs).
 */
export interface TaskMemoryStore {
  load(taskId: string): TaskSnapshot | undefined;
  save(snapshot: TaskSnapshot): void;
  delete(taskId: string): void;
  list(): string[];
}

export class InMemoryTaskMemoryStore implements TaskMemoryStore {
  private readonly tasks = new Map<string, TaskSnapshot>();

  load(taskId: string): TaskSnapshot | undefined {
    return this.tasks.get(taskId);
  }

  save(snapshot: TaskSnapshot): void {
    this.tasks.set(snapshot.taskId, snapshot);
  }

  delete(taskId: string): void {
    this.tasks.delete(taskId);
  }

  list(): string[] {
    return [...this.tasks.keys()];
  }
}

const MAX_RECENT_ACTIONS = 25;

/**
 * Maintains goal-directed state for a long-horizon run: the plan steps and
 * their verified/failed status, the foreground app, the last observed screen,
 * and a rolling log of recent actions. The runner records into this as it
 * executes and verifies, so recovery and later runs can reason about reality
 * instead of assuming the device is in the expected state.
 */
export class TaskMemory {
  constructor(private readonly store: TaskMemoryStore = new InMemoryTaskMemoryStore()) {}

  create(taskId: string, goal: string, stepCount = 0): TaskSnapshot {
    const now = new Date().toISOString();
    const snapshot: TaskSnapshot = {
      taskId,
      goal,
      status: 'created',
      steps: Array.from({ length: stepCount }, (_, index) => ({
        index,
        capabilityId: '',
        description: '',
        status: 'pending' as const,
      })),
      recentActions: [],
      createdAt: now,
      updatedAt: now,
    };
    this.store.save(snapshot);
    return snapshot;
  }

  getSnapshot(taskId: string): TaskSnapshot | undefined {
    return this.store.load(taskId);
  }

  list(): string[] {
    return this.store.list();
  }

  delete(taskId: string): void {
    this.store.delete(taskId);
  }

  private mutate(taskId: string, fn: (snapshot: TaskSnapshot) => void): TaskSnapshot {
    const snapshot = this.store.load(taskId);
    if (!snapshot) {
      throw new Error(`No task memory for taskId "${taskId}"`);
    }
    fn(snapshot);
    snapshot.updatedAt = new Date().toISOString();
    this.store.save(snapshot);
    return snapshot;
  }

  start(taskId: string): TaskSnapshot {
    return this.mutate(taskId, (s) => {
      s.status = 'running';
    });
  }

  markRecovered(taskId: string): TaskSnapshot {
    return this.mutate(taskId, (s) => {
      s.status = 'recovered';
    });
  }

  complete(taskId: string): TaskSnapshot {
    return this.mutate(taskId, (s) => {
      s.status = 'completed';
    });
  }

  fail(taskId: string, error: string): TaskSnapshot {
    return this.mutate(taskId, (s) => {
      s.status = 'failed';
      s.lastError = error;
    });
  }

  recordStep(
    taskId: string,
    index: number,
    capabilityId: string,
    description: string
  ): TaskSnapshot {
    return this.mutate(taskId, (s) => {
      const existing = s.steps[index];
      s.steps[index] = {
        index,
        capabilityId,
        description,
        status: existing?.status ?? 'pending',
        error: existing?.error,
        executedAt: existing?.executedAt,
        verifiedAt: existing?.verifiedAt,
      };
    });
  }

  markExecuting(taskId: string, index: number): TaskSnapshot {
    return this.mutate(taskId, (s) => {
      const step = s.steps[index];
      if (step) {
        step.status = 'executing';
        step.executedAt = new Date().toISOString();
      }
    });
  }

  markVerified(taskId: string, index: number): TaskSnapshot {
    return this.mutate(taskId, (s) => {
      const step = s.steps[index];
      if (step) {
        step.status = 'verified';
        step.verifiedAt = new Date().toISOString();
        step.error = undefined;
      }
    });
  }

  markFailed(taskId: string, index: number, error: string): TaskSnapshot {
    return this.mutate(taskId, (s) => {
      const step = s.steps[index];
      if (step) {
        step.status = 'failed';
        step.error = error;
      }
    });
  }

  updateObservation(taskId: string, app?: ActiveApp, screen?: string): TaskSnapshot {
    return this.mutate(taskId, (s) => {
      if (app?.bundleId) {
        s.currentApp = app.name ? `${app.name} (${app.bundleId})` : app.bundleId;
      }
      if (screen) {
        s.lastScreen = screen;
      }
    });
  }

  pushAction(taskId: string, description: string): TaskSnapshot {
    return this.mutate(taskId, (s) => {
      s.recentActions.push(description);
      if (s.recentActions.length > MAX_RECENT_ACTIONS) {
        s.recentActions.splice(0, s.recentActions.length - MAX_RECENT_ACTIONS);
      }
    });
  }
}
