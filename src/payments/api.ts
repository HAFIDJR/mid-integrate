import type { PaymentConfig, PaymentStatus } from '../state/types';
import type { SnapshotItem } from './snapshot';

export type PaymentErrorCode =
  | 'aborted'
  | 'timeout'
  | 'network'
  | 'malformed_response'
  | 'invalid_request'
  | 'midtrans_not_configured'
  | 'midtrans_error'
  | 'rate_limited'
  | 'order_not_found'
  | 'not_found'
  | 'http_error';

export class PaymentApiError extends Error {
  readonly code: PaymentErrorCode;
  readonly status?: number;
  /** Present when a charge attempt may still exist upstream (recoverable). */
  readonly orderId?: string;

  constructor(code: PaymentErrorCode, message: string, options: { status?: number; orderId?: string } = {}) {
    super(message);
    this.name = 'PaymentApiError';
    this.code = code;
    if (options.status !== undefined) this.status = options.status;
    if (options.orderId !== undefined) this.orderId = options.orderId;
  }
}

export interface QrisCharge {
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

export interface QrisStatus {
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

export interface CreateChargePayload {
  items: SnapshotItem[];
  grossAmount: number;
  customer: { name: string; phone: string };
  idempotencyKey: string;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const STATUSES: PaymentStatus[] = [
  'pending',
  'paid',
  'expired',
  'canceled',
  'denied',
  'failed',
  'unknown',
];

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const positiveInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;

async function requestJson(
  path: string,
  init: RequestInit,
  options: RequestOptions = {},
): Promise<unknown> {
  const { timeoutMs = 15000, signal, fetchImpl = fetch } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      throw new PaymentApiError('aborted', 'Request cancelled');
    }
    signal.addEventListener('abort', forwardAbort, { once: true });
  }

  let response: Response;
  try {
    response = await fetchImpl(path, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch (error) {
    if (signal?.aborted) throw new PaymentApiError('aborted', 'Request cancelled');
    if (timedOut) throw new PaymentApiError('timeout', 'The payment service took too long to respond');
    const name = (error as { name?: string } | null)?.name;
    if (name === 'AbortError') throw new PaymentApiError('aborted', 'Request cancelled');
    throw new PaymentApiError('network', 'Could not reach the payment service');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }

  const rawText = await response.text().catch(() => '');
  let body: unknown = null;
  if (rawText) {
    try {
      body = JSON.parse(rawText);
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    const record = asRecord(body);
    const code = (asString(record?.error) ?? 'http_error') as PaymentErrorCode;
    const message = asString(record?.message) ?? 'The payment service returned an error';
    throw new PaymentApiError(code, message, {
      status: response.status,
      ...(asString(record?.orderId) ? { orderId: asString(record?.orderId) as string } : {}),
    });
  }
  return body;
}

function parseEnvironment(value: unknown): 'sandbox' | 'production' {
  return value === 'production' ? 'production' : 'sandbox';
}

function parseBase(raw: unknown): Record<string, unknown> {
  const record = asRecord(raw);
  if (!record) throw new PaymentApiError('malformed_response', 'Malformed payment response');
  const orderId = asString(record.orderId);
  const amount = positiveInt(record.amount);
  const status = asString(record.status) as PaymentStatus | null;
  if (!orderId || amount === null || !status || !STATUSES.includes(status)) {
    throw new PaymentApiError('malformed_response', 'Malformed payment response');
  }
  return record;
}

export function parseChargeResponse(raw: unknown): QrisCharge {
  const record = parseBase(raw);
  return {
    orderId: record.orderId as string,
    midtransOrderId: asString(record.midtransOrderId) ?? (record.orderId as string),
    status: record.status as PaymentStatus,
    amount: record.amount as number,
    expiresAt: asString(record.expiresAt),
    transactionId: asString(record.transactionId),
    paidAt: asString(record.paidAt),
    qrImageUrl: asString(record.qrImageUrl),
    environment: parseEnvironment(record.environment),
  };
}

export function parseStatusResponse(raw: unknown): QrisStatus {
  const record = parseBase(raw);
  return {
    orderId: record.orderId as string,
    midtransOrderId: asString(record.midtransOrderId) ?? (record.orderId as string),
    status: record.status as PaymentStatus,
    transactionStatus: asString(record.transactionStatus),
    amount: record.amount as number,
    transactionId: asString(record.transactionId),
    paidAt: asString(record.paidAt),
    expiresAt: asString(record.expiresAt),
    environment: parseEnvironment(record.environment),
    verified: record.verified === true && record.status === 'paid',
  };
}

export function parsePaymentConfig(raw: unknown): PaymentConfig {
  const record = asRecord(raw);
  if (!record) throw new PaymentApiError('malformed_response', 'Malformed payment configuration');
  return {
    provider: 'midtrans',
    configured: record.configured === true,
    environment: parseEnvironment(record.environment),
    qrisExpiryMinutes:
      typeof record.qrisExpiryMinutes === 'number' && record.qrisExpiryMinutes > 0
        ? record.qrisExpiryMinutes
        : 15,
  };
}

export async function createQrisCharge(
  payload: CreateChargePayload,
  options: RequestOptions = {},
): Promise<QrisCharge> {
  const body = await requestJson(
    '/api/payments/qris',
    { method: 'POST', body: JSON.stringify(payload) },
    options,
  );
  return parseChargeResponse(body);
}

export async function fetchQrisStatus(
  orderId: string,
  options: RequestOptions = {},
): Promise<QrisStatus> {
  const body = await requestJson(
    `/api/payments/${encodeURIComponent(orderId)}/status`,
    { method: 'GET' },
    { timeoutMs: 8000, ...options },
  );
  return parseStatusResponse(body);
}

export async function fetchPaymentConfig(options: RequestOptions = {}): Promise<PaymentConfig> {
  const body = await requestJson('/api/payments/config', { method: 'GET' }, { timeoutMs: 6000, ...options });
  return parsePaymentConfig(body);
}

export interface PaymentApi {
  createQrisCharge: typeof createQrisCharge;
  fetchQrisStatus: typeof fetchQrisStatus;
  fetchPaymentConfig: typeof fetchPaymentConfig;
}
