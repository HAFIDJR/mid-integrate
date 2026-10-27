import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { uid } from '../lib/format';
import {
  clearPendingPayment,
  readPendingPayment,
  removeOrphanPayment,
  writePendingPayment,
} from '../state/storage';
import type { CartItem, Customer, PaymentConfig, PaymentStatus } from '../state/types';
import {
  createQrisCharge,
  fetchPaymentConfig,
  fetchQrisStatus,
  PaymentApiError,
  type PaymentApi,
  type QrisStatus,
} from './api';
import { markOrderActive, unmarkOrderActive } from './activeOrders';
import { buildCartSnapshot, snapshotKey, type CartSnapshot } from './snapshot';

export type QrisPhase = 'idle' | 'creating' | 'pending' | 'paid' | 'error';

export interface QrisState {
  phase: QrisPhase;
  orderId: string | null;
  amount: number | null;
  qrImageUrl: string | null;
  expiresAt: string | null;
  environment: 'sandbox' | 'production' | null;
  message: string | null;
  terminal: PaymentStatus | null;
  config: PaymentConfig | null;
  configError: string | null;
  lastCheckedAt: number | null;
}

export interface AbandonedPayment {
  orderId: string;
  amount: number;
  expiresAt: string | null;
  reason: string;
}

export interface UseQrisPaymentArgs {
  /** False while QRIS is not the selected method (pauses polling, never creates a charge). */
  enabled?: boolean;
  cart: CartItem[];
  customer: Customer;
  onPaid: (status: QrisStatus) => void;
  onAbandonPayment?: (payment: AbandonedPayment) => void;
  api?: PaymentApi;
  pollIntervalMs?: number;
}

export interface ActiveOrderMeta {
  orderId: string;
  amount: number;
  snapshotKey: string;
  expiresAt: string | null;
  environment: 'sandbox' | 'production' | null;
}

export interface UseQrisPaymentResult {
  state: QrisState;
  snapshot: CartSnapshot | null;
  activeOrder: ActiveOrderMeta | null;
  createOrder: (options?: { force?: boolean }) => Promise<void>;
  checkNow: () => void;
  dispose: (reason: string) => void;
  getActiveOrder: () => ActiveOrderMeta | null;
}

const DEFAULT_POLL_MS = 3000;

const emptyState = (config: PaymentConfig | null = null): QrisState => ({
  phase: 'idle',
  orderId: null,
  amount: null,
  qrImageUrl: null,
  expiresAt: null,
  environment: null,
  message: null,
  terminal: null,
  config,
  configError: null,
  lastCheckedAt: null,
});

export function messageForPaymentError(error: unknown): string {
  if (error instanceof PaymentApiError) {
    switch (error.code) {
      case 'midtrans_not_configured':
        return 'QRIS is not configured on the server. Add MIDTRANS_SERVER_KEY and restart.';
      case 'timeout':
        return 'Midtrans is taking too long to respond. Try again.';
      case 'network':
        return 'Cannot reach the payment service. Check your connection.';
      case 'rate_limited':
        return 'Too many attempts — wait a moment, then try again.';
      case 'malformed_response':
        return 'The payment service returned an unusable response. No payment was recorded.';
      default:
        return error.message || 'Could not create a QRIS payment.';
    }
  }
  return 'Could not create a QRIS payment. Try again.';
}

const isExpiredMeta = (order: ActiveOrderMeta, now = Date.now()): boolean =>
  order.expiresAt ? Date.parse(order.expiresAt) <= now : false;

/**
 * Owns one QRIS payment attempt for the current cart snapshot.
 *
 * - A charge is only ever created by an explicit action (`createOrder`), never by a render.
 * - Polling is bound to the active order id and aborted on unmount / method change / replacement.
 * - A verified `paid` status is forwarded once per order id.
 */
