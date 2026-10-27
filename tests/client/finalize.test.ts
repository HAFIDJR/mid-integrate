import { beforeEach, describe, expect, it } from 'vitest';
import { finalizeQrisSale, resetFinalizedCache } from '../../src/payments/finalize';
import { buildCartSnapshot, snapshotKey } from '../../src/payments/snapshot';
import type { QrisStatus } from '../../src/payments/api';
import type { CartItem, Product, Sale } from '../../src/state/types';

const cart: CartItem[] = [
  { productId: 'p1', name: 'Kopi Susu', price: 18000, qty: 2, unit: 'pcs' },
  { productId: 'p2', name: 'Roti', price: 10000, qty: 1, unit: 'pcs' },
];
const snapshot = buildCartSnapshot(cart)!;
const cartKey = snapshotKey(snapshot);
const amount = snapshot.amount;

const products: Product[] = [
  { id: 'p1', name: 'Kopi Susu', category: 'Drink', price: 18000, stock: 5, unit: 'pcs' },
  { id: 'p2', name: 'Roti', category: 'Food', price: 10000, stock: 1, unit: 'pcs' },
];

const paidStatus = (overrides: Partial<QrisStatus> = {}): QrisStatus => ({
  orderId: 'KASIR-ORDER-1',
  midtransOrderId: 'KASIR-ORDER-1',
  status: 'paid',
  transactionStatus: 'settlement',
  amount,
  transactionId: 'tx-abc',
  paidAt: '2026-10-27T05:00:00.000Z',
  expiresAt: '2026-10-27T05:15:00.000Z',
  environment: 'sandbox',
  verified: true,
  ...overrides,
});

const activeOrder = { orderId: 'KASIR-ORDER-1', amount, snapshotKey: cartKey };

function context(sales: Sale[] = []) {
  return {
    snapshot,
    customer: { name: 'Siti', phone: '0812' },
    products,
    sales,
    order: activeOrder,
    payment: paidStatus(),
  };
}

beforeEach(() => resetFinalizedCache());

describe('finalizeQrisSale', () => {
  it('creates exactly one PAID sale with Midtrans metadata and reduces stock once', () => {
    const result = finalizeQrisSale(context());
    expect(result.type).toBe('completed');
    if (result.type !== 'completed') return;

    expect(result.sale).toMatchObject({
      saleNumber: '#0001',
      customerName: 'Siti',
      customerPhone: '0812',
      total: amount,
      cashReceived: amount,
      change: 0,
      paymentMethod: 'QRIS',
      status: 'PAID',
      midtransOrderId: 'KASIR-ORDER-1',
      midtransTransactionId: 'tx-abc',
      paidAt: '2026-10-27T05:00:00.000Z',
    });
    expect(result.sale.items).toEqual([
      { productId: 'p1', name: 'Kopi Susu', price: 18000, qty: 2 },
      { productId: 'p2', name: 'Roti', price: 10000, qty: 1 },
    ]);
    expect(result.products.find((product) => product.id === 'p1')?.stock).toBe(3);
    expect(result.products.find((product) => product.id === 'p2')?.stock).toBe(0);
  });

  it('ignores duplicate settlement signals (session guard)', () => {
    const first = finalizeQrisSale(context());
    expect(first.type).toBe('completed');

    const second = finalizeQrisSale(context());
    expect(second.type).toBe('duplicate');
    if (second.type === 'duplicate') expect(second.sale).toBeNull();
  });

  it('detects an already persisted sale after a refresh', () => {
    resetFinalizedCache();
    const persisted: Sale = {
      id: 'sale-1',
      saleNumber: '#0009',
      date: '2026-10-27T05:00:00.000Z',
      customerName: '',
      customerPhone: '',
      items: [{ productId: 'p1', name: 'Kopi Susu', price: 18000, qty: 2 }],
      total: amount,
      cashReceived: amount,
      change: 0,
      paymentMethod: 'QRIS',
      status: 'PAID',
      midtransOrderId: 'KASIR-ORDER-1',
      midtransTransactionId: 'tx-1',
    };
    const result = finalizeQrisSale(context([persisted]));
    expect(result.type).toBe('duplicate');
    if (result.type === 'duplicate') expect(result.sale?.id).toBe('sale-1');
  });

  it.each(['pending', 'expired', 'canceled', 'denied', 'failed', 'unknown'] as const)(
    'never completes a %s status',
    (status) => {
      const result = finalizeQrisSale({
        ...context(),
        payment: paidStatus({ status, verified: false }),
      });
      expect(result).toEqual({ type: 'rejected', reason: 'not_paid' });
    },
  );

  it('rejects a paid status that is not server-verified', () => {
    const result = finalizeQrisSale({ ...context(), payment: paidStatus({ verified: false }) });
    expect(result).toEqual({ type: 'rejected', reason: 'unverified' });
  });

  it('rejects a settlement for another order id', () => {
    const result = finalizeQrisSale({
      ...context(),
      payment: paidStatus({ orderId: 'KASIR-OTHER' }),
    });
    expect(result).toEqual({ type: 'rejected', reason: 'stale_order' });
  });

  it('rejects an amount mismatch', () => {
    const result = finalizeQrisSale({ ...context(), payment: paidStatus({ amount: 1 }) });
    expect(result).toEqual({ type: 'rejected', reason: 'amount_mismatch' });
  });

  it('rejects a payment for a different cart snapshot', () => {
    const result = finalizeQrisSale({
      ...context(),
      order: { ...activeOrder, snapshotKey: 'different-cart' },
    });
    expect(result).toEqual({ type: 'rejected', reason: 'cart_mismatch' });
  });

  it('rejects when there is no active order', () => {
    const result = finalizeQrisSale({ ...context(), order: null });
    expect(result).toEqual({ type: 'rejected', reason: 'no_active_order' });
  });

  it('keeps numbering in sequence with existing sales', () => {
    const existing: Sale = {
      id: 'x',
      saleNumber: '#0007',
      date: new Date().toISOString(),
      customerName: '',
      customerPhone: '',
      items: [{ productId: 'p1', name: 'Kopi', price: 18000, qty: 1 }],
      total: 18000,
      cashReceived: 18000,
      change: 0,
      paymentMethod: 'Cash',
      status: 'PAID',
    };
    const result = finalizeQrisSale(context([existing]));
    expect(result.type).toBe('completed');
    if (result.type === 'completed') expect(result.sale.saleNumber).toBe('#0008');
  });
});
