import { describe, expect, it } from 'vitest';
import { buildSale, cartTotal, nextSaleNumber, reduceStock } from '../../src/state/sales';
import type { CartItem, Product, Sale } from '../../src/state/types';

const cart: CartItem[] = [
  { productId: 'p1', name: 'Kopi', price: 18000, qty: 2, unit: 'pcs' },
  { productId: 'p2', name: 'Roti', price: 10000, qty: 1, unit: 'pcs' },
];

const products: Product[] = [
  { id: 'p1', name: 'Kopi', category: 'Drink', price: 18000, stock: 5, unit: 'pcs' },
  { id: 'p2', name: 'Roti', category: 'Food', price: 10000, stock: 1, unit: 'pcs' },
  { id: 'p3', name: 'Teh', category: 'Drink', price: 8000, stock: 2, unit: 'pcs' },
];

const legacySale = (saleNumber: string): Sale => ({
  id: saleNumber,
  saleNumber,
  date: new Date().toISOString(),
  customerName: '',
  customerPhone: '',
  items: [{ productId: 'p1', name: 'Kopi', price: 18000, qty: 1 }],
  total: 18000,
  cashReceived: 18000,
  change: 0,
  paymentMethod: 'Cash',
  status: 'PAID',
});

describe('sale building', () => {
  it('computes totals and the existing schema', () => {
    expect(cartTotal(cart)).toBe(46000);
    const sale = buildSale({
      cart,
      customer: { name: ' Siti ', phone: '0812' },
      paymentMethod: 'Cash',
      cashReceived: 50000,
      sales: [],
    });
    expect(sale).toMatchObject({
      saleNumber: '#0001',
      customerName: 'Siti',
      total: 46000,
      cashReceived: 50000,
      change: 4000,
      paymentMethod: 'Cash',
      status: 'PAID',
    });
    expect(sale.items).toEqual([
      { productId: 'p1', name: 'Kopi', price: 18000, qty: 2 },
      { productId: 'p2', name: 'Roti', price: 10000, qty: 1 },
    ]);
  });

  it('continues the existing sale numbering', () => {
    expect(nextSaleNumber([legacySale('#0007'), legacySale('#0012')])).toBe('#0013');
  });

  it('carries Midtrans metadata only when provided', () => {
    const sale = buildSale({
      cart,
      customer: { name: '', phone: '' },
      paymentMethod: 'QRIS',
      cashReceived: 46000,
      sales: [],
      meta: {
        midtransOrderId: 'KASIR-1',
        midtransTransactionId: 'tx-1',
        paidAt: '2026-10-27T05:00:00.000Z',
      },
    });
    expect(sale.midtransOrderId).toBe('KASIR-1');
    expect(sale.change).toBe(0);
    const manual = buildSale({
      cart,
      customer: { name: '', phone: '' },
      paymentMethod: 'Card',
      cashReceived: 46000,
      sales: [],
    });
    expect(manual.midtransOrderId).toBeUndefined();
  });
});

describe('stock reduction', () => {
  it('reduces only sold products and never goes negative', () => {
    const next = reduceStock(products, cart);
    expect(next.find((product) => product.id === 'p1')?.stock).toBe(3);
    expect(next.find((product) => product.id === 'p2')?.stock).toBe(0);
    expect(next.find((product) => product.id === 'p3')?.stock).toBe(2);
    const clamped = reduceStock(
      [{ ...products[0], stock: 1 }],
      [{ productId: 'p1', qty: 5 }],
    );
    expect(clamped[0].stock).toBe(0);
  });
});
