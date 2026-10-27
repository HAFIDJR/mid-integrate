import { createHash, timingSafeEqual } from 'node:crypto';
import type { OrderCustomer, OrderItem, PaymentStatus } from './types.js';
import type { MidtransConfig } from './config.js';

export class MidtransError extends Error {
  code:
    | 'not_configured'
    | 'timeout'
    | 'network'
    | 'http'
    | 'invalid_response'
    | 'not_found';

  constructor(code: MidtransError['code'], message: string) {
    super(message);
    this.name = 'MidtransError';
    this.code = code;
  }
}

/**
 * Map a Midtrans `transaction_status` (+ `fraud_status`) to the app's normalized status.
 *
 * Only `settlement` (a server-verified, funds-settled QRIS transaction) is considered paid.
 * `capture` is card-only in Midtrans and deliberately stays non-paid here; the app never
 * creates card charges, so treating it as pending is the conservative choice.
 */
export function mapTransactionStatus(
  transactionStatus: unknown,
  _fraudStatus?: unknown,
): PaymentStatus {
  const raw = typeof transactionStatus === 'string' ? transactionStatus.trim().toLowerCase() : '';
  switch (raw) {
    case 'settlement':
      return 'paid';
    case 'pending':
    case 'capture':
    case 'authorize':
      return 'pending';
    case 'expire':
      return 'expired';
    case 'cancel':
      return 'canceled';
    case 'deny':
      return 'denied';
    case 'failure':
    case 'refund':
    case 'partial_refund':
    case 'chargeback':
    case 'partial_chargeback':
      return 'failed';
    default:
      return 'unknown';
  }
}

/**
 * Parse an IDR amount sent by Midtrans ("55000.00") into an integer rupiah value.
 * Returns null for fractional cents, negative numbers, junk, or unsafe magnitudes.
 */
export function parseIdrAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    return value;
  }
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  const match = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const fraction = match[2] ?? '';
  if (fraction.replace(/0/g, '').length > 0) return null; // IDR has no sub-unit
  const amount = Number.parseInt(match[1], 10);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  return amount;
}

