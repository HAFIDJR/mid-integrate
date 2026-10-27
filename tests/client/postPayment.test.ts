import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPostPaymentFlow, type PostPaymentDeps } from '../../src/payments/postPayment';
import type { FlowRecord } from '../../src/state/storage';

interface Harness {
  deps: PostPaymentDeps;
  prints: number;
  reloads: number;
  notices: string[];
  fireAfterPrint: () => void;
  flow: Record<string, FlowRecord>;
}

function harness(options: { flow?: Record<string, FlowRecord>; printThrows?: boolean } = {}): Harness {
  const state: Harness = {
    prints: 0,
    reloads: 0,
    notices: [],
    flow: { ...(options.flow ?? {}) },
    fireAfterPrint: () => undefined,
    deps: {} as PostPaymentDeps,
  };
  const listeners = new Set<() => void>();
  state.fireAfterPrint = () => listeners.forEach((listener) => listener());
  state.deps = {
    print: () => {
      if (options.printThrows) throw new Error('print blocked');
      state.prints += 1;
    },
    reload: () => {
      state.reloads += 1;
    },
    addAfterPrintListener: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getFlow: (orderId) => state.flow[orderId] ?? {},
    markFlow: (orderId, patch) => {
      state.flow[orderId] = { ...(state.flow[orderId] ?? {}), ...patch };
    },
    notify: (message) => state.notices.push(message),
    setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as ReturnType<typeof setTimeout>,
    clearTimer: (handle) => clearTimeout(handle),
  };
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createPostPaymentFlow', () => {
  it('prints once, then reloads once when afterprint fires', async () => {
    const h = harness();
    const flow = createPostPaymentFlow(h.deps);
    await flow.run('ORDER-1', Promise.resolve());
    expect(h.prints).toBe(1);
    expect(h.reloads).toBe(0);

    h.fireAfterPrint();
    await vi.advanceTimersByTimeAsync(400);
    expect(h.reloads).toBe(1);

    // Duplicate afterprint signals cannot reload twice.
    h.fireAfterPrint();
    await vi.advanceTimersByTimeAsync(400);
    expect(h.reloads).toBe(1);
  });

  it('does not print or reload twice for duplicate run() calls', async () => {
    const h = harness();
    const flow = createPostPaymentFlow(h.deps);
    await Promise.all([
      flow.run('ORDER-1', Promise.resolve()),
      flow.run('ORDER-1', Promise.resolve()),
    ]);
    expect(h.prints).toBe(1);
    h.fireAfterPrint();
    await vi.advanceTimersByTimeAsync(500);
    await flow.run('ORDER-1', Promise.resolve());
    expect(h.prints).toBe(1);
    expect(h.reloads).toBe(1);
  });

  it('falls back to a bounded reload when afterprint never fires', async () => {
    const h = harness();
    const flow = createPostPaymentFlow(h.deps);
    await flow.run('ORDER-1', Promise.resolve());
    expect(h.prints).toBe(1);
    await vi.advanceTimersByTimeAsync(9000);
    expect(h.reloads).toBe(0);
    await vi.advanceTimersByTimeAsync(4000);
    expect(h.reloads).toBe(1);
    // A late afterprint must not trigger a second reload.
    h.fireAfterPrint();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.reloads).toBe(1);
  });

  it('warns and still reloads once when printing is blocked', async () => {
    const h = harness({ printThrows: true });
    const flow = createPostPaymentFlow(h.deps);
    const result = await flow.run('ORDER-1', Promise.resolve());
    expect(result.printed).toBe(false);
    expect(h.notices[0]).toMatch(/printing was blocked/i);
    await vi.advanceTimersByTimeAsync(2600);
    expect(h.reloads).toBe(1);
  });

  it('does not reload when persistence failed', async () => {
    const h = harness();
    const flow = createPostPaymentFlow(h.deps);
    await flow.run('ORDER-1', Promise.resolve(), { reload: false });
    expect(h.prints).toBe(1);
    h.fireAfterPrint();
    await vi.advanceTimersByTimeAsync(15000);
    expect(h.reloads).toBe(0);
  });

  it('never repeats the flow after a refresh (persisted guards)', async () => {
    const h = harness({
      flow: { 'ORDER-1': { printedAt: '2026-01-01T00:00:00.000Z' } },
    });
    const flow = createPostPaymentFlow(h.deps);
    await flow.run('ORDER-1', Promise.resolve());
    expect(h.prints).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.reloads).toBe(1);
  });

  it('does nothing for an order that already reloaded', async () => {
    const h = harness({
      flow: {
        'ORDER-1': {
          printedAt: '2026-01-01T00:00:00.000Z',
          reloadedAt: '2026-01-01T00:00:01.000Z',
        },
      },
    });
    const flow = createPostPaymentFlow(h.deps);
    await flow.run('ORDER-1', Promise.resolve());
    await vi.advanceTimersByTimeAsync(20000);
    expect(h.prints).toBe(0);
    expect(h.reloads).toBe(0);
  });
});
