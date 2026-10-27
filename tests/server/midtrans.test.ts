import { describe, expect, it, vi } from 'vitest';
import {
  HttpMidtransGateway,
  MidtransError,
  buildNotificationSignature,
  mapTransactionStatus,
  normalizeMidtransTimestamp,
  parseIdrAmount,
  verifyMidtransSignature,
} from '../../server/midtrans';
import { hashCart, validateChargeRequest } from '../../server/validation';
import type { FetchLike } from '../../server/midtrans';

const SERVER_KEY = 'SB-Mid-server-TESTKEY';

function jsonResponse(body: unknown, status = 200, contentType = 'application/json') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? contentType : null,
    },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

describe('Midtrans notification signature', () => {
  it('uses the documented SHA-512 construction', () => {
    // Hard-coded expected hash: sha512('ORDER-1' + '200' + '50000.00' + key)
    expect(buildNotificationSignature('ORDER-1', '200', '50000.00', SERVER_KEY)).toBe(
      '8449e562dbc6b090f758d46ce73210e387ac8708da79428be4002c97628e708ac964be41732d0d09fec732fbc4fae75657f85732e2c3625c617c9d9c8b810c7c',
    );
  });

  it('accepts a genuine signature', () => {
    const signature_key = buildNotificationSignature('ORDER-1', '200', '50000.00', SERVER_KEY);
    expect(
      verifyMidtransSignature(
        { order_id: 'ORDER-1', status_code: '200', gross_amount: '50000.00', signature_key },
        SERVER_KEY,
      ),
    ).toBe(true);
  });

  it('rejects tampered fields, malformed signatures and the wrong key', () => {
    const signature_key = buildNotificationSignature('ORDER-1', '200', '50000.00', SERVER_KEY);
    expect(
      verifyMidtransSignature(
        { order_id: 'ORDER-2', status_code: '200', gross_amount: '50000.00', signature_key },
        SERVER_KEY,
      ),
    ).toBe(false);
    expect(
      verifyMidtransSignature(
        { order_id: 'ORDER-1', status_code: '200', gross_amount: '99000.00', signature_key },
        SERVER_KEY,
      ),
    ).toBe(false);
    expect(
      verifyMidtransSignature(
        { order_id: 'ORDER-1', status_code: '200', gross_amount: '50000.00', signature_key },
        'SB-Mid-server-OTHER',
      ),
    ).toBe(false);
    expect(
      verifyMidtransSignature(
        { order_id: 'ORDER-1', status_code: '200', gross_amount: '50000.00', signature_key: 'nope' },
        SERVER_KEY,
      ),
    ).toBe(false);
    expect(
      verifyMidtransSignature(
        { order_id: 1, status_code: '200', gross_amount: '50000.00', signature_key },
        SERVER_KEY,
      ),
    ).toBe(false);
    // The construction is a plain hash, not an HMAC.
    expect(
      verifyMidtransSignature(
        {
          order_id: 'ORDER-1',
          status_code: '200',
          gross_amount: '50000.00',
          signature_key: buildNotificationSignature('ORDER-1', '200', '50000.00', ''),
        },
        SERVER_KEY,
      ),
    ).toBe(false);
  });
});

describe('status normalization', () => {
  it('treats only settlement as paid', () => {
    expect(mapTransactionStatus('settlement')).toBe('paid');
    expect(mapTransactionStatus('capture', 'accept')).toBe('pending');
    expect(mapTransactionStatus('pending')).toBe('pending');
    expect(mapTransactionStatus('expire')).toBe('expired');
    expect(mapTransactionStatus('cancel')).toBe('canceled');
    expect(mapTransactionStatus('deny')).toBe('denied');
    expect(mapTransactionStatus('failure')).toBe('failed');
    expect(mapTransactionStatus('refund')).toBe('failed');
    expect(mapTransactionStatus('something-new')).toBe('unknown');
    expect(mapTransactionStatus(undefined)).toBe('unknown');
  });

  it('parses Midtrans gross_amount strings strictly', () => {
    expect(parseIdrAmount('55000.00')).toBe(55000);
    expect(parseIdrAmount('55000')).toBe(55000);
    expect(parseIdrAmount(55000)).toBe(55000);
    expect(parseIdrAmount('55000.5')).toBeNull();
    expect(parseIdrAmount('55000.01')).toBeNull();
    expect(parseIdrAmount('0')).toBeNull();
    expect(parseIdrAmount('-100')).toBeNull();
    expect(parseIdrAmount(12.5)).toBeNull();
    expect(parseIdrAmount('12,5')).toBeNull();
    expect(parseIdrAmount(null)).toBeNull();
  });

  it('normalizes Midtrans WIB timestamps', () => {
    expect(normalizeMidtransTimestamp('2026-10-27 12:00:00')).toBe('2026-10-27T05:00:00.000Z');
    expect(normalizeMidtransTimestamp('nope')).toBeNull();
  });
});

