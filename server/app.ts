import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import type { ServerConfig } from './config.js';
import type { MidtransGateway } from './midtrans.js';
import {
  MidtransError,
  mapTransactionStatus,
  normalizeMidtransTimestamp,
  parseIdrAmount,
  verifyMidtransSignature,
} from './midtrans.js';
import type { OrderStore } from './orders.js';
import type { OrderRecord, PublicCharge, PublicStatus } from './types.js';
import { hashCart, validateChargeRequest } from './validation.js';

export interface AppDependencies {
  config: ServerConfig;
  store: OrderStore;
  gateway: MidtransGateway;
  now?: () => Date;
  /** Minimum delay between two upstream status checks for the same order. */
  statusRefreshMs?: number;
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_CHARGES = 40;

/** Raw Midtrans statuses used by the dev-only simulation endpoint. */
const SIMULATED_OUTCOMES: Record<
  string,
  { rawStatus: string; fraudStatus: string | null }
> = {
  paid: { rawStatus: 'settlement', fraudStatus: 'accept' },
  expired: { rawStatus: 'expire', fraudStatus: null },
  canceled: { rawStatus: 'cancel', fraudStatus: null },
  denied: { rawStatus: 'deny', fraudStatus: 'deny' },
  failed: { rawStatus: 'failure', fraudStatus: null },
};

function environmentOf(config: ServerConfig): 'sandbox' | 'production' {
  return config.midtrans.isProduction ? 'production' : 'sandbox';
}

export function toPublicCharge(order: OrderRecord, config: ServerConfig): PublicCharge {
  return {
    orderId: order.orderId,
    midtransOrderId: order.orderId,
    status: order.status,
    amount: order.amount,
    expiresAt: order.expiresAt,
    transactionId: order.midtransTransactionId,
    paidAt: order.paidAt,
    qrImageUrl: order.qrImageUrl ? `/api/payments/${encodeURIComponent(order.orderId)}/qr` : null,
    environment: environmentOf(config),
  };
}

export function toPublicStatus(order: OrderRecord, config: ServerConfig): PublicStatus {
  return {
    orderId: order.orderId,
    midtransOrderId: order.orderId,
    status: order.status,
    transactionStatus: order.transactionStatus,
    amount: order.amount,
    transactionId: order.midtransTransactionId,
    paidAt: order.paidAt,
    expiresAt: order.expiresAt,
    environment: environmentOf(config),
    verified: order.status === 'paid',
  };
}

function safeErrorCode(error: unknown): string {
  if (error instanceof MidtransError) return error.code;
  return 'unexpected';
}

function newOrderId(store: OrderStore): string {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = `KASIR-${Date.now().toString(36).toUpperCase()}-${randomBytes(5)
      .toString('hex')
      .toUpperCase()}`;
    if (!store.has(id)) return id;
  }
  return `KASIR-${Date.now().toString(36).toUpperCase()}-${randomBytes(8)
    .toString('hex')
    .toUpperCase()}`;
}

interface IncomingStatus {
  rawStatus: string;
  fraudStatus: string | null;
  transactionId: string | null;
  transactionTime: string | null;
  expiryTime: string | null;
  amount: number;
}

/**
 * Merge a server-verified Midtrans status into a stored order.
 * `paid` is terminal: a later weaker response can never un-pay an order.
 */
function buildStatusPatch(
  order: OrderRecord,
  incoming: IncomingStatus,
  now: Date,
): { patch: Partial<OrderRecord>; accepted: boolean } {
  if (order.status === 'paid') {
    return { patch: { lastCheckedAt: now.getTime() }, accepted: false };
  }
  const nextStatus = mapTransactionStatus(incoming.rawStatus, incoming.fraudStatus);
  const verifiedPaidAt =
    nextStatus === 'paid'
      ? normalizeMidtransTimestamp(incoming.transactionTime) ?? now.toISOString()
      : order.paidAt;
  const expiresAt = normalizeMidtransTimestamp(incoming.expiryTime) ?? order.expiresAt;

  return {
    accepted: nextStatus === 'paid',
    patch: {
      status: nextStatus,
      transactionStatus: incoming.rawStatus || order.transactionStatus,
      fraudStatus: incoming.fraudStatus ?? order.fraudStatus,
      midtransTransactionId: incoming.transactionId ?? order.midtransTransactionId,
      expiresAt,
      paidAt: verifiedPaidAt ?? null,
      lastCheckedAt: now.getTime(),
      updatedAt: now.toISOString(),
    },
  };
}

