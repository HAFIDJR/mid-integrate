import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app';
import { loadConfig, type ServerConfig } from '../../server/config';
import {
  MidtransError,
  buildNotificationSignature,
  type ChargeQrisInput,
  type ChargeQrisResult,
  type MidtransGateway,
  type QrImageResult,
  type StatusResult,
} from '../../server/midtrans';
import { OrderStore } from '../../server/orders';

const SERVER_KEY = 'SB-Mid-server-UNIT-TEST';

const cartBody = {
  grossAmount: 36000,
  items: [{ productId: 'p1', name: 'Kopi Susu', price: 18000, qty: 2, unit: 'pcs' }],
  customer: { name: 'Siti', phone: '0812' },
  idempotencyKey: 'idem-key-0001',
};

class FakeGateway implements MidtransGateway {
  configured = true;
  charges: ChargeQrisInput[] = [];
  statuses = new Map<string, StatusResult>();
  failStatus: 'timeout' | null = null;

  isConfigured(): boolean {
    return this.configured;
  }

  async chargeQris(input: ChargeQrisInput): Promise<ChargeQrisResult> {
    this.charges.push(input);
    return {
      orderId: input.orderId,
      transactionId: `tx-${this.charges.length}`,
      rawStatus: 'pending',
      fraudStatus: 'accept',
      amount: input.amount,
      qrImageUrl: `https://api.sandbox.midtrans.com/v2/qris/${input.orderId}/qr-code`,
      statusCode: '201',
      transactionTime: '2026-10-27 12:00:00',
      expiryTime: null,
    };
  }

  async getStatus(orderId: string): Promise<StatusResult> {
    if (this.failStatus === 'timeout') throw new MidtransError('timeout', 'timed out');
    return this.statuses.get(orderId) ?? { found: false };
  }

  async getQrImage(): Promise<QrImageResult> {
    return { data: Buffer.from('png-bytes'), contentType: 'image/png' };
  }
}

function config(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    ...loadConfig({ MIDTRANS_SERVER_KEY: SERVER_KEY, MIDTRANS_IS_PRODUCTION: 'false' }),
    ...overrides,
  };
}

let store: OrderStore;
let gateway: FakeGateway;
let app: ReturnType<typeof createApp>;
let activeConfig: ServerConfig;

beforeEach(async () => {
  store = await OrderStore.open(':memory:');
  gateway = new FakeGateway();
  activeConfig = config();
  app = createApp({ config: activeConfig, store, gateway, statusRefreshMs: 0 });
});

afterEach(async () => {
  await store.clear();
});

async function createOrder(body: typeof cartBody = cartBody): Promise<string> {
  const response = await request(app).post('/api/payments/qris').send(body);
  expect(response.status).toBe(201);
  return response.body.orderId as string;
}

function signedNotification(orderId: string, overrides: Record<string, unknown> = {}) {
  const payload = {
    order_id: orderId,
    status_code: '200',
    gross_amount: '36000.00',
    transaction_status: 'settlement',
    fraud_status: 'accept',
    transaction_id: 'tx-settled',
    transaction_time: '2026-10-27 12:05:00',
    payment_type: 'qris',
    ...overrides,
  };
  return {
    ...payload,
    signature_key: buildNotificationSignature(
      payload.order_id,
      payload.status_code,
      payload.gross_amount,
      SERVER_KEY,
    ),
  };
}