export function useQrisPayment({
  enabled = true,
  cart,
  customer,
  onPaid,
  onAbandonPayment,
  api,
  pollIntervalMs = DEFAULT_POLL_MS,
}: UseQrisPaymentArgs): UseQrisPaymentResult {
  const client: PaymentApi = useMemo(
    () => api ?? { createQrisCharge, fetchQrisStatus, fetchPaymentConfig },
    [api],
  );

  const snapshot = useMemo(() => buildCartSnapshot(cart), [cart]);
  const key = snapshot ? snapshotKey(snapshot) : null;

  const [state, setState] = useState<QrisState>(() => emptyState());
  const [, setActiveVersion] = useState(0);

  const snapshotRef = useRef<CartSnapshot | null>(snapshot);
  snapshotRef.current = snapshot;
  const keyRef = useRef<string | null>(key);
  keyRef.current = key;
  const customerRef = useRef(customer);
  customerRef.current = customer;
  const activeRef = useRef<ActiveOrderMeta | null>(null);
  const paidRef = useRef(false);
  const createLock = useRef(false);
  const idemRef = useRef<{ key: string; snapshotKey: string } | null>(null);
  const configLoadedRef = useRef(false);
  const configRef = useRef<PaymentConfig | null>(null);
  configRef.current = state.config;

  const onPaidRef = useRef(onPaid);
  const onAbandonRef = useRef(onAbandonPayment);
  useEffect(() => {
    onPaidRef.current = onPaid;
    onAbandonRef.current = onAbandonPayment;
  });

  const setActive = useCallback((order: ActiveOrderMeta | null) => {
    const previous = activeRef.current;
    if (previous && previous.orderId !== order?.orderId) unmarkOrderActive(previous.orderId);
    if (order) markOrderActive(order.orderId);
    activeRef.current = order;
    setActiveVersion((version) => version + 1);
  }, []);

  /* ----------------------------- status handling ---------------------------- */
  const handleStatus = useCallback(
    (orderId: string, status: QrisStatus) => {
      const active = activeRef.current;
      if (!active || active.orderId !== orderId) return; // stale response from an old order
      if (status.orderId !== orderId) return;
      if (status.amount !== active.amount) {
        setState((prev) =>
          prev.orderId === orderId
            ? {
                ...prev,
                phase: 'error',
                message: 'Midtrans reported a different amount. This payment is not accepted here.',
              }
            : prev,
        );
        return;
      }
      if (status.status === 'paid') {
        if (!status.verified || paidRef.current) return;
        paidRef.current = true;
        setState((prev) =>
          prev.orderId === orderId
            ? { ...prev, phase: 'paid', message: 'Payment verified by Midtrans', terminal: null }
            : prev,
        );
        onPaidRef.current(status);
        return;
      }
      if (status.status === 'pending' || status.status === 'unknown') {
        setState((prev) =>
          prev.orderId === orderId
            ? {
                ...prev,
                phase: prev.phase === 'paid' ? prev.phase : 'pending',
                expiresAt: status.expiresAt ?? prev.expiresAt,
                lastCheckedAt: Date.now(),
                message:
                  status.status === 'unknown' ? 'Waiting for Midtrans verification…' : null,
              }
            : prev,
        );
        return;
      }
      // expired / canceled / denied / failed — never a sale, never a stock change
      setActive(null);
      clearPendingPayment();
      setState((prev) => ({
        ...emptyState(prev.config),
        terminal: status.status,
        message:
          status.status === 'expired'
            ? 'This QR has expired. Generate a new one for the same total.'
            : 'This payment was not completed. Generate a new QR to try again.',
        lastCheckedAt: Date.now(),
      }));
    },
    [setActive],
  );

  const handleStatusRef = useRef(handleStatus);
  useEffect(() => {
    handleStatusRef.current = handleStatus;
  });

  const verifyNow = useCallback(
    async (orderId: string, signal?: AbortSignal) => {
      try {
        const status = await client.fetchQrisStatus(orderId, { signal, timeoutMs: 8000 });
        handleStatusRef.current(orderId, status);
        return status;
      } catch {
        return null;
      }
    },
    [client],
  );

  /* --------------------------------- config -------------------------------- */
  useEffect(() => {
    if (configLoadedRef.current) return;
    configLoadedRef.current = true;
    let cancelled = false;
    client
      .fetchPaymentConfig({ timeoutMs: 6000 })
      .then((config) => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, config, configError: null }));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        configLoadedRef.current = false;
        setState((prev) => ({
          ...prev,
          configError:
            error instanceof PaymentApiError && error.code === 'timeout'
              ? 'Payment service did not respond.'
              : 'Payment service unavailable.',
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  /* ------------------------- resume / invalidate --------------------------- */
  useEffect(() => {
    if (!enabled) return;
    const active = activeRef.current;

    if (active && active.snapshotKey !== (key ?? '')) {
      if (!paidRef.current) {
        onAbandonRef.current?.({
          orderId: active.orderId,
          amount: active.amount,
          expiresAt: active.expiresAt,
          reason: 'cart_changed',
        });
      }
      setActive(null);
      paidRef.current = false;
      clearPendingPayment();
      setState((prev) => ({ ...emptyState(prev.config), lastCheckedAt: null }));
      return;
    }

    if (!key || !snapshot || activeRef.current) return;

    // Recover an order created before a refresh; re-verify with the server.
    const pending = readPendingPayment();
    if (pending && pending.snapshotKey === key && pending.amount === snapshot.amount) {
      const meta: ActiveOrderMeta = {
        orderId: pending.orderId,
        amount: pending.amount,
        snapshotKey: key,
        expiresAt: pending.expiresAt,
        environment: pending.environment,
      };
      removeOrphanPayment(pending.orderId);
      setActive(meta);
      setState((prev) => ({
        ...prev,
        phase: 'pending',
        orderId: pending.orderId,
        amount: pending.amount,
        qrImageUrl: `/api/payments/${encodeURIComponent(pending.orderId)}/qr`,
        expiresAt: pending.expiresAt,
        environment: pending.environment,
        message: null,
        terminal: null,
      }));
      void verifyNow(pending.orderId);
    }
  }, [enabled, key, snapshot, setActive, verifyNow]);

  /* -------------------------------- polling -------------------------------- */
  const pollOrderId = state.orderId;
  const shouldPoll = enabled && state.phase === 'pending' && !!pollOrderId;

  useEffect(() => {
    if (!shouldPoll || !pollOrderId) return;
    const orderId = pollOrderId;
    const controller = new AbortController();
    let cancelled = false;

    const tick = async () => {
      try {
        const status = await client.fetchQrisStatus(orderId, { signal: controller.signal, timeoutMs: 8000 });
        if (cancelled) return;
        handleStatusRef.current(orderId, status);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof PaymentApiError && error.code === 'aborted') return;
        setState((prev) =>
          prev.orderId === orderId
            ? { ...prev, message: 'Still verifying with Midtrans…', lastCheckedAt: Date.now() }
            : prev,
        );
      }
    };

    void tick();
    const interval = setInterval(() => void tick(), pollIntervalMs);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [shouldPoll, pollOrderId, client, pollIntervalMs]);

  /* ------------------------------- create order ---------------------------- */
  const createOrder = useCallback(
    async (options: { force?: boolean } = {}) => {
      const snap = snapshotRef.current;
      const snapKey = keyRef.current;
      if (!snap || !snapKey) {
        setState((prev) => ({
          ...prev,
          phase: 'error',
          message: 'Add at least one item before paying with QRIS.',
        }));
        return;
      }
      if (createLock.current) return;

      const active = activeRef.current;
      if (active && !isExpiredMeta(active)) {
        void verifyNow(active.orderId);
        return;
      }

      if (!options.force) {
        const pending = readPendingPayment();
        if (pending && pending.snapshotKey === snapKey && pending.amount === snap.amount) {
          const meta: ActiveOrderMeta = {
            orderId: pending.orderId,
            amount: pending.amount,
            snapshotKey: snapKey,
            expiresAt: pending.expiresAt,
            environment: pending.environment,
          };
          removeOrphanPayment(pending.orderId);
          setActive(meta);
          setState((prev) => ({
            ...prev,
            phase: 'pending',
            orderId: pending.orderId,
            amount: pending.amount,
            qrImageUrl: `/api/payments/${encodeURIComponent(pending.orderId)}/qr`,
            expiresAt: pending.expiresAt,
            environment: pending.environment,
            message: null,
            terminal: null,
          }));
          void verifyNow(pending.orderId);
          return;
        }
      }

      createLock.current = true;
      paidRef.current = false;
      setState((prev) => ({
        ...prev,
        phase: 'creating',
        orderId: null,
        amount: snap.amount,
        qrImageUrl: null,
        expiresAt: null,
        message: null,
        terminal: null,
      }));

      try {
        if (!idemRef.current || idemRef.current.snapshotKey !== snapKey) {
          idemRef.current = { key: uid() + uid(), snapshotKey: snapKey };
        }
        const charge = await client.createQrisCharge(
          {
            items: snap.items,
            grossAmount: snap.amount,
            customer: {
              name: customerRef.current.name.trim(),
              phone: customerRef.current.phone.trim(),
            },
            idempotencyKey: idemRef.current.key,
          },
          { timeoutMs: 20000 },
        );
        if (keyRef.current !== snapKey) {
          // Cart changed while the charge was being created: abandon it for reconciliation.
          onAbandonRef.current?.({
            orderId: charge.orderId,
            amount: charge.amount,
            expiresAt: charge.expiresAt,
            reason: 'cart_changed',
          });
          return;
        }
        if (charge.amount !== snap.amount) {
          throw new PaymentApiError('malformed_response', 'Amount mismatch from the payment service');
        }
        const meta: ActiveOrderMeta = {
          orderId: charge.orderId,
          amount: charge.amount,
          snapshotKey: snapKey,
          expiresAt: charge.expiresAt,
          environment: charge.environment,
        };
        removeOrphanPayment(charge.orderId);
        setActive(meta);
        writePendingPayment({
          orderId: charge.orderId,
          amount: charge.amount,
          snapshotKey: snapKey,
          createdAt: new Date().toISOString(),
          expiresAt: charge.expiresAt,
          environment: charge.environment,
          customer: {
            name: customerRef.current.name.trim(),
            phone: customerRef.current.phone.trim(),
          },
          attempt: 1,
        });
        setState((prev) => ({
          ...prev,
          phase: 'pending',
          orderId: charge.orderId,
          amount: charge.amount,
          qrImageUrl: charge.qrImageUrl,
          expiresAt: charge.expiresAt,
          environment: charge.environment,
          message: null,
          terminal: null,
          lastCheckedAt: Date.now(),
        }));
        if (charge.status === 'paid') {
          void verifyNow(charge.orderId);
        }
      } catch (error) {
        if (error instanceof PaymentApiError && error.orderId) {
          onAbandonRef.current?.({
            orderId: error.orderId,
            amount: snap.amount,
            expiresAt: null,
            reason: 'create_uncertain',
          });
        }
        if (keyRef.current !== snapKey) return;
        setState((prev) => ({
          ...prev,
          phase: 'error',
          orderId: null,
          qrImageUrl: null,
          expiresAt: null,
          terminal: null,
          message: messageForPaymentError(error),
        }));
      } finally {
        createLock.current = false;
      }
    },
    [client, setActive, verifyNow],
  );

  const checkNow = useCallback(() => {
    const active = activeRef.current;
    if (active) void verifyNow(active.orderId);
  }, [verifyNow]);

  const dispose = useCallback(
    (reason: string) => {
      const active = activeRef.current;
      if (active && !paidRef.current) {
        onAbandonRef.current?.({
          orderId: active.orderId,
          amount: active.amount,
          expiresAt: active.expiresAt,
          reason,
        });
        clearPendingPayment();
      }
      setActive(null);
      paidRef.current = false;
      setState((prev) => ({ ...emptyState(prev.config) }));
    },
    [setActive],
  );

  return {
    state,
    snapshot,
    activeOrder: activeRef.current,
    createOrder,
    checkNow,
    dispose,
    getActiveOrder: () => activeRef.current,
  };
}