export function createApp({
  config,
  store,
  gateway,
  now = () => new Date(),
  statusRefreshMs = 1500,
}: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const rateBuckets = new Map<string, { count: number; resetAt: number }>();
  const chargeRateLimit = (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const current = rateBuckets.get(key);
    const timestamp = now().getTime();
    if (!current || current.resetAt <= timestamp) {
      rateBuckets.set(key, { count: 1, resetAt: timestamp + RATE_WINDOW_MS });
      return next();
    }
    current.count += 1;
    if (current.count > RATE_MAX_CHARGES) {
      return res.status(429).json({
        error: 'rate_limited',
        message: 'Too many QRIS charge attempts. Please wait a moment and try again.',
      });
    }
    return next();
  };

  const qrImageCache = new Map<string, { data: Buffer; contentType: string }>();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/payments/config', (_req, res) => {
    res.json({
      provider: 'midtrans',
      configured: gateway.isConfigured(),
      environment: environmentOf(config),
      qrisExpiryMinutes: config.midtrans.qrisExpiryMinutes,
      ...(config.devSimulate ? { devSimulate: true } : {}),
    });
  });

  /* ------------------------- create a QRIS charge ------------------------- */
  app.post('/api/payments/qris', chargeRateLimit, async (req, res) => {
    if (!gateway.isConfigured()) {
      return res.status(503).json({
        error: 'midtrans_not_configured',
        message:
          'Midtrans is not configured on the server. Set MIDTRANS_SERVER_KEY and restart. See README.',
      });
    }
    const validation = validateChargeRequest(req.body);
    if (!validation.ok) {
      return res
        .status(400)
        .json({ error: 'invalid_request', message: validation.message, details: validation.errors });
    }
    const { items, amount, customer, idempotencyKey } = validation.value;
    const cartHash = hashCart(items);
    const timestamp = now();

    if (idempotencyKey) {
      const existing = store.findByIdempotencyKey(idempotencyKey);
      if (
        existing &&
        existing.amount === amount &&
        existing.cartHash === cartHash &&
        (existing.status === 'pending' || existing.status === 'paid')
      ) {
        return res.status(200).json(toPublicCharge(existing, config));
      }
    }

    const acquirer = config.midtrans.acquirer ?? null;
    const reusable = store.findReusablePending(cartHash, amount, timestamp.getTime(), acquirer);
    if (reusable) {
      return res.status(200).json(toPublicCharge(reusable, config));
    }

    const orderId = newOrderId(store);
    const expiresAt = new Date(
      timestamp.getTime() + config.midtrans.qrisExpiryMinutes * 60_000,
    ).toISOString();
    const record: OrderRecord = {
      orderId,
      midtransTransactionId: null,
      amount,
      status: 'pending',
      transactionStatus: null,
      fraudStatus: null,
      items,
      customer,
      cartHash,
      idempotencyKey,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
      expiresAt,
      paidAt: null,
      lastCheckedAt: 0,
      environment: environmentOf(config),
      acquirer,
      qrImageUrl: null,
      lastError: null,
    };
    await store.save(record);

    try {
      const charge = await gateway.chargeQris({
        orderId,
        amount,
        items,
        customer,
        expiryMinutes: config.midtrans.qrisExpiryMinutes,
      });
      if (charge.orderId !== orderId || charge.amount !== amount) {
        throw new MidtransError('invalid_response', 'Charge response did not match the request');
      }
      const status = mapTransactionStatus(charge.rawStatus, charge.fraudStatus);
      const paidAt =
        status === 'paid'
          ? normalizeMidtransTimestamp(charge.transactionTime) ?? now().toISOString()
          : null;
      const updated = await store.update(orderId, {
        status,
        transactionStatus: charge.rawStatus,
        fraudStatus: charge.fraudStatus,
        midtransTransactionId: charge.transactionId,
        qrImageUrl: charge.qrImageUrl,
        expiresAt: normalizeMidtransTimestamp(charge.expiryTime) ?? expiresAt,
        paidAt,
        lastCheckedAt: now().getTime(),
        updatedAt: now().toISOString(),
        lastError: null,
      });
      return res.status(201).json(toPublicCharge(updated ?? record, config));
    } catch (error) {
      const code = safeErrorCode(error);
      const definiteRejection = error instanceof MidtransError && error.code === 'http';
      await store.update(orderId, {
        // A timeout may still have created the transaction at Midtrans; keep it
        // recoverable (`unknown`) instead of pretending it never existed.
        status: definiteRejection ? 'failed' : 'unknown',
        lastError: code,
        lastCheckedAt: now().getTime(),
        updatedAt: now().toISOString(),
      });
      const status =
        error instanceof MidtransError && error.code === 'timeout' ? 504 : 502;
      return res.status(status).json({
        error: 'midtrans_error',
        message:
          'Could not create a verified QRIS payment right now. No payment has been recorded.',
        // The id lets the browser reconcile a transaction that may still exist upstream.
        orderId: definiteRejection ? undefined : orderId,
      });
    }
  });

  /* --------------------------- verify status ----------------------------- */
  app.get('/api/payments/:orderId/status', async (req, res) => {
    const orderId = String(req.params.orderId || '');
    const order = store.get(orderId);
    if (!order) {
      return res.status(404).json({ error: 'order_not_found', message: 'Unknown order id' });
    }
    if (order.status === 'paid') {
      return res.json(toPublicStatus(order, config));
    }
    if (now().getTime() - order.lastCheckedAt < statusRefreshMs) {
      return res.json(toPublicStatus(order, config));
    }
    try {
      const status = await gateway.getStatus(orderId);
      if (!status.found) {
        const updated = await store.update(orderId, {
          lastCheckedAt: now().getTime(),
          updatedAt: now().toISOString(),
        });
        return res.json(toPublicStatus(updated ?? order, config));
      }
      if (status.orderId !== orderId || status.amount !== order.amount) {
        // Never accept a response for another order or a different amount.
        console.warn('[payments] status mismatch rejected for order', orderId);
        await store.update(orderId, { lastError: 'status_mismatch' });
        return res.status(502).json({
          error: 'status_mismatch',
          message: 'Midtrans returned a status that does not match this order.',
        });
      }
      const { patch } = buildStatusPatch(
        order,
        {
          rawStatus: status.rawStatus ?? '',
          fraudStatus: status.fraudStatus ?? null,
          transactionId: status.transactionId ?? null,
          transactionTime: status.transactionTime ?? null,
          expiryTime: status.expiryTime ?? null,
          amount: status.amount,
        },
        now(),
      );
      const updated = await store.update(orderId, { ...patch, lastError: null });
      return res.json(toPublicStatus(updated ?? order, config));
    } catch (error) {
      console.warn('[payments] status check failed for order', orderId, safeErrorCode(error));
      return res.status(error instanceof MidtransError && error.code === 'timeout' ? 504 : 502).json({
        error: 'midtrans_unavailable',
        message: 'Could not verify the payment status with Midtrans. Retrying.',
      });
    }
  });

  /* ------------------------- QR image proxy ------------------------------ */
  app.get('/api/payments/:orderId/qr', async (req, res) => {
    const orderId = String(req.params.orderId || '');
    const order = store.get(orderId);
    if (!order || !order.qrImageUrl) {
      return res.status(404).json({ error: 'qr_not_available', message: 'No QR for this order' });
    }
    const cached = qrImageCache.get(orderId);
    if (cached) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'private, max-age=120');
      return res.send(cached.data);
    }
    try {
      const image = await gateway.getQrImage(order.qrImageUrl);
      qrImageCache.set(orderId, image);
      res.setHeader('Content-Type', image.contentType);
      res.setHeader('Cache-Control', 'private, max-age=120');
      return res.send(image.data);
    } catch (error) {
      console.warn('[payments] QR image fetch failed for order', orderId, safeErrorCode(error));
      return res.status(502).json({ error: 'qr_unavailable', message: 'Could not load the QR image' });
    }
  });

  /* --------------------- Midtrans HTTP notifications --------------------- */
  app.post('/api/payments/midtrans/notification', async (req, res) => {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'invalid_notification' });
    }
    if (!gateway.isConfigured()) {
      return res.status(503).json({ error: 'midtrans_not_configured' });
    }
    if (
      !verifyMidtransSignature(
        {
          order_id: body.order_id,
          status_code: body.status_code,
          gross_amount: body.gross_amount,
          signature_key: body.signature_key,
        },
        config.midtrans.serverKey,
      )
    ) {
      console.warn('[payments] rejected notification with an invalid signature');
      return res.status(401).json({ error: 'invalid_signature' });
    }
    const orderId = typeof body.order_id === 'string' ? body.order_id : '';
    const order = store.get(orderId);
    if (!order) {
      return res.status(404).json({ error: 'order_not_found' });
    }
    const amount = parseIdrAmount(body.gross_amount);
    if (amount == null || amount !== order.amount) {
      console.warn('[payments] rejected notification with a mismatched amount', orderId);
      return res.status(400).json({ error: 'amount_mismatch' });
    }
    const rawStatus = typeof body.transaction_status === 'string' ? body.transaction_status : '';
    if (!rawStatus) {
      return res.status(400).json({ error: 'invalid_notification' });
    }
    const { patch } = buildStatusPatch(
      order,
      {
        rawStatus,
        fraudStatus: typeof body.fraud_status === 'string' ? body.fraud_status : null,
        transactionId: typeof body.transaction_id === 'string' ? body.transaction_id : null,
        transactionTime: typeof body.transaction_time === 'string' ? body.transaction_time : null,
        expiryTime: typeof body.expiry_time === 'string' ? body.expiry_time : null,
        amount,
      },
      now(),
    );
    const updated = await store.update(orderId, { ...patch, lastError: null });
    return res.json({ ok: true, orderId, status: updated?.status ?? order.status });
  });

  /* --------------------- dev-only settlement simulation ------------------ */
  /**
   * Settle (or fail) an order locally, instead of paying it in Midtrans's web
   * simulator. This is a development aid: it writes the same normalized status the
   * verified status endpoint would, so the browser's normal polling/finalization
   * path runs unchanged. Disabled unless MIDTRANS_DEV_SIMULATE=1, and never in
   * production. It is not a substitute for a real verified payment.
   */
  app.post('/api/payments/:orderId/simulate', async (req, res) => {
    if (!config.devSimulate) {
      return res.status(404).json({ error: 'not_found' });
    }
    const orderId = String(req.params.orderId || '');
    const order = store.get(orderId);
    if (!order) {
      return res.status(404).json({ error: 'order_not_found', message: 'Unknown order id' });
    }
    const requested =
      typeof (req.body as Record<string, unknown> | undefined)?.outcome === 'string'
        ? String((req.body as Record<string, unknown>).outcome).toLowerCase()
        : 'paid';
    const outcome = SIMULATED_OUTCOMES[requested];
    if (!outcome) {
      return res.status(400).json({
        error: 'invalid_outcome',
        message: `outcome must be one of: ${Object.keys(SIMULATED_OUTCOMES).join(', ')}`,
      });
    }
    const timestamp = now();
    const { patch } = buildStatusPatch(
      order,
      {
        rawStatus: outcome.rawStatus,
        fraudStatus: outcome.fraudStatus,
        // Always label a simulated settlement so it is obvious in the receipt /
        // Reports that no real Midtrans transaction produced it.
        transactionId: `SIM-${orderId}`,
        transactionTime: timestamp.toISOString(),
        expiryTime: order.expiresAt,
        amount: order.amount,
      },
      timestamp,
    );
    const updated = await store.update(orderId, { ...patch, lastError: null });
    console.warn(`[payments] DEV simulated "${requested}" for order ${orderId}`);
    return res.json({
      ok: true,
      simulated: true,
      orderId,
      status: updated?.status ?? order.status,
    });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const name = error instanceof Error ? error.name : 'unknown';
    console.error('[api] unhandled error', name);
    res.status(500).json({ error: 'server_error', message: 'Unexpected server error' });
  });

  return app;
}
