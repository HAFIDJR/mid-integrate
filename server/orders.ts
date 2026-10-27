import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { OrderRecord } from './types.js';

const RETENTION_MS = 45 * 24 * 60 * 60 * 1000; // keep 45 days of payment metadata

/**
 * Durable payment-order store.
 *
 * Orders are kept in memory for fast reads and persisted atomically to a JSON file
 * so verified payment state survives a server restart. A single-instance deployment
 * can rely on this file; swap in a database for multi-instance deployments.
 */
export class OrderStore {
  private readonly orders = new Map<string, OrderRecord>();
  private writeChain: Promise<void> = Promise.resolve();
  private readonly filePath: string | null;

  private constructor(filePath: string | null) {
    this.filePath = filePath;
  }

  static async open(filePath: string | null): Promise<OrderStore> {
    const store = new OrderStore(filePath === ':memory:' ? null : filePath);
    await store.load();
    return store;
  }

  private async load(): Promise<void> {
    const filePath = this.filePath;
    if (!filePath) return;
    try {
      const raw = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const cutoff = Date.now() - RETENTION_MS;
      for (const entry of parsed) {
        if (!entry || typeof entry !== 'object') continue;
        const order = entry as OrderRecord;
        if (typeof order.orderId !== 'string') continue;
        if (new Date(order.createdAt).getTime() < cutoff) continue;
        this.orders.set(order.orderId, order);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        // Corrupt or unreadable store: start empty but keep the old file for inspection.
        console.error('[orders] could not read the order store; starting empty', code ?? 'unknown');
      }
    }
  }

  get size(): number {
    return this.orders.size;
  }

  get(orderId: string): OrderRecord | undefined {
    return this.orders.get(orderId);
  }

  findByIdempotencyKey(key: string): OrderRecord | undefined {
    let found: OrderRecord | undefined;
    for (const order of this.orders.values()) {
      if (order.idempotencyKey !== key) continue;
      if (!found || order.createdAt > found.createdAt) found = order;
    }
    return found;
  }

  findReusablePending(cartHash: string, amount: number, now = Date.now()): OrderRecord | undefined {
    let found: OrderRecord | undefined;
    for (const order of this.orders.values()) {
      if (order.status !== 'pending') continue;
      if (order.cartHash !== cartHash || order.amount !== amount) continue;
      if (order.expiresAt && new Date(order.expiresAt).getTime() <= now) continue;
      if (!found || order.createdAt > found.createdAt) found = order;
    }
    return found;
  }

  has(orderId: string): boolean {
    return this.orders.has(orderId);
  }

  async save(order: OrderRecord): Promise<void> {
    this.orders.set(order.orderId, { ...order });
    await this.persist();
  }

  async update(
    orderId: string,
    patch: Partial<OrderRecord>,
  ): Promise<OrderRecord | undefined> {
    const current = this.orders.get(orderId);
    if (!current) return undefined;
    const next: OrderRecord = { ...current, ...patch, orderId: current.orderId };
    this.orders.set(orderId, next);
    await this.persist();
    return next;
  }

  private async persist(): Promise<void> {
    const filePath = this.filePath;
    if (!filePath) return;
    const snapshot = JSON.stringify([...this.orders.values()], null, 2);
    this.writeChain = this.writeChain.then(async () => {
      const dir = path.dirname(filePath);
      await fsp.mkdir(dir, { recursive: true });
      const tmp = `${filePath}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, snapshot, 'utf8');
      await fsp.rename(tmp, filePath);
    });
    try {
      await this.writeChain;
    } catch (error) {
      // Keep serving from memory; surface only the error code.
      console.error('[orders] persist failed', (error as NodeJS.ErrnoException).code ?? 'unknown');
    }
  }

  /** Test helper: drop everything (memory + file). */
  async clear(): Promise<void> {
    this.orders.clear();
    if (this.filePath && fs.existsSync(this.filePath)) {
      await fsp.rm(this.filePath, { force: true });
    }
  }
}
