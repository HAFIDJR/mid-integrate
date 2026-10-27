import type { CartItem } from '../state/types';

export interface SnapshotItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
  unit: string;
}

/** Immutable cart snapshot bound to a QRIS charge. */
export interface CartSnapshot {
  items: SnapshotItem[];
  amount: number;
}

const isPositiveInt = (value: number): boolean =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Returns null when the cart cannot be charged (empty, zero/fractional IDR, ...). */
export function buildCartSnapshot(cart: CartItem[]): CartSnapshot | null {
  if (!Array.isArray(cart) || cart.length === 0) return null;
  const items: SnapshotItem[] = [];
  for (const item of cart) {
    const name = String(item?.name ?? '').trim();
    if (!name) return null;
    if (!isPositiveInt(item.price) || !isPositiveInt(item.qty)) return null;
    if (!Number.isSafeInteger(item.price * item.qty)) return null;
    items.push({
      productId: String(item.productId ?? '') || name,
      name,
      price: item.price,
      qty: item.qty,
      unit: String(item.unit ?? ''),
    });
  }
  const amount = items.reduce((total, item) => total + item.price * item.qty, 0);
  if (!isPositiveInt(amount)) return null;
  return { items, amount };
}

export function snapshotKey(snapshot: CartSnapshot): string {
  return JSON.stringify(
    snapshot.items
      .map((item) => [item.productId, item.name, item.price, item.qty, item.unit])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1]))),
  );
}

export function cartSnapshotKey(cart: CartItem[]): string | null {
  const snapshot = buildCartSnapshot(cart);
  return snapshot ? snapshotKey(snapshot) : null;
}

export const sameSnapshot = (a: CartSnapshot, b: CartSnapshot): boolean =>
  snapshotKey(a) === snapshotKey(b) && a.amount === b.amount;
