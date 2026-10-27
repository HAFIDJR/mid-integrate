import type { FlowRecord } from '../state/storage';
import type { ToastKind } from '../state/types';

export interface PostPaymentDeps {
  print: () => void;
  reload: () => void;
  /** Subscribe to the browser's `afterprint` event. Returns an unsubscribe function. */
  addAfterPrintListener: (listener: () => void) => () => void;
  getFlow: (orderId: string) => FlowRecord;
  markFlow: (orderId: string, patch: FlowRecord) => void;
  notify: (message: string, kind: ToastKind) => void;
  setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer: (handle: ReturnType<typeof setTimeout>) => void;
  /** Delay between `afterprint` (or print returning) and the reload. */
  afterPrintDelayMs?: number;
  /** Bounded fallback when the browser never fires `afterprint`. */
  reloadFallbackMs?: number;
  /** Delay before reloading when printing could not even be requested. */
  printBlockedDelayMs?: number;
}

export interface PostPaymentResult {
  printed: boolean;
  reloadScheduled: boolean;
}

export interface PostPaymentFlow {
  run: (
    orderId: string,
    receiptReady: Promise<void>,
    options?: { reload?: boolean },
  ) => Promise<PostPaymentResult>;
}

const nowIso = (): string => new Date().toISOString();

/**
 * Coordinates the "print the receipt once, then refresh the page once" tail of a
 * verified QRIS sale. Every step is guarded by the Midtrans order id so duplicate
 * polling responses, React re-renders and a retry after refresh cannot loop.
 */
export function createPostPaymentFlow(deps: PostPaymentDeps): PostPaymentFlow {
  const inFlight = new Map<string, Promise<PostPaymentResult>>();
  const reloadTimers = new Map<string, { handle: ReturnType<typeof setTimeout>; due: number }>();
  const reloadDone = new Set<string>();
  const printArmed = new Set<string>();

  /**
   * Schedule the one-time full-page refresh. A later request can move the reload
   * earlier (e.g. `afterprint` after the bounded fallback) but never later, and a
   * reload that already happened can never be scheduled again.
   */
  const scheduleReload = (orderId: string, delay: number, allowReload: boolean) => {
    if (!allowReload) return false;
    if (reloadDone.has(orderId)) return false;
    if (deps.getFlow(orderId).reloadedAt) return false;
    const due = Date.now() + delay;
    const existing = reloadTimers.get(orderId);
    if (existing) {
      if (existing.due <= due) return false; // an earlier reload is already pending
      deps.clearTimer(existing.handle);
      reloadTimers.delete(orderId);
    }
    const handle = deps.setTimer(() => {
      reloadTimers.delete(orderId);
      if (reloadDone.has(orderId)) return;
      if (deps.getFlow(orderId).reloadedAt) return;
      reloadDone.add(orderId);
      deps.markFlow(orderId, { reloadedAt: nowIso() });
      deps.reload();
    }, delay);
    reloadTimers.set(orderId, { handle, due });
    return true;
  };

  const run: PostPaymentFlow['run'] = (orderId, receiptReady, options = {}) => {
    const allowReload = options.reload !== false;
    const existing = inFlight.get(orderId);
    if (existing) return existing;

    const task = (async (): Promise<PostPaymentResult> => {
      const flow = deps.getFlow(orderId);
      if (flow.reloadedAt) return { printed: false, reloadScheduled: false };

      try {
        await receiptReady;
      } catch {
        /* receipt still rendered; continue */
      }

      // A retry after a page refresh must not print the same receipt again.
      if (deps.getFlow(orderId).printedAt) {
        scheduleReload(orderId, 800, allowReload);
        return { printed: false, reloadScheduled: allowReload };
      }
      if (printArmed.has(orderId)) {
        return { printed: false, reloadScheduled: false };
      }
      printArmed.add(orderId);

      let unsubscribe: (() => void) | null = null;
      const onAfterPrint = () => {
        unsubscribe?.();
        scheduleReload(orderId, deps.afterPrintDelayMs ?? 350, allowReload);
      };
      unsubscribe = deps.addAfterPrintListener(onAfterPrint);

      deps.markFlow(orderId, { printedAt: nowIso() });
      let printed = false;
      try {
        deps.print();
        printed = true;
        // Bounded fallback for browsers that never emit afterprint.
        scheduleReload(orderId, deps.reloadFallbackMs ?? 12000, allowReload);
      } catch {
        deps.notify(
          'Automatic printing was blocked. Use the Print button — the page will refresh shortly.',
          'warn',
        );
        scheduleReload(orderId, deps.printBlockedDelayMs ?? 2500, allowReload);
      }
      return { printed, reloadScheduled: allowReload };
    })();

    inFlight.set(orderId, task);
    void task.finally(() => {
      // Keep the promise cached; the guards above make further calls no-ops.
    });
    return task;
  };

  return { run };
}