/** SHA-512 of `order_id + status_code + gross_amount + ServerKey` (Midtrans documented format). */
export function buildNotificationSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
): string {
  return createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`, 'utf8')
    .digest('hex');
}

export interface NotificationSignatureFields {
  order_id: unknown;
  status_code: unknown;
  gross_amount: unknown;
  signature_key: unknown;
}

/** Constant-time comparison of a Midtrans notification signature. */
export function verifyMidtransSignature(
  fields: NotificationSignatureFields,
  serverKey: string,
): boolean {
  const { order_id, status_code, gross_amount, signature_key } = fields;
  if (
    typeof order_id !== 'string' ||
    typeof status_code !== 'string' ||
    typeof gross_amount !== 'string' ||
    typeof signature_key !== 'string'
  ) {
    return false;
  }
  if (!serverKey) return false;
  const received = signature_key.trim().toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(received)) return false;
  const expected = buildNotificationSignature(order_id, status_code, gross_amount, serverKey);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(received, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* -------------------------------------------------------------------------- */
/* Midtrans Core API client                                                   */
/* -------------------------------------------------------------------------- */

export interface ChargeQrisInput {
  orderId: string;
  amount: number;
  items: OrderItem[];
  customer: OrderCustomer;
  expiryMinutes: number;
}

export interface ChargeQrisResult {
  orderId: string;
  transactionId: string | null;
  rawStatus: string;
  fraudStatus: string | null;
  amount: number;
  qrImageUrl: string | null;
  statusCode: string;
  transactionTime: string | null;
  expiryTime: string | null;
}

export interface StatusResult {
  found: boolean;
  orderId?: string;
  transactionId?: string | null;
  rawStatus?: string;
  fraudStatus?: string | null;
  amount?: number;
  statusCode?: string;
  transactionTime?: string | null;
  expiryTime?: string | null;
}

export interface QrImageResult {
  data: Buffer;
  contentType: string;
}

export interface MidtransGateway {
  isConfigured(): boolean;
  chargeQris(input: ChargeQrisInput): Promise<ChargeQrisResult>;
  getStatus(orderId: string): Promise<StatusResult>;
  getQrImage(url: string): Promise<QrImageResult>;
}

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

function trimName(value: string, max = 50): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) : clean;
}

function parseMidtransTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  // Midtrans timestamps are Western Indonesian Time (UTC+7), e.g. "2026-10-27 12:34:56".
  const parsed = new Date(trimmed.replace(' ', 'T') + (trimmed.includes('+') ? '' : '+07:00'));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export class HttpMidtransGateway implements MidtransGateway {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(
    private readonly config: MidtransConfig,
    private readonly fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
    private readonly timeoutMs = 12000,
  ) {
    this.baseUrl = config.isProduction
      ? 'https://api.midtrans.com'
      : 'https://api.sandbox.midtrans.com';
    const token = Buffer.from(`${config.serverKey}:`, 'utf8').toString('base64');
    this.authHeader = `Basic ${token}`;
  }

  isConfigured(): boolean {
    return this.config.serverKey.length > 0;
  }

  private async request(path: string, init: { method?: string; body?: string } = {}) {
    if (!this.isConfigured()) {
      throw new MidtransError('not_configured', 'Midtrans server key is not configured');
    }
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: this.authHeader,
        },
        ...(init.body ? { body: init.body } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const name = (error as { name?: string } | null)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new MidtransError('timeout', 'Midtrans request timed out');
      }
      throw new MidtransError('network', 'Could not reach Midtrans');
    }
    return response;
  }

  private async readJson(response: {
    status: number;
    text(): Promise<string>;
  }): Promise<Record<string, unknown>> {
    let text = '';
    try {
      text = await response.text();
    } catch {
      throw new MidtransError('invalid_response', 'Unreadable Midtrans response');
    }
    if (!text) return {};
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('not an object');
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new MidtransError('invalid_response', 'Malformed Midtrans response');
    }
  }

  async chargeQris(input: ChargeQrisInput): Promise<ChargeQrisResult> {
    const payload: Record<string, unknown> = {
      payment_type: 'qris',
      transaction_details: {
        order_id: input.orderId,
        gross_amount: input.amount,
      },
      item_details: input.items.map((item) => ({
        id: trimName(item.productId || item.name, 50),
        name: trimName(item.name, 50),
        price: item.price,
        quantity: item.qty,
      })),
      custom_expiry: {
        expiry_duration: input.expiryMinutes,
        unit: 'minute',
      },
    };
    const customer: Record<string, string> = {};
    if (input.customer.name) customer.first_name = trimName(input.customer.name, 50);
    if (input.customer.phone) customer.phone = trimName(input.customer.phone, 20);
    if (Object.keys(customer).length > 0) payload.customer_details = customer;
    if (this.config.acquirer) payload.qris = { acquirer: this.config.acquirer };

    const response = await this.request('/v2/charge', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const body = await this.readJson(response);

    if (!response.ok || typeof body.status_code !== 'string' || !body.status_code.startsWith('2')) {
      throw new MidtransError(
        'http',
        `Midtrans rejected the QRIS charge (${String(body.status_code ?? response.status)})`,
      );
    }
    if (body.order_id !== input.orderId) {
      throw new MidtransError('invalid_response', 'Midtrans returned a different order id');
    }
    const parsedAmount = parseIdrAmount(body.gross_amount);
    if (parsedAmount !== input.amount) {
      throw new MidtransError('invalid_response', 'Midtrans returned a different amount');
    }
    const rawStatus = typeof body.transaction_status === 'string' ? body.transaction_status : '';
    if (!rawStatus) {
      throw new MidtransError('invalid_response', 'Midtrans response is missing transaction_status');
    }

    let qrImageUrl: string | null = null;
    if (Array.isArray(body.actions)) {
      for (const action of body.actions) {
        if (
          action &&
          typeof action === 'object' &&
          (action as Record<string, unknown>).name === 'generate-qr-code' &&
          typeof (action as Record<string, unknown>).url === 'string'
        ) {
          qrImageUrl = (action as { url: string }).url;
          break;
        }
      }
    }
    if (!qrImageUrl) {
      throw new MidtransError('invalid_response', 'Midtrans did not return a QR image URL');
    }

    return {
      orderId: input.orderId,
      transactionId: typeof body.transaction_id === 'string' ? body.transaction_id : null,
      rawStatus,
      fraudStatus: typeof body.fraud_status === 'string' ? body.fraud_status : null,
      amount: parsedAmount,
      qrImageUrl,
      statusCode: body.status_code,
      transactionTime: typeof body.transaction_time === 'string' ? body.transaction_time : null,
      expiryTime: typeof body.expiry_time === 'string' ? body.expiry_time : null,
    };
  }

  async getStatus(orderId: string): Promise<StatusResult> {
    const response = await this.request(`/v2/${encodeURIComponent(orderId)}/status`);
    const body = await this.readJson(response);
    const statusCode = typeof body.status_code === 'string' ? body.status_code : '';
    if (response.status === 404 || statusCode === '404' || body.transaction_status === undefined) {
      return { found: false, statusCode: statusCode || String(response.status) };
    }
    if (body.order_id !== orderId) {
      throw new MidtransError('invalid_response', 'Midtrans returned a different order id');
    }
    const amount = parseIdrAmount(body.gross_amount);
    if (amount == null) {
      throw new MidtransError('invalid_response', 'Midtrans status has no usable gross_amount');
    }
    return {
      found: true,
      orderId,
      transactionId: typeof body.transaction_id === 'string' ? body.transaction_id : null,
      rawStatus: typeof body.transaction_status === 'string' ? body.transaction_status : '',
      fraudStatus: typeof body.fraud_status === 'string' ? body.fraud_status : null,
      amount,
      statusCode,
      transactionTime: typeof body.transaction_time === 'string' ? body.transaction_time : null,
      expiryTime: typeof body.expiry_time === 'string' ? body.expiry_time : null,
    };
  }

  async getQrImage(url: string): Promise<QrImageResult> {
    // Only fetch URLs Midtrans itself returned (host allowlist) to avoid SSRF.
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new MidtransError('invalid_response', 'Invalid QR image URL');
    }
    const allowedHosts = ['api.midtrans.com', 'api.sandbox.midtrans.com'];
    if (parsed.protocol !== 'https:' || !allowedHosts.includes(parsed.hostname)) {
      throw new MidtransError('invalid_response', 'Untrusted QR image URL');
    }
    const response = await this.request(parsed.pathname + parsed.search);
    if (!response.ok) throw new MidtransError('http', 'Could not load the Midtrans QR image');
    const contentType = response.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) {
      throw new MidtransError('invalid_response', 'Midtrans QR response was not an image');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > 1_500_000) {
      throw new MidtransError('invalid_response', 'Unexpected QR image payload');
    }
    return { data: buffer, contentType };
  }
}

/** Convert a Midtrans WIB timestamp into ISO-8601 (used for verified paidAt values). */
export function normalizeMidtransTimestamp(value: unknown): string | null {
  return parseMidtransTime(value);
}
