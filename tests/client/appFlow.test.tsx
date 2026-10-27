import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { AppProvider } from '../../src/state/AppContext';
import { KEYS, readFlowRecord } from '../../src/state/storage';
import type { Sale } from '../../src/state/types';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function installFetch(statusPlan: Array<'pending' | 'paid'>) {
  const calls: Call[] = [];
  let statusIndex = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (url.endsWith('/api/payments/config')) {
      return jsonResponse({
        provider: 'midtrans',
        configured: true,
        environment: 'sandbox',
        qrisExpiryMinutes: 15,
      });
    }
    if (url.endsWith('/api/payments/qris')) {
      return jsonResponse(
        {
          orderId: 'KASIR-TEST-1',
          midtransOrderId: 'KASIR-TEST-1',
          status: 'pending',
          amount: 18000,
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          transactionId: 'tx-1',
          paidAt: null,
          qrImageUrl: '/api/payments/KASIR-TEST-1/qr',
          environment: 'sandbox',
        },
        201,
      );
    }
    if (url.includes('/api/payments/KASIR-TEST-1/status')) {
      const plan = statusPlan[Math.min(statusIndex, statusPlan.length - 1)];
      statusIndex += 1;
      return jsonResponse({
        orderId: 'KASIR-TEST-1',
        midtransOrderId: 'KASIR-TEST-1',
        status: plan,
        transactionStatus: plan === 'paid' ? 'settlement' : 'pending',
        amount: 18000,
        transactionId: plan === 'paid' ? 'tx-1' : null,
        paidAt: plan === 'paid' ? '2026-10-27T05:00:00.000Z' : null,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        environment: 'sandbox',
        verified: plan === 'paid',
      });
    }
    return jsonResponse({ error: 'not_found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

function seed() {
  localStorage.setItem(KEYS.onboarded, 'true');
  localStorage.setItem(
    KEYS.store,
    JSON.stringify({
      logo: '☕',
      storeName: 'Kedai Senja',
      ownerName: 'Budi Santoso',
      businessType: 'Coffee Shop',
      theme: 'light',
      qris: '',
    }),
  );
  localStorage.setItem(
    KEYS.products,
    JSON.stringify([
      { id: 'p1', name: 'Espresso', category: 'Coffee', price: 18000, stock: 3, unit: 'cup' },
    ]),
  );
  localStorage.setItem(KEYS.sales, JSON.stringify([]));
}

beforeEach(() => {
  localStorage.clear();
  seed();
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'Date',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
  Object.defineProperty(window, 'print', { configurable: true, writable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function flush(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function clickText(root: ParentNode, text: string) {
  const button = Array.from(root.querySelectorAll('button')).find((item) =>
    item.textContent?.trim().includes(text),
  );
  expect(button, `button "${text}"`).toBeTruthy();
  await act(async () => {
    (button as HTMLElement).click();
  });
}

async function openQrisCashier(container: HTMLElement) {
  await act(async () => {
    (container.querySelector('#fab') as HTMLElement).click();
  });
  await act(async () => {
    (container.querySelector('#overlay-root .s-row') as HTMLElement).click();
  });
  await clickText(container, 'Continue to Quantity');
  await clickText(container, 'Continue to Payment');
  await clickText(container, 'QRIS');
  await flush();
}

describe('QRIS checkout end to end', () => {
  it('creates one order, polls, finalizes once, prints and keeps the cart flow intact', async () => {
    const { calls } = installFetch(['pending', 'paid', 'paid']);
    const { container } = render(
      <AppProvider>
        <App />
      </AppProvider>,
    );
    await flush();

    await openQrisCashier(container);

    const charge = calls.find((call) => call.url.endsWith('/api/payments/qris'));
    expect(charge).toBeTruthy();
    expect(charge?.method).toBe('POST');
    expect(charge?.body).toMatchObject({ grossAmount: 18000 });

    const qr = container.querySelector('.qris-box img') as HTMLImageElement | null;
    expect(qr?.getAttribute('src')).toBe('/api/payments/KASIR-TEST-1/qr');

    // QRIS cannot be completed by hand.
    const complete = Array.from(container.querySelectorAll('#overlay-root button')).find((button) =>
      button.textContent?.includes('Waiting for payment'),
    ) as HTMLButtonElement | undefined;
    expect(complete).toBeTruthy();
    expect(complete?.disabled).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3200);
    });
    await flush();

    const sales = JSON.parse(localStorage.getItem(KEYS.sales) ?? '[]') as Sale[];
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({
      total: 18000,
      paymentMethod: 'QRIS',
      status: 'PAID',
      midtransOrderId: 'KASIR-TEST-1',
    });
    expect(sales[0].midtransTransactionId).toBe('tx-1');
    expect(sales[0].paidAt).toBe('2026-10-27T05:00:00.000Z');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    await flush();

    const products = JSON.parse(localStorage.getItem(KEYS.products) ?? '[]') as Array<{
      id: string;
      stock: number;
    }>;
    expect(products.find((product) => product.id === 'p1')?.stock).toBe(2);

    expect(window.print).toHaveBeenCalledTimes(1);
    expect(readFlowRecord('KASIR-TEST-1').printedAt).toBeTruthy();

    // Further polls must not create a second sale, stock change or print.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    await flush();
    expect(JSON.parse(localStorage.getItem(KEYS.sales) ?? '[]')).toHaveLength(1);
    expect(
      (JSON.parse(localStorage.getItem(KEYS.products) ?? '[]') as Array<{ stock: number }>)[0].stock,
    ).toBe(2);
  });

  it('keeps Cash checkout manual: no auto print, no reload', async () => {
    installFetch(['pending']);
    const { container } = render(
      <AppProvider>
        <App />
      </AppProvider>,
    );
    await flush();

    await act(async () => {
      (container.querySelector('#fab') as HTMLElement).click();
    });
    await act(async () => {
      (container.querySelector('#overlay-root .s-row') as HTMLElement).click();
    });
    await clickText(container, 'Continue to Quantity');
    await clickText(container, 'Continue to Payment');

    const cash = container.querySelector('#cash-input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(cash, '20000');
      cash.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await clickText(container, 'Complete Payment');
    await flush();

    const sales = JSON.parse(localStorage.getItem(KEYS.sales) ?? '[]') as Sale[];
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ paymentMethod: 'Cash', total: 18000, change: 2000 });
    expect(sales[0].midtransOrderId).toBeUndefined();
    expect(window.print).not.toHaveBeenCalled();
    expect(container.querySelector('.receipt-ov')).toBeTruthy();
  });

  it('never completes when Midtrans reports a failure status', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/payments/config')) {
        return jsonResponse({
          provider: 'midtrans',
          configured: true,
          environment: 'sandbox',
          qrisExpiryMinutes: 15,
        });
      }
      if (url.endsWith('/api/payments/qris')) {
        return jsonResponse(
          {
            orderId: 'KASIR-TEST-2',
            midtransOrderId: 'KASIR-TEST-2',
            status: 'pending',
            amount: 18000,
            expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
            transactionId: 'tx-2',
            paidAt: null,
            qrImageUrl: '/api/payments/KASIR-TEST-2/qr',
            environment: 'sandbox',
          },
          201,
        );
      }
      return jsonResponse({
        orderId: 'KASIR-TEST-2',
        midtransOrderId: 'KASIR-TEST-2',
        status: 'denied',
        transactionStatus: 'deny',
        amount: 18000,
        transactionId: null,
        paidAt: null,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        environment: 'sandbox',
        verified: false,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <AppProvider>
        <App />
      </AppProvider>,
    );
    await flush();
    await openQrisCashier(container);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3200);
    });
    await flush();

    expect(JSON.parse(localStorage.getItem(KEYS.sales) ?? '[]')).toEqual([]);
    expect(
      (JSON.parse(localStorage.getItem(KEYS.products) ?? '[]') as Array<{ stock: number }>)[0].stock,
    ).toBe(3);
    expect(window.print).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Payment denied');
  });
});
