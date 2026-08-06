export interface Timing {
  name: string;
  ms: number;
  budgetMs: number;
  over: boolean;
}

export const BUDGETS: Record<string, number> = {
  doctor: 2000,
  devices: 1000,
  screenshot: 2000,
  launch: 3000,
};

export function measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return fn();
}

export function computeTimings(steps: Array<{ name: string; start: number }>): Timing[] {
  return steps.map((step, i) => {
    const end = i < steps.length - 1 ? steps[i + 1].start : Date.now();
    const ms = end - step.start;
    return {
      name: step.name,
      ms,
      budgetMs: BUDGETS[step.name],
      over: BUDGETS[step.name] !== undefined && ms > BUDGETS[step.name],
    };
  });
}
