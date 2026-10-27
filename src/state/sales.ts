import { uid } from '../lib/format';
import type { CartItem, Customer, PaymentMethod, Product, Sale, SaleItem } from './types';

export const cartTotal = (cart: CartItem[]): number =>
  cart.reduce((total, item) => total + item.price * item.qty, 0);

export function nextSaleNumber(sales: Sale[]): string {
  const maxNo = sales.reduce((max, sale) => {
    const parsed = Number.parseInt(String(sale.saleNumber ?? '').replace(/\D/g, ''), 10) || 0;
    return Math.max(max, parsed);
  }, 0);
  return '#' + String(maxNo + 1).padStart(4, '0');
}

export interface BuildSaleInput {
  cart: CartItem[];
  customer: Customer;
  paymentMethod: PaymentMethod;
  cashReceived: number;
  sales: Sale[];
  now?: Date;
  meta?: Partial<Sale>;
}

/** Build a sale using the exact schema the vanilla app persisted. */
export function buildSale({
  cart,
  customer,
  paymentMethod,
  cashReceived,
  sales,
  now = new Date(),
  meta,
}: BuildSaleInput): Sale {
  const total = cartTotal(cart);
  const items: SaleItem[] = cart.map((item) => ({
    productId: item.productId,
    name: item.name,
    price: item.price,
    qty: item.qty,
  }));
  return {
    id: uid(),
    saleNumber: nextSaleNumber(sales),
    date: now.toISOString(),
    customerName: customer.name.trim(),
    customerPhone: customer.phone.trim(),
    items,
    total,
    cashReceived,
    change: cashReceived - total,
    paymentMethod,
    status: 'PAID',
    ...meta,
  };
}

/** Reduce stock for the sold quantities, exactly once per committed sale. */
export function reduceStock(products: Product[], items: Array<{ productId: string; qty: number }>): Product[] {
  return products.map((product) => {
    const sold = items.find((item) => item.productId === product.id);
    if (!sold) return product;
    return { ...product, stock: Math.max(0, product.stock - sold.qty) };
  });
}