describe('request validation', () => {
  const validBody = {
    grossAmount: 36000,
    items: [
      { productId: 'p1', name: 'Kopi Susu', price: 18000, qty: 2, unit: 'pcs' },
    ],
    customer: { name: '  Siti  ', phone: '0812 3456' },
    idempotencyKey: 'idem-key-123',
  };

  it('accepts a valid cart and computes the total', () => {
    const result = validateChargeRequest(validBody);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.amount).toBe(36000);
    expect(result.value.items).toHaveLength(1);
    expect(result.value.customer.name).toBe('Siti');
  });

  it.each([
    ['empty cart', { ...validBody, items: [] }],
    ['negative price', { ...validBody, items: [{ name: 'X', price: -1000, qty: 1 }], grossAmount: -1000 }],
    ['fractional price', { ...validBody, items: [{ name: 'X', price: 1500.5, qty: 2 }], grossAmount: 3001 }],
    ['zero qty', { ...validBody, items: [{ name: 'X', price: 1500, qty: 0 }] }],
    ['fractional qty', { ...validBody, items: [{ name: 'X', price: 1500, qty: 1.5 }] }],
    ['missing name', { ...validBody, items: [{ price: 1500, qty: 1 }] }],
    ['mismatched gross amount', { ...validBody, grossAmount: 35000 }],
    ['fractional gross amount', { ...validBody, grossAmount: 36000.5 }],
    ['zero gross amount', { ...validBody, grossAmount: 0 }],
    ['bad idempotency key', { ...validBody, idempotencyKey: 'a b c' }],
    ['bad customer', { ...validBody, customer: 'Siti' }],
    ['not an object', 'nope'],
  ])('rejects %s', (_label, body) => {
    expect(validateChargeRequest(body).ok).toBe(false);
  });

  it('hashes carts deterministically regardless of item order', () => {
    const a = [
      { productId: 'a', name: 'A', price: 1000, qty: 1, unit: 'pcs' },
      { productId: 'b', name: 'B', price: 2000, qty: 2, unit: 'pcs' },
    ];
    const b = [
      { productId: 'b', name: 'B', price: 2000, qty: 2, unit: 'pcs' },
      { productId: 'a', name: 'A', price: 1000, qty: 1, unit: 'pcs' },
    ];
    expect(hashCart(a)).toBe(hashCart(b));
    expect(hashCart(a)).not.toBe(hashCart([{ ...a[0], qty: 2 }, a[1]]));
  });
});

