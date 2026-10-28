/** Normalized payment statuses understood by the browser. */
export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'expired'
  | 'canceled'
  | 'denied'
  | 'failed'
  | 'unknown';

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
  unit: string | null;
}

export interface OrderCustomer {
  name: string;
  phone: string;
}

/** Durable server-side payment record. Never returned verbatim to the browser. */
export interface OrderRecord {
  orderId: string;
  midtransTransactionId: string | null;
  amount: number;
  status: PaymentStatus;
  transactionStatus: string | null;
  fraudStatus: string | null;
  items: OrderItem[];
  customer: OrderCustomer;
  cartHash: string;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  paidAt: string | null;
  lastCheckedAt: number;
  environment: 'sandbox' | 'production';
  /** QRIS acquirer the charge was created with (`null` = Midtrans default). */
  acquirer: string | null;
  /** Internal only: authenticated Midtrans QR image URL. Never sent to the browser. */
  qrImageUrl: string | null;
  /** Internal only: last safe error code (no credentials / upstream bodies). */
  lastError: string | null;
}

/** Shape returned by POST /api/payments/qris. */
export interface PublicCharge {
  orderId: string;
  midtransOrderId: string;
  status: PaymentStatus;
  amount: number;
  expiresAt: string | null;
  transactionId: string | null;
  paidAt: string | null;
  qrImageUrl: string | null;
  environment: 'sandbox' | 'production';
}

/** Shape returned by GET /api/payments/:orderId/status. */
export interface PublicStatus {
  orderId: string;
  midtransOrderId: string;
  status: PaymentStatus;
  transactionStatus: string | null;
  amount: number;
  transactionId: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  environment: 'sandbox' | 'production';
  verified: boolean;
}