describe('POST /api/payments/qris', () => {
  it('creates a QRIS charge bound to the exact cart and total', async () => {
    const response = await request(app).post('/api/payments/qris').send(cartBody);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: 'pending',
      amount: 36000,
      environment: 'sandbox',
    });
    expect(response.body.orderId).toMatch(/^KASIR-/);
    expect(response.body.qrImageUrl).toBe(
      `/api/payments/${encodeURIComponent(response.body.orderId)}/qr`,
    );
    expect(JSON.stringify(response.body)).not.toContain(SERVER_KEY);
    expect(gateway.charges).toHaveLength(1);
    expect(gateway.charges[0].amount).toBe(36000);
  });

  it('creates unique order ids for different carts', async () => {
    const first = await createOrder();
    const second = await createOrder({
      ...cartBody,
      idempotencyKey: 'idem-key-0002',
      items: [{ productId: 'p2', name: 'Teh', price: 12000, qty: 3, unit: 'pcs' }],
      grossAmount: 36000,
    });
    expect(first).not.toBe(second);
    expect(gateway.charges).toHaveLength(2);
  });

  it('reuses the order for a repeated idempotency key', async () => {
    const first = await createOrder();
    const replay = await request(app).post('/api/payments/qris').send(cartBody);
    expect(replay.status).toBe(200);
    expect(replay.body.orderId).toBe(first);
    expect(gateway.charges).toHaveLength(1);
  });

  it('does not reuse a pending order with a different amount', async () => {
    const first = await createOrder();
    const second = await createOrder({
      ...cartBody,
      idempotencyKey: 'idem-key-0003',
      items: [{ productId: 'p1', name: 'Kopi Susu', price: 18000, qty: 3, unit: 'pcs' }],
      grossAmount: 54000,
    });
    expect(second).not.toBe(first);
    expect(gateway.charges).toHaveLength(2);
  });

  it.each([
    ['empty cart', { ...cartBody, items: [], grossAmount: 0 }],
    ['amount mismatch', { ...cartBody, grossAmount: 35000 }],
    ['fractional amount', { ...cartBody, grossAmount: 36000.5 }],
    ['negative price', { ...cartBody, items: [{ name: 'X', price: -1, qty: 1 }] }],
    ['zero quantity', { ...cartBody, items: [{ name: 'X', price: 1000, qty: 0 }] }],
  ])('rejects %s without charging', async (_label, body) => {
    const response = await request(app).post('/api/payments/qris').send(body);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_request');
    expect(gateway.charges).toHaveLength(0);
  });

  it('returns 503 (not a fake payment) when Midtrans is not configured', async () => {
    gateway.configured = false;
    const response = await request(app).post('/api/payments/qris').send(cartBody);
    expect(response.status).toBe(503);
    expect(response.body.error).toBe('midtrans_not_configured');
    expect(gateway.charges).toHaveLength(0);
  });

  it('keeps the order recoverable when the upstream call times out', async () => {
    const failing = new FakeGateway();
    failing.chargeQris = async () => {
      throw new MidtransError('timeout', 'timed out');
    };
    const localStore = await OrderStore.open(':memory:');
    const localApp = createApp({
      config: activeConfig,
      store: localStore,
      gateway: failing,
      statusRefreshMs: 0,
    });
    const response = await request(localApp).post('/api/payments/qris').send(cartBody);
    expect(response.status).toBe(504);
    expect(response.body.orderId).toMatch(/^KASIR-/);
    const stored = localStore.get(response.body.orderId);
    expect(stored?.status).toBe('unknown');
    expect(stored?.lastError).toBe('timeout');
  });
});

describe('GET /api/payments/:orderId/status', () => {
  it('reports pending without creating a paid state', async () => {
    const orderId = await createOrder();
    gateway.statuses.set(orderId, {
      found: true,
      orderId,
      amount: 36000,
      rawStatus: 'pending',
      transactionId: 'tx-1',
      transactionTime: '2026-10-27 12:00:00',
      fraudStatus: 'accept',
    });
    const response = await request(app).get(`/api/payments/${orderId}/status`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'pending', verified: false, amount: 36000 });
    expect(response.body.paidAt).toBeNull();
    expect(store.get(orderId)?.status).toBe('pending');
  });

  it('reports a verified settlement as paid with the Midtrans timestamp', async () => {
    const orderId = await createOrder();
    gateway.statuses.set(orderId, {
      found: true,
      orderId,
      amount: 36000,
      rawStatus: 'settlement',
      transactionId: 'tx-settled',
      transactionTime: '2026-10-27 12:05:00',
      fraudStatus: 'accept',
    });
    const response = await request(app).get(`/api/payments/${orderId}/status`);
    expect(response.body).toMatchObject({
      status: 'paid',
      verified: true,
      transactionId: 'tx-settled',
      paidAt: '2026-10-27T05:05:00.000Z',
    });
    expect(JSON.stringify(response.body)).not.toContain(SERVER_KEY);
  });

  it('never accepts a status whose amount differs from the order', async () => {
    const orderId = await createOrder();
    gateway.statuses.set(orderId, {
      found: true,
      orderId,
      amount: 1000,
      rawStatus: 'settlement',
      transactionId: 'tx-x',
    });
    const response = await request(app).get(`/api/payments/${orderId}/status`);
    expect(response.status).toBe(502);
    expect(response.body.error).toBe('status_mismatch');
    expect(store.get(orderId)?.status).toBe('pending');
  });

  it('does not mark paid when the upstream status check fails', async () => {
    const orderId = await createOrder();
    gateway.failStatus = 'timeout';
    const response = await request(app).get(`/api/payments/${orderId}/status`);
    expect(response.status).toBe(504);
    expect(response.body.error).toBe('midtrans_unavailable');
    expect(store.get(orderId)?.status).toBe('pending');
  });

  it('returns 404 for unknown orders', async () => {
    const response = await request(app).get('/api/payments/KASIR-UNKNOWN/status');
    expect(response.status).toBe(404);
  });
});

