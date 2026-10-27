import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomNav, Fab } from './components/BottomNav';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Onboarding } from './components/Onboarding';
import { ToastHub } from './components/ToastHub';
import { Cashier, type SaleCompletionOptions } from './cashier/Cashier';
import { Receipt } from './receipt/Receipt';
import { useApp } from './state/AppContext';
import {
  addOrphanPayment,
  addPaymentAlert,
  clearPendingPayment,
  listOrphanPayments,
  markFlow,
  readFlowRecord,
  readPendingPayment,
  removeOrphanPayment,
} from './state/storage';
import type { Sale } from './state/types';
import { Dashboard } from './views/Dashboard';
import { Products } from './views/Products';
import { Reports } from './views/Reports';
import { Settings } from './views/Settings';
import { fetchPaymentConfig, fetchQrisStatus } from './payments/api';
import { isOrderActive } from './payments/activeOrders';
import { createPostPaymentFlow } from './payments/postPayment';
import { fmtRp } from './lib/format';

const ORPHAN_POLL_MS = 15_000;
const ORPHAN_GRACE_MS = 15 * 60 * 1000;
const RECEIPT_READY_TIMEOUT_MS = 5000;

export default function App() {
  const { view, setView, onboarded, toast, setPaymentConfig } = useApp();
  const [cashierOpen, setCashierOpen] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const receiptReadyRef = useRef<(() => void) | null>(null);

  const openCashier = useCallback(() => setCashierOpen(true), []);

  const postFlow = useMemo(
    () =>
      createPostPaymentFlow({
        print: () => window.print(),
        reload: () => window.location.reload(),
        addAfterPrintListener: (listener) => {
          window.addEventListener('afterprint', listener);
          return () => window.removeEventListener('afterprint', listener);
        },
        getFlow: readFlowRecord,
        markFlow,
        notify: (message, kind) => toast(message, kind),
        setTimer: (fn, ms) => setTimeout(fn, ms),
        clearTimer: (handle) => clearTimeout(handle),
      }),
    [toast],
  );

  /* Payment connection info (non-secret) for the Settings panel. */
  useEffect(() => {
    let cancelled = false;
    fetchPaymentConfig({ timeoutMs: 6000 })
      .then((config) => {
        if (!cancelled) setPaymentConfig(config);
      })
      .catch(() => {
        if (!cancelled) setPaymentConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, [setPaymentConfig]);

  /* Recover a QRIS order that was in flight when the browser was refreshed. */
  useEffect(() => {
    const pending = readPendingPayment();
    if (!pending) return;
    let cancelled = false;
    void (async () => {
      try {
        const status = await fetchQrisStatus(pending.orderId, { timeoutMs: 8000 });
        if (cancelled) return;
        if (status.status === 'paid' && status.verified) {
          addPaymentAlert({
            orderId: status.orderId,
            amount: status.amount,
            transactionId: status.transactionId,
            paidAt: status.paidAt,
            detectedAt: new Date().toISOString(),
          });
          clearPendingPayment();
          toast(
            `A previous QRIS payment of ${fmtRp(status.amount)} was verified. Check Reports to reconcile it.`,
            'warn',
          );
          return;
        }
        if (status.status === 'pending' || status.status === 'unknown') {
          addOrphanPayment({
            orderId: pending.orderId,
            amount: pending.amount,
            expiresAt: pending.expiresAt,
            createdAt: pending.createdAt || new Date().toISOString(),
            reason: 'refresh_recovery',
          });
        } else {
          clearPendingPayment();
        }
      } catch {
        // Keep the metadata; the cashier can resume it later.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  /* Watch abandoned QRIS orders so a late settlement is surfaced, never lost. */
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      for (const orphan of listOrphanPayments()) {
        if (cancelled) return;
        if (isOrderActive(orphan.orderId)) continue;
        const expiresAt = orphan.expiresAt ? Date.parse(orphan.expiresAt) : null;
        if (expiresAt && Date.now() > expiresAt + ORPHAN_GRACE_MS) {
          removeOrphanPayment(orphan.orderId);
          continue;
        }
        try {
          const status = await fetchQrisStatus(orphan.orderId, { timeoutMs: 8000 });
          if (cancelled) return;
          if (status.status === 'paid' && status.verified) {
            const added = addPaymentAlert({
              orderId: status.orderId,
              amount: status.amount,
              transactionId: status.transactionId,
              paidAt: status.paidAt,
              detectedAt: new Date().toISOString(),
            });
            removeOrphanPayment(orphan.orderId);
            if (added) {
              toast(
                `Verified QRIS payment of ${fmtRp(status.amount)} arrived for a closed order. Check Reports.`,
                'warn',
              );
            }
          } else if (status.status !== 'pending' && status.status !== 'unknown') {
            removeOrphanPayment(orphan.orderId);
          }
        } catch {
          // Network hiccup: retry on the next tick.
        }
      }
    };
    void check();
    const interval = setInterval(() => void check(), ORPHAN_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [toast]);

  const handleReceiptReady = useCallback(() => {
    const resolve = receiptReadyRef.current;
    receiptReadyRef.current = null;
    resolve?.();
  }, []);

  const handleSaleComplete = useCallback(
    (sale: Sale, options: SaleCompletionOptions) => {
      setCashierOpen(false);
      if (options.autoPrint && options.orderId) {
        const rendered = new Promise<void>((resolve) => {
          receiptReadyRef.current = resolve;
        });
        // Never let an uninteractive browser (or a missing font event) block the flow.
        const bounded = Promise.race([
          rendered,
          new Promise<void>((resolve) => setTimeout(resolve, RECEIPT_READY_TIMEOUT_MS)),
        ]).then(() => {
          receiptReadyRef.current = null;
        });
        setReceipt(sale);
        void postFlow.run(options.orderId, bounded, { reload: options.reload !== false });
      } else {
        setReceipt(sale);
      }
    },
    [postFlow],
  );

  return (
    <div id="app" role="application" aria-label="Kasir Digital Point of Sale">
      <main id="screen" className="screen" aria-live="polite">
        <Fragment key={view}>
          {view === 'dashboard' ? <Dashboard onStartSale={openCashier} /> : null}
          {view === 'products' ? <Products /> : null}
          {view === 'reports' ? <Reports onStartSale={openCashier} /> : null}
          {view === 'settings' ? <Settings /> : null}
        </Fragment>
      </main>

      <BottomNav view={view} onChange={setView} />
      <Fab onClick={openCashier} />

      <div id="overlay-root">
        {!onboarded ? <Onboarding /> : null}
        {cashierOpen ? (
          <Cashier
            onClose={() => setCashierOpen(false)}
            onGoToProducts={() => {
              setCashierOpen(false);
              setView('products');
            }}
            onSaleComplete={handleSaleComplete}
          />
        ) : null}
        {receipt ? (
          <Receipt sale={receipt} onClose={() => setReceipt(null)} onReady={handleReceiptReady} />
        ) : null}
        <ConfirmDialog />
      </div>

      <ToastHub />
    </div>
  );
}
