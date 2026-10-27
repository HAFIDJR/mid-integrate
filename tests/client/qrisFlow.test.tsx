import { StrictMode, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useQrisPayment,
  type UseQrisPaymentArgs,
} from '../../src/payments/useQrisPayment';
import type { PaymentApi, QrisStatus } from '../../src/payments/api';
import { cartSnapshotKey } from '../../src/payments/snapshot';
import { readPendingPayment, writePendingPayment } from '../../src/state/storage';
import type { CartItem } from '../../src/state/types';

const cart: CartItem[] = [{ productId: 'p1', name: 'Kopi Susu', price: 18000, qty: 2, unit: 'pcs' }];
const otherCart: CartItem[] = [{ productId: 'p1', name: 'Kopi Susu', price: 18000, qty: 3, unit: 'pcs' }];
const customer = { name: 'Siti', phone: '0812' };
const amount = 36000;

const Wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

const pendingStatus = (overrides: Partial<QrisStatus> = {}): QrisStatus => ({
  orderId: 'KASIR-1',
  midtransOrderId: 'KASIR-1',
  status: 'pending',
  transactionStatus: 'pending',
  amount,
  transactionId: null,
  paidAt: null,
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  environment: 'sandbox',
  verified: false,
  ...overrides,
});

const paidStatus = (overrides: Partial<QrisStatus> = {}): QrisStatus =>
  pendingStatus({
    status: 'paid',
    transactionStatus: 'settlement',
    transactionId: 'tx-1',
    paidAt: '2026-10-27T05:00:00.000Z',
    verified: true,
    ...overrides,
  });