describe('POST /api/payments/midtrans/notification', () => {
  it('accepts a signed settlement and is idempotent', async () => {
    const orderId = await createOrder();
    const first = await request(app)
      .post('/api/payments/midtrans/notification')
      .send(signedNotification(orderId));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, orderId, status: 'paid' });

    const stored = store.get(orderId);
    expect(stored?.status).toBe('paid');
    expect(stored?.paidAt).toBe('2026-10-27T05:05:00.000Z');
    expect(stored?.midtransTransactionId).toBe('tx-settled');
    expect(JSON.stringify(first.body)).not.toContain(SERVER_KEY);

    const duplicate = await request(app)
      .post('/api/payments/midtrans/notification')
      .send({
        ...signedNotification(orderId, { transaction_time: '2026-10-27 13:00:00' }),
      });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.status).toBe('paid');
    expect(store.get(orderId)?.paidAt).toBe('2026-10-27T05:05:00.000Z');
  });

  it('rejects an invalid signature', async () => {
    const orderId = await createOrder();
    const response = await request(app)
      .post('/api/payments/midtrans/notification')
      .send({ ...signedNotification(orderId), signature_key: 'a'.repeat(128) });
    expect(response.status).toBe(401);
    expect(store.get(orderId)?.status).toBe('pending');
  });

  it('rejects an amount that does not match the order', async () => {
    const orderId = await createOrder();
    const payload = signedNotification(orderId, { gross_amount: '1000.00' });
    const response = await request(app).post('/api/payments/midtrans/notification').send(payload);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('amount_mismatch');
    expect(store.get(orderId)?.status).toBe('pending');
  });

  it('rejects notifications for unknown orders', async () => {
    const payload = signedNotification('KASIR-UNKNOWN');
    const response = await request(app).post('/api/payments/midtrans/notification').send(payload);
    expect(response.status).toBe(404);
  });

  it('never downgrades an order that is already paid', async () => {
    const orderId = await createOrder();
    await request(app)
      .post('/api/payments/midtrans/notification')
      .send(signedNotification(orderId));
    const late = await request(app)
      .post('/api/payments/midtrans/notification')
      .send(signedNotification(orderId, { status_code: '202', transaction_status: 'expire' }));
    expect(late.status).toBe(200);
    expect(store.get(orderId)?.status).toBe('paid');
  });
});

describe('GET /api/payments/:orderId/qr', () => {
  it('serves the Midtrans QR image through the server', async () => {
    const orderId = await createOrder();
    const response = await request(app).get(`/api/payments/${orderId}/qr`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.body.toString()).toBe('png-bytes');
  });

  it('returns 404 for unknown orders', async () => {
    const response = await request(app).get('/api/payments/KASIR-UNKNOWN/qr');
    expect(response.status).toBe(404);
  });
});

describe('payment configuration', () => {
  it('exposes only non-secret connection info', async () => {
    const response = await request(app).get('/api/payments/config');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      provider: 'midtrans',
      configured: true,
      environment: 'sandbox',
      qrisExpiryMinutes: 15,
    });
    expect(JSON.stringify(response.body)).not.toContain(SERVER_KEY);
  });
});

describe('durable order metadata', () => {
  it('survives a restart of the order store', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kasir-orders-'));
    const file = path.join(dir, 'orders.json');
    const firstStore = await OrderStore.open(file);
    const localGateway = new FakeGateway();
    const firstApp = createApp({
      config: activeConfig,
      store: firstStore,
      gateway: localGateway,
      statusRefreshMs: 0,
    });
    const created = await request(firstApp).post('/api/payments/qris').send(cartBody);
    const orderId = created.body.orderId as string;
    await request(firstApp)
      .post('/api/payments/midtrans/notification')
      .send(signedNotification(orderId));

    const reopened = await OrderStore.open(file);
    expect(reopened.get(orderId)?.status).toBe('paid');
    expect(reopened.get(orderId)?.amount).toBe(36000);

    const secondApp = createApp({
      config: activeConfig,
      store: reopened,
      gateway: localGateway,
      statusRefreshMs: 0,
    });
    const status = await request(secondApp).get(`/api/payments/${orderId}/status`);
    expect(status.body.status).toBe('paid');
    await fsp.rm(dir, { recursive: true, force: true });
  });
});
