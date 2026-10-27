import { buildSale, reduceStock } from '../state/sales';
import type { CartItem, Customer, Product, Sale } from '../state/types';
import type { QrisStatus } from './api';
import { snapshotKey, type CartSnapshot } from './snapshot';

export interface ActiveOrder {
  orderId: string;
  amount: number;
  snapshotKey: string;
}

export interface FinalizeContext {
  /** Cart snapshot the cashier is showing right now. */
  snapshot: CartSnapshot;
  customer: Customer;
  products: Product[];
  sales: Sale[];
  /** Pending order the UI believes is active (never taken from the server response). */
  order: ActiveOrder | null;
  /** Server-verified status response. */
  payment: QrisStatus;
}

export type FinalizeRejection =
  | 'not_paid'
  | 'unverified'
  | 'no_active_order'
  | 'stale_order'
  | 'amount_mismatch'
  | 'cart_mismatch'
  | 'empty_cart';

export type FinalizeResult =
  | { type: 'completed'; sale: Sale; products: Product[] }
  | { type: 'duplicate'; sale: Sale | null }
  | { type: 'rejected'; reason: FinalizeRejection };

/** In-session ledger so duplicate polling/webhook responses cannot double-commit. */
const finalizedOrders = new Set<string>();

export function resetFinalizedCache(): void {
  finalizedOrders.clear();
}

export function wasFinalizedInSession(orderId: string): boolean {
  return finalizedOrders.has(orderId);
}

export function findSaleForOrder(sales: Sale[], orderId: string): Sale | null {
  return sales.find((sale) => sale.midtransOrderId === orderId) ?? null;
}

function snapshotToCart(snapshot: CartSnapshot): CartItem[] {
  return snapshot.items.map((item) => ({
    productId: item.productId,
    name: item.name,
    price: item.price,
    qty: item.qty,
    unit: item.unit,
  }));
}

/**
 * Single guarded completion path for a verified QRIS payment.
 *
 * Runs at most once per Midtrans order id (session ledger + persisted sale lookup)
 * and re-checks the order id, the amount and the cart snapshot before committing.
 */
export function finalizeQrisSale(context: FinalizeContext): FinalizeResult {
  const { payment, order, snapshot } = context;

  if (payment.status !== 'paid') return { type: 'rejected', reason: 'not_paid' };
  if (payment.verified !== true) return { type: 'rejected', reason: 'unverified' };
  if (!order) return { type: 'rejected', reason: 'no_active_order' };
  if (payment.orderId !== order.orderId) return { type: 'rejected', reason: 'stale_order' };
  if (payment.amount !== order.amount) return { type: 'rejected', reason: 'amount_mismatch' };
  if (order.snapshotKey !== snapshotKey(snapshot)) {
    return { type: 'rejected', reason: 'cart_mismatch' };
  }
  if (payment.amount !== snapshot.amount) return { type: 'rejected', reason: 'amount_mismatch' };
  if (snapshot.items.length === 0) return { type: 'rejected', reason: 'empty_cart' };

  const existing = findSaleForOrder(context.sales, payment.orderId);
  if (existing || finalizedOrders.has(payment.orderId)) {
    finalizedOrders.add(payment.orderId);
    return { type: 'duplicate', sale: existing };
  }

  const sale = buildSale({
    cart: snapshotToCart(snapshot),
    customer: context.customer,
    paymentMethod: 'QRIS',
    cashReceived: snapshot.amount,
    sales: context.sales,
    meta: {
      midtransOrderId: payment.orderId,
      midtransTransactionId: payment.transactionId ?? undefined,
      paidAt: payment.paidAt ?? new Date().toISOString(),
    },
  });

  const products = reduceStock(context.products, snapshot.items);
  finalizedOrders.add(payment.orderId);
  return { type: 'completed', sale, products };
}
