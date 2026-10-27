/**
 * Orders currently tracked by an open cashier. The reconciliation watcher must
 * not raise a duplicate "late settlement" alert for these.
 */
const activeOrders = new Set<string>();

export function markOrderActive(orderId: string): void {
  activeOrders.add(orderId);
}

export function unmarkOrderActive(orderId: string): void {
  activeOrders.delete(orderId);
}

export function isOrderActive(orderId: string): boolean {
  return activeOrders.has(orderId);
}
