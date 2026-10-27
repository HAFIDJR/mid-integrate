import { seedProducts } from '../lib/constants';
import type { Product, Sale, StoreSettings } from './types';

/** Existing keys from the vanilla app — never renamed, so users keep their data. */
export const KEYS = {
  onboarded: 'kasir_onboarded',
  store: 'kasir_store',
  products: 'kasir_products',
  sales: 'kasir_sales',
  // New keys (additive, safe to be absent).
  pendingPayment: 'kasir_pending_payment',
  orphanPayments: 'kasir_orphan_payments',
  paymentAlerts: 'kasir_payment_alerts',
  qrisFlow: 'kasir_qris_flow',
} as const;

export const defaultStore = (): StoreSettings => ({
  logo: '☕',
  storeName: 'Kedai Senja',
  ownerName: 'Budi Santoso',
  businessType: 'Coffee Shop',
  theme: 'light',
  qris: '',
});

function resolveStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = '__kasir_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

let cachedStorage: Storage | null | undefined;

export function storage(): Storage | null {
  if (cachedStorage === undefined) cachedStorage = resolveStorage();
  return cachedStorage;
}

export function readJSON<T>(key: string, fallback: T): T {
  const store = storage();
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

/* ------------------------------ normalizers ------------------------------ */

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const num = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function normalizeStore(raw: unknown): StoreSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const base = defaultStore();
  return {
    ...base,
    ...value,
    logo: str(value.logo, base.logo),
    storeName: str(value.storeName, base.storeName) || base.storeName,
    ownerName: str(value.ownerName, base.ownerName) || base.ownerName,
    businessType: str(value.businessType, base.businessType) || base.businessType,
    theme: value.theme === 'dark' ? 'dark' : 'light',
    qris: str(value.qris, ''),
  } as StoreSettings;
}

export function normalizeProduct(raw: unknown): Product | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const id = str(value.id);
  const name = str(value.name).trim();
  if (!id || !name) return null;
  return {
    ...value,
    id,
    name,
    category: str(value.category, 'Other') || 'Other',
    price: Math.max(0, Math.round(num(value.price))),
    stock: Math.max(0, Math.round(num(value.stock))),
    unit: str(value.unit, 'pcs') || 'pcs',
    ...(typeof value.photoUrl === 'string' ? { photoUrl: value.photoUrl } : {}),
    ...(typeof value.photo === 'string' ? { photo: value.photo } : {}),
    ...(typeof value.createdAt === 'number' ? { createdAt: value.createdAt } : {}),
  };
}

export function normalizeSale(raw: unknown): Sale | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const id = str(value.id);
  const date = str(value.date);
  if (!id || !date) return null;
  const items = Array.isArray(value.items)
    ? value.items
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const record = item as Record<string, unknown>;
          const name = str(record.name);
          const price = Math.round(num(record.price));
          const qty = Math.round(num(record.qty));
          if (!name || price <= 0 || qty <= 0) return null;
          return {
            ...record,
            productId: str(record.productId),
            name,
            price,
            qty,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    : [];
  if (items.length === 0) return null;
  const paymentMethod =
    value.paymentMethod === 'QRIS' || value.paymentMethod === 'Card' ? value.paymentMethod : 'Cash';
  return {
    ...value,
    id,
    saleNumber: str(value.saleNumber) || `#${id.slice(-4).toUpperCase()}`,
    date,
    customerName: str(value.customerName),
    customerPhone: str(value.customerPhone),
    items,
    total: Math.round(num(value.total, items.reduce((a, i) => a + i.price * i.qty, 0))),
    cashReceived: Math.round(num(value.cashReceived)),
    change: Math.round(num(value.change)),
    paymentMethod,
    status: 'PAID',
    ...(typeof value.midtransOrderId === 'string'
      ? { midtransOrderId: value.midtransOrderId }
      : {}),
    ...(typeof value.midtransTransactionId === 'string'
      ? { midtransTransactionId: value.midtransTransactionId }
      : {}),
    ...(typeof value.paidAt === 'string' ? { paidAt: value.paidAt } : {}),
  } as Sale;
}

export interface InitialState {
  onboarded: boolean;
  store: StoreSettings;
  products: Product[];
  sales: Sale[];
}

/** Load persisted state, tolerating old/partial records without wiping anything. */
export function loadInitialState(): InitialState {
  const store = storage();
  const onboarded = readJSON<unknown>(KEYS.onboarded, false) === true;
  const persistedStore = normalizeStore(readJSON<unknown>(KEYS.store, null));
  const rawProducts = readJSON<unknown>(KEYS.products, null);
  const rawSales = readJSON<unknown>(KEYS.sales, []);

  let products: Product[];
  if (Array.isArray(rawProducts)) {
    products = rawProducts
      .map(normalizeProduct)
      .filter((product): product is Product => product !== null);
  } else {
    products = seedProducts();
    if (store) writeJSON(KEYS.products, products);
  }

  const sales = Array.isArray(rawSales)
    ? rawSales.map(normalizeSale).filter((sale): sale is Sale => sale !== null)
    : [];

  return {
    onboarded,
    store: persistedStore ?? defaultStore(),
    products,
    sales,
  };
}

