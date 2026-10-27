export type ThemeMode = 'light' | 'dark';
export type PaymentMethod = 'Cash' | 'QRIS' | 'Card';
export type ViewId = 'dashboard' | 'products' | 'reports' | 'settings';

export interface StoreSettings {
  logo: string;
  storeName: string;
  ownerName: string;
  businessType: string;
  theme: ThemeMode;
  /** Legacy static QRIS code from the vanilla app. Kept only so old data stays readable. */
  qris?: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  unit: string;
  photoUrl?: string;
  photo?: string;
  createdAt?: number;
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  unit: string;
  photo?: string;
  qty: number;
}

export interface Customer {
  name: string;
  phone: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

export interface Sale {
  id: string;
  saleNumber: string;
  date: string;
  customerName: string;
  customerPhone: string;
  items: SaleItem[];
  total: number;
  cashReceived: number;
  change: number;
  paymentMethod: PaymentMethod;
  status: 'PAID';
  /** Midtrans order id (set only for verified QRIS payments). */
  midtransOrderId?: string;
  /** Midtrans transaction id (set only for verified QRIS payments). */
  midtransTransactionId?: string;
  /** Verified payment timestamp reported by Midtrans. */
  paidAt?: string;
  /** Legacy/extra fields from older records stay untouched. */
  [key: string]: unknown;
}

export interface SaleDraft {
  step: 1 | 2 | 3;
  q: string;
  cat: string;
  cart: CartItem[];
  customer: Customer;
  pay: PaymentMethod;
  cash: string;
}

export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'expired'
  | 'canceled'
  | 'denied'
  | 'failed'
  | 'unknown';

export type ToastKind = 'ok' | 'warn' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  kind: ToastKind;
  phase: 'enter' | 'in' | 'out';
}

export interface ConfirmOptions {
  title: string;
  msg: string;
  ok?: string;
  danger?: boolean;
}

export interface PaymentConfig {
  provider: 'midtrans';
  configured: boolean;
  environment: 'sandbox' | 'production';
  qrisExpiryMinutes: number;
}