describe('HttpMidtransGateway', () => {
  const config = {
    serverKey: SERVER_KEY,
    isProduction: false,
    qrisExpiryMinutes: 15,
  };

  const chargeResponse = {
    status_code: '201',
    status_message: 'QRIS transaction is created',
    transaction_id: 'tx-123',
    order_id: 'KASIR-TEST-1',
    gross_amount: '36000.00',
    payment_type: 'qris',
    transaction_time: '2026-10-27 12:00:00',
    transaction_status: 'pending',
    fraud_status: 'accept',
    actions: [
      {
        name: 'generate-qr-code',
        method: 'GET',
        url: 'https://api.sandbox.midtrans.com/v2/qris/tx-123/qr-code',
      },
    ],
  };

  it('creates a QRIS charge with Basic auth and parses the QR action', async () => {
    const calls: Array<{ url: string; init?: Record<string, unknown> }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: Record<string, unknown>) => {
      calls.push({ url, init });
      return jsonResponse(chargeResponse, 201);
    }) as unknown as FetchLike;

    const gateway = new HttpMidtransGateway(config, fetchImpl);
    const result = await gateway.chargeQris({
      orderId: 'KASIR-TEST-1',
      amount: 36000,
      items: [{ productId: 'p1', name: 'Kopi Susu', price: 18000, qty: 2, unit: 'pcs' }],
      customer: { name: 'Siti', phone: '0812' },
      expiryMinutes: 15,
    });

    expect(result.qrImageUrl).toBe('https://api.sandbox.midtrans.com/v2/qris/tx-123/qr-code');
    expect(result.transactionId).toBe('tx-123');
    expect(result.amount).toBe(36000);

    expect(calls[0].url).toBe('https://api.sandbox.midtrans.com/v2/charge');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from(`${SERVER_KEY}:`).toString('base64')}`);
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.payment_type).toBe('qris');
    expect(body.transaction_details).toEqual({ order_id: 'KASIR-TEST-1', gross_amount: 36000 });
    expect(body.custom_expiry).toEqual({ expiry_duration: 15, unit: 'minute' });
    expect(body.item_details).toEqual([
      { id: 'p1', name: 'Kopi Susu', price: 18000, quantity: 2 },
    ]);
  });

  it('rejects a response whose order id or amount does not match', async () => {
    const wrongOrder = vi.fn(async () => jsonResponse({ ...chargeResponse, order_id: 'OTHER' }, 201));
    await expect(
      new HttpMidtransGateway(config, wrongOrder as unknown as FetchLike).chargeQris({
        orderId: 'KASIR-TEST-1',
        amount: 36000,
        items: [{ productId: 'p1', name: 'Kopi', price: 36000, qty: 1, unit: 'pcs' }],
        customer: { name: '', phone: '' },
        expiryMinutes: 15,
      }),
    ).rejects.toMatchObject({ code: 'invalid_response' });

    const wrongAmount = vi.fn(async () =>
      jsonResponse({ ...chargeResponse, gross_amount: '1000.00' }, 201),
    );
    await expect(
      new HttpMidtransGateway(config, wrongAmount as unknown as FetchLike).chargeQris({
        orderId: 'KASIR-TEST-1',
        amount: 36000,
        items: [{ productId: 'p1', name: 'Kopi', price: 36000, qty: 1, unit: 'pcs' }],
        customer: { name: '', phone: '' },
        expiryMinutes: 15,
      }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('maps upstream timeouts and malformed bodies to safe errors', async () => {
    const timeout = vi.fn(async () => {
      const error = new Error('timed out');
      error.name = 'TimeoutError';
      throw error;
    });
    await expect(
      new HttpMidtransGateway(config, timeout as unknown as FetchLike).getStatus('X'),
    ).rejects.toBeInstanceOf(MidtransError);
    await expect(
      new HttpMidtransGateway(config, timeout as unknown as FetchLike).getStatus('X'),
    ).rejects.toMatchObject({ code: 'timeout' });

    const garbage = vi.fn(async () => jsonResponse('<html>oops</html>', 200, 'text/html'));
    await expect(
      new HttpMidtransGateway(config, garbage as unknown as FetchLike).getStatus('X'),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('reports unknown transactions as not found', async () => {
    const missing = vi.fn(async () =>
      jsonResponse({ status_code: '404', status_message: "Transaction doesn't exist." }, 404),
    );
    await expect(
      new HttpMidtransGateway(config, missing as unknown as FetchLike).getStatus('NOPE'),
    ).resolves.toMatchObject({ found: false });
  });

  it('only fetches QR images from Midtrans hosts', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse('png', 200, 'image/png'),
    ) as unknown as FetchLike;
    const gateway = new HttpMidtransGateway(config, fetchImpl);
    await expect(gateway.getQrImage('https://evil.example.com/qr.png')).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
});
