import type { OrderCustomer, OrderItem } from './types.js';

export interface ChargeRequestValue {
  items: OrderItem[];
  amount: number;
  customer: OrderCustomer;
  idempotencyKey: string | null;
}

export type ValidationResult =
  | { ok: true; value: ChargeRequestValue }
  | { ok: false; message: string; errors: string[] };

const MAX_ITEMS = 100;
const MAX_ITEM_PRICE = 1_000_000_000;
const MAX_LINE_TOTAL = 1_000_000_000;
const MAX_GROSS = 1_000_000_000;
const MAX_QTY = 999;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function cleanString(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Validate a QRIS charge request coming from the browser. Rejects malformed carts,
 * non-integer or non-positive IDR amounts and any cart/amount mismatch.
 */
export function validateChargeRequest(body: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(body)) {
    return { ok: false, message: 'Request body must be a JSON object', errors: ['body'] };
  }

  const rawItems = body.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, message: 'Cart must contain at least one item', errors: ['items'] };
  }
  if (rawItems.length > MAX_ITEMS) {
    return { ok: false, message: `Cart cannot contain more than ${MAX_ITEMS} items`, errors: ['items'] };
  }

  const items: OrderItem[] = [];
  let computedTotal = 0;

  rawItems.forEach((raw, index) => {
    if (!isPlainObject(raw)) {
      errors.push(`items[${index}]`);
      return;
    }
    const name = cleanString(raw.name, 80);
    if (!name) {
      errors.push(`items[${index}].name`);
      return;
    }
    if (!isPositiveInt(raw.price) || raw.price > MAX_ITEM_PRICE) {
      errors.push(`items[${index}].price`);
      return;
    }
    if (!isPositiveInt(raw.qty) || raw.qty > MAX_QTY) {
      errors.push(`items[${index}].qty`);
      return;
    }
    const lineTotal = raw.price * raw.qty;
    if (!Number.isSafeInteger(lineTotal) || lineTotal > MAX_LINE_TOTAL) {
      errors.push(`items[${index}].total`);
      return;
    }
    computedTotal += lineTotal;
    items.push({
      productId: cleanString(raw.productId, 64) || name.slice(0, 64),
      name,
      price: raw.price,
      qty: raw.qty,
      unit: cleanString(raw.unit, 16) || null,
    });
  });

  if (errors.length > 0) {
    return { ok: false, message: 'Cart contains invalid items', errors };
  }
  if (computedTotal <= 0 || computedTotal > MAX_GROSS) {
    return { ok: false, message: 'Order total is out of range', errors: ['items'] };
  }

  if (!isPositiveInt(body.grossAmount)) {
    return {
      ok: false,
      message: 'grossAmount must be a positive integer in IDR',
      errors: ['grossAmount'],
    };
  }
  if (body.grossAmount !== computedTotal) {
    return {
      ok: false,
      message: 'grossAmount does not match the cart total',
      errors: ['grossAmount'],
    };
  }
  if (body.grossAmount > MAX_GROSS) {
    return { ok: false, message: 'Order total is out of range', errors: ['grossAmount'] };
  }

  let customer: OrderCustomer = { name: '', phone: '' };
  if (body.customer != null) {
    if (!isPlainObject(body.customer)) {
      return { ok: false, message: 'customer must be an object', errors: ['customer'] };
    }
    customer = {
      name: cleanString(body.customer.name, 60),
      phone: cleanString(body.customer.phone, 25),
    };
  }

  let idempotencyKey: string | null = null;
  if (body.idempotencyKey != null) {
    if (
      typeof body.idempotencyKey !== 'string' ||
      !/^[A-Za-z0-9_-]{8,80}$/.test(body.idempotencyKey)
    ) {
      return {
        ok: false,
        message: 'idempotencyKey must be 8-80 characters of [A-Za-z0-9_-]',
        errors: ['idempotencyKey'],
      };
    }
    idempotencyKey = body.idempotencyKey;
  }

  return { ok: true, value: { items, amount: computedTotal, customer, idempotencyKey } };
}

/** Deterministic cart fingerprint used to bind an order to an exact cart snapshot. */
export function hashCart(items: OrderItem[]): string {
  const canonical = items
    .map((item) => [item.productId, item.name, item.price, item.qty, item.unit ?? ''])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));
  return JSON.stringify(canonical);
}