/* --------------------------- payment metadata ---------------------------- */

export interface PendingPayment {
  orderId: string;
  amount: number;
  snapshotKey: string;
  createdAt: string;
  expiresAt: string | null;
  environment: 'sandbox' | 'production' | null;
  customer: { name: string; phone: string };
  /** Incremented per create attempt; lets the UI ignore stale metadata. */
  attempt: number;
}

export const readPendingPayment = (): PendingPayment | null => {
  const value = readJSON<unknown>(KEYS.pendingPayment, null);
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.orderId !== 'string' || !record.orderId) return null;
  const amount = Math.round(num(record.amount));
  if (amount <= 0) return null;
  return {
    orderId: record.orderId,
    amount,
    snapshotKey: str(record.snapshotKey),
    createdAt: str(record.createdAt),
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : null,
    environment:
      record.environment === 'sandbox' || record.environment === 'production'
        ? record.environment
        : null,
    customer: {
      name: str((record.customer as Record<string, unknown> | undefined)?.name),
      phone: str((record.customer as Record<string, unknown> | undefined)?.phone),
    },
    attempt: Math.max(0, Math.round(num(record.attempt))),
  };
};

export const writePendingPayment = (pending: PendingPayment): void => {
  writeJSON(KEYS.pendingPayment, pending);
};

export const clearPendingPayment = (): void => {
  removeKey(KEYS.pendingPayment);
};

export interface OrphanPayment {
  orderId: string;
  amount: number;
  expiresAt: string | null;
  createdAt: string;
  reason: string;
}

const ORPHAN_LIMIT = 10;

export function listOrphanPayments(): OrphanPayment[] {
  const value = readJSON<unknown>(KEYS.orphanPayments, []);
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      if (typeof record.orderId !== 'string' || !record.orderId) return null;
      return {
        orderId: record.orderId,
        amount: Math.round(num(record.amount)),
        expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : null,
        createdAt: str(record.createdAt, new Date().toISOString()),
        reason: str(record.reason, 'abandoned'),
      };
    })
    .filter((entry): entry is OrphanPayment => entry !== null);
}

export function addOrphanPayment(entry: OrphanPayment): void {
  const list = listOrphanPayments().filter((item) => item.orderId !== entry.orderId);
  list.push(entry);
  writeJSON(KEYS.orphanPayments, list.slice(-ORPHAN_LIMIT));
}

export function removeOrphanPayment(orderId: string): void {
  writeJSON(
    KEYS.orphanPayments,
    listOrphanPayments().filter((item) => item.orderId !== orderId),
  );
}

export interface PaymentAlert {
  orderId: string;
  amount: number;
  transactionId: string | null;
  paidAt: string | null;
  detectedAt: string;
}

export function listPaymentAlerts(): PaymentAlert[] {
  const value = readJSON<unknown>(KEYS.paymentAlerts, []);
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      if (typeof record.orderId !== 'string' || !record.orderId) return null;
      return {
        orderId: record.orderId,
        amount: Math.round(num(record.amount)),
        transactionId: typeof record.transactionId === 'string' ? record.transactionId : null,
        paidAt: typeof record.paidAt === 'string' ? record.paidAt : null,
        detectedAt: str(record.detectedAt, new Date().toISOString()),
      };
    })
    .filter((entry): entry is PaymentAlert => entry !== null);
}

export function addPaymentAlert(alert: PaymentAlert): boolean {
  const list = listPaymentAlerts();
  if (list.some((item) => item.orderId === alert.orderId)) return false;
  writeJSON(KEYS.paymentAlerts, [...list, alert].slice(-25));
  return true;
}

export function clearPaymentAlerts(): void {
  writeJSON(KEYS.paymentAlerts, []);
}

/* ----------------------------- print / reload ---------------------------- */

export interface FlowRecord {
  printedAt?: string;
  reloadedAt?: string;
}

interface FlowLog {
  [orderId: string]: FlowRecord;
}

function readFlowLog(): FlowLog {
  const value = readJSON<unknown>(KEYS.qrisFlow, {});
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as FlowLog;
}

export function readFlowRecord(orderId: string): FlowRecord {
  return readFlowLog()[orderId] ?? {};
}

export function markFlow(orderId: string, patch: FlowRecord): void {
  const log = readFlowLog();
  log[orderId] = { ...(log[orderId] ?? {}), ...patch };
  const entries = Object.entries(log).slice(-50);
  writeJSON(KEYS.qrisFlow, Object.fromEntries(entries));
}