function makeApi() {
  const create = vi.fn(async (payload: { grossAmount: number }) => ({
    orderId: 'KASIR-1',
    midtransOrderId: 'KASIR-1',
    status: 'pending' as const,
    amount: payload.grossAmount,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    transactionId: null,
    paidAt: null,
    qrImageUrl: '/api/payments/KASIR-1/qr',
    environment: 'sandbox' as const,
  }));
  const status = vi.fn(async (_orderId: string, _options?: unknown) => pendingStatus());
  const config = vi.fn(async () => ({
    provider: 'midtrans' as const,
    configured: true,
    environment: 'sandbox' as const,
    qrisExpiryMinutes: 15,
  }));
  const api: PaymentApi = {
    createQrisCharge: create as unknown as PaymentApi['createQrisCharge'],
    fetchQrisStatus: status as unknown as PaymentApi['fetchQrisStatus'],
    fetchPaymentConfig: config as unknown as PaymentApi['fetchPaymentConfig'],
  };
  return { api, create, status, config };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderQris(args: Partial<UseQrisPaymentArgs> = {}) {
  const onPaid = vi.fn();
  const onAbandonPayment = vi.fn();
  const api = args.api ?? makeApi().api;
  const hook = renderHook(
    (props: Partial<UseQrisPaymentArgs>) =>
      useQrisPayment({
        cart,
        customer,
        onPaid,
        onAbandonPayment,
        api,
        ...props,
      }),
    { wrapper: Wrapper, initialProps: args },
  );
  return { ...hook, onPaid, onAbandonPayment, api };
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useQrisPayment', () => {
  it('creates exactly one charge per cart snapshot under StrictMode', async () => {
    const fake = makeApi();
    const { result } = renderQris({ api: fake.api });
    await flush();

    await act(async () => {
      await result.current.createOrder();
    });
    expect(fake.create).toHaveBeenCalledTimes(1);
    expect(result.current.state.phase).toBe('pending');
    expect(result.current.state.qrImageUrl).toBe('/api/payments/KASIR-1/qr');

    // A second call only re-checks the existing order.
    await act(async () => {
      await result.current.createOrder();
    });
    expect(fake.create).toHaveBeenCalledTimes(1);
    expect(readPendingPayment()?.orderId).toBe('KASIR-1');
  });

  it('guards against a double click while a charge is in flight', async () => {
    const fake = makeApi();
    const { result } = renderQris({ api: fake.api });
    await flush();
    await act(async () => {
      await Promise.all([result.current.createOrder(), result.current.createOrder()]);
    });
    expect(fake.create).toHaveBeenCalledTimes(1);
  });

  it('finalizes once when the server reports settlement', async () => {
    const fake = makeApi();
    const { result, onPaid } = renderQris({ api: fake.api });
    await flush();
    await act(async () => {
      await result.current.createOrder();
    });

    fake.status.mockImplementation(async () => paidStatus());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onPaid.mock.calls[0][0]).toMatchObject({ status: 'paid', verified: true });
    expect(result.current.state.phase).toBe('paid');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it('ignores a paid status that the server did not verify', async () => {
    const fake = makeApi();
    const { result, onPaid } = renderQris({ api: fake.api });
    await flush();
    await act(async () => {
      await result.current.createOrder();
    });

    fake.status.mockImplementation(async () => paidStatus({ verified: false }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onPaid).not.toHaveBeenCalled();
    expect(result.current.state.phase).not.toBe('paid');
  });

  it('never completes on a stale order id', async () => {
    const fake = makeApi();
    const { result, onPaid } = renderQris({ api: fake.api });
    await flush();
    await act(async () => {
      await result.current.createOrder();
    });

    fake.status.mockImplementation(async () => paidStatus({ orderId: 'KASIR-OTHER' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onPaid).not.toHaveBeenCalled();
  });

  it('treats an amount mismatch as an error, not a payment', async () => {
    const fake = makeApi();
    const { result, onPaid } = renderQris({ api: fake.api });
    await flush();
    await act(async () => {
      await result.current.createOrder();
    });

    fake.status.mockImplementation(async () => paidStatus({ amount: 1000 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onPaid).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe('error');
  });

  it('stops polling on an expired transaction without completing', async () => {
    const fake = makeApi();
    const { result, onPaid } = renderQris({ api: fake.api });
    await flush();
    await act(async () => {
      await result.current.createOrder();
    });

    fake.status.mockImplementation(async () =>
      pendingStatus({ status: 'expired', transactionStatus: 'expire' }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await flush();

    expect(onPaid).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.terminal).toBe('expired');
    expect(readPendingPayment()).toBeNull();

    const callsAfterExpiry = fake.status.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    expect(fake.status.mock.calls.length).toBe(callsAfterExpiry);
  });

  it('aborts polling when unmounted', async () => {
    const fake = makeApi();
    const { result, unmount } = renderQris({ api: fake.api });
    await flush();
    await act(async () => {
      await result.current.createOrder();
    });
    const calls = fake.status.mock.calls.length;
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    expect(fake.status.mock.calls.length).toBe(calls);
  });

  it('drops the active order when the cart changes', async () => {
    const fake = makeApi();
    const { result, rerender, onAbandonPayment, onPaid } = renderQris({ api: fake.api });
    await flush();
    await act(async () => {
      await result.current.createOrder();
    });
    expect(fake.create).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender({ cart: otherCart });
    });
    await flush();
    expect(onAbandonPayment).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'KASIR-1', amount }),
    );
    expect(readPendingPayment()).toBeNull();
    expect(onPaid).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe('idle');
    expect(fake.create).toHaveBeenCalledTimes(1);
  });

  it('resumes a persisted pending order after a refresh without charging again', async () => {
    const key = cartSnapshotKey(cart)!;
    writePendingPayment({
      orderId: 'KASIR-RESUMED',
      amount,
      snapshotKey: key,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      environment: 'sandbox',
      customer,
      attempt: 1,
    });
    const fake = makeApi();
    fake.status.mockImplementation(async () => pendingStatus({ orderId: 'KASIR-RESUMED' }));
    const { result } = renderQris({ api: fake.api });
    await flush();

    expect(result.current.state.phase).toBe('pending');
    expect(result.current.state.orderId).toBe('KASIR-RESUMED');
    expect(fake.create).not.toHaveBeenCalled();
    expect(fake.status).toHaveBeenCalledWith('KASIR-RESUMED', expect.anything());
  });

  it('does not poll while QRIS is not the selected method', async () => {
    const fake = makeApi();
    const { result } = renderQris({ api: fake.api, enabled: false });
    await flush();
    await act(async () => {
      await result.current.createOrder();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(fake.status).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe('pending');
  });
});
