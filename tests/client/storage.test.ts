import { beforeEach, describe, expect, it } from 'vitest';
import {
  KEYS,
  addOrphanPayment,
  addPaymentAlert,
  clearPendingPayment,
  clearPaymentAlerts,
  listOrphanPayments,
  listPaymentAlerts,
  loadInitialState,
  markFlow,
  readFlowRecord,
  readPendingPayment,
  writePendingPayment,
} from '../../src/state/storage';

beforeEach(() => localStorage.clear());

describe('legacy localStorage migration', () => {
  it('keeps the original keys and reads old records without losing fields', () => {
    localStorage.setItem(KEYS.onboarded, 'true');
    localStorage.setItem(
      KEYS.store,
      JSON.stringify({
        logo: '🍜',
        storeName: 'Warung Lama',
        ownerName: 'Ibu Ani',
        businessType: 'Food Stall',
        theme: 'dark',
        qris: '00020101021126610014COM.GO-JEK.WWW01189360091400000000000215W',
      }),
    );
    const legacySale = {
      id: 'old-1',
      saleNumber: '#0042',
      date: '2025-01-05T03:00:00.000Z',
      customerName: 'Budi',
      customerPhone: '0812',
      items: [{ productId: 'p1', name: 'Kopi', price: 18000, qty: 2 }],
      total: 36000,
      cashReceived: 50000,
      change: 14000,
      paymentMethod: 'Cash',
      status: 'PAID',
      legacyNote: 'kept',
    };
    localStorage.setItem(KEYS.sales, JSON.stringify([legacySale]));
    localStorage.setItem(
      KEYS.products,
      JSON.stringify([
        { id: 'p1', name: 'Kopi', category: 'Drink', price: 18000, stock: 3, unit: 'pcs', photoUrl: '☕' },
      ]),
    );

    const state = loadInitialState();
    expect(state.onboarded).toBe(true);
    expect(state.store.storeName).toBe('Warung Lama');
    expect(state.store.theme).toBe('dark');
    expect(state.store.qris).toContain('000201');
    expect(state.sales).toHaveLength(1);
    expect(state.sales[0]).toMatchObject({
      id: 'old-1',
      saleNumber: '#0042',
      total: 36000,
      paymentMethod: 'Cash',
      legacyNote: 'kept',
    });
    expect(state.sales[0].midtransOrderId).toBeUndefined();
    expect(state.products).toHaveLength(1);
    expect(state.products[0].stock).toBe(3);
  });

  it('survives corrupt JSON without wiping valid data', () => {
    localStorage.setItem(KEYS.onboarded, 'true');
    localStorage.setItem(KEYS.sales, '{not json');
    localStorage.setItem(KEYS.store, '"just a string"');
    const state = loadInitialState();
    expect(state.onboarded).toBe(true);
    expect(state.sales).toEqual([]);
    expect(state.store.storeName).toBe('Kedai Senja');
  });

  it('seeds a catalog only when none was ever stored', () => {
    const state = loadInitialState();
    expect(state.products.length).toBeGreaterThan(0);
    expect(localStorage.getItem(KEYS.products)).not.toBeNull();
  });

  it('drops sale records that cannot be rendered instead of crashing', () => {
    localStorage.setItem(KEYS.sales, JSON.stringify([{ id: 'x' }, null, { id: 'y', date: '2025-01-01', items: [] }]));
    expect(loadInitialState().sales).toEqual([]);
  });
});

describe('pending payment metadata', () => {
  it('round-trips and clears', () => {
    writePendingPayment({
      orderId: 'KASIR-1',
      amount: 36000,
      snapshotKey: 'key',
      createdAt: '2026-10-27T05:00:00.000Z',
      expiresAt: '2026-10-27T05:15:00.000Z',
      environment: 'sandbox',
      customer: { name: 'Siti', phone: '0812' },
      attempt: 1,
    });
    expect(readPendingPayment()).toMatchObject({ orderId: 'KASIR-1', amount: 36000 });
    clearPendingPayment();
    expect(readPendingPayment()).toBeNull();
  });

  it('ignores malformed metadata', () => {
    localStorage.setItem(KEYS.pendingPayment, JSON.stringify({ amount: 10 }));
    expect(readPendingPayment()).toBeNull();
  });
});

describe('reconciliation records', () => {
  it('dedupes orphan watchers by order id', () => {
    addOrphanPayment({ orderId: 'A', amount: 1000, expiresAt: null, createdAt: 'x', reason: 'closed' });
    addOrphanPayment({ orderId: 'A', amount: 1000, expiresAt: null, createdAt: 'x', reason: 'closed' });
    expect(listOrphanPayments()).toHaveLength(1);
  });

  it('dedupes payment alerts and clears them', () => {
    const alert = {
      orderId: 'A',
      amount: 1000,
      transactionId: 'tx',
      paidAt: null,
      detectedAt: 'x',
    };
    expect(addPaymentAlert(alert)).toBe(true);
    expect(addPaymentAlert(alert)).toBe(false);
    expect(listPaymentAlerts()).toHaveLength(1);
    clearPaymentAlerts();
    expect(listPaymentAlerts()).toEqual([]);
  });
});

describe('print/reload guards', () => {
  it('merges flow records per order', () => {
    markFlow('ORDER-1', { printedAt: '2026-01-01T00:00:00.000Z' });
    markFlow('ORDER-1', { reloadedAt: '2026-01-01T00:00:01.000Z' });
    expect(readFlowRecord('ORDER-1')).toEqual({
      printedAt: '2026-01-01T00:00:00.000Z',
      reloadedAt: '2026-01-01T00:00:01.000Z',
    });
    expect(readFlowRecord('ORDER-2')).toEqual({});
  });
});
