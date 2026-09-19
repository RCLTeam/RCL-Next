import { type TaskContext, test as vTest } from 'vitest';

export interface NodeTestContext extends TaskContext {
  after: (cb: () => void | Promise<void>) => void;
  test: (name: string, fn: () => unknown | Promise<unknown>) => Promise<unknown>;
}

export type NodeTestFn = (t: NodeTestContext) => unknown | Promise<unknown>;

export function test(name: string, fn?: NodeTestFn) {
  if (!fn) return;
  return vTest(name, async (ctx) => {
    const afterCallbacks: Array<() => void | Promise<void>> = [];
    const t: NodeTestContext = {
      ...ctx,
      after: (cb: () => void | Promise<void>) => {
        afterCallbacks.push(cb);
      },
      test: async (_subName: string, subFn: () => unknown | Promise<unknown>) => {
        return await subFn();
      }
    };
    try {
      return await fn(t);
    } finally {
      for (const cb of afterCallbacks) {
        await cb();
      }
    }
  });
}

Object.assign(test, vTest);
export default test;
