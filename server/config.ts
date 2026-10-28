import 'dotenv/config';
import path from 'node:path';

/**
 * QRIS acquirers Midtrans accepts on Core API `/v2/charge`.
 * `airpay shopee` is the literal value (with the space) for ShopeePay.
 */
export const ALLOWED_QRIS_ACQUIRERS = ['gopay', 'airpay shopee'] as const;

export type QrisAcquirer = (typeof ALLOWED_QRIS_ACQUIRERS)[number];

export interface MidtransConfig {
  /** Midtrans Server Key. Server only — never exposed through the API or the browser bundle. */
  serverKey: string;
  /** false = sandbox (api.sandbox.midtrans.com), true = production (api.midtrans.com). */
  isProduction: boolean;
  /** QR validity requested from Midtrans, in minutes. */
  qrisExpiryMinutes: number;
  /** Optional QRIS acquirer (e.g. "gopay"). Left undefined lets Midtrans pick its default. */
  acquirer?: QrisAcquirer;
}

export interface ServerConfig {
  port: number;
  host: string;
  midtrans: MidtransConfig;
  /** Durable order metadata file. Use ":memory:" in tests. */
  orderStorePath: string;
  staticDir: string;
  /** Timeout for outbound Midtrans calls. */
  midtransTimeoutMs: number;
  /**
   * Dev-only escape hatch: enables `POST /api/payments/:orderId/simulate` so a QRIS
   * order can be settled locally without Midtrans's web simulator. Always off in
   * production, even if `MIDTRANS_DEV_SIMULATE=1` is set.
   */
  devSimulate: boolean;
}

/** Thrown for invalid configuration so the process can fail fast with a readable message. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function readInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function readAcquirer(value: string | undefined): QrisAcquirer | undefined {
  const raw = (value || '').trim().toLowerCase();
  if (!raw) return undefined;
  if ((ALLOWED_QRIS_ACQUIRERS as readonly string[]).includes(raw)) return raw as QrisAcquirer;
  throw new ConfigError(
    `MIDTRANS_QRIS_ACQUIRER must be "${ALLOWED_QRIS_ACQUIRERS.join('" or "')}" (got "${value}"). ` +
      'Leave it empty to let Midtrans use its default acquirer.',
  );
}

/**
 * Build the runtime configuration from environment variables.
 * Only `MIDTRANS_SERVER_KEY` is secret; everything else is safe to document.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const isProduction = readBoolean(env.MIDTRANS_IS_PRODUCTION, false);
  const acquirer = readAcquirer(env.MIDTRANS_QRIS_ACQUIRER);
  const requestedSimulation = readBoolean(env.MIDTRANS_DEV_SIMULATE, false);
  if (requestedSimulation && isProduction) {
    console.warn(
      '[kasir] MIDTRANS_DEV_SIMULATE is ignored because MIDTRANS_IS_PRODUCTION=true. ' +
        'Payment simulation is never available in production.',
    );
  }
  return {
    port: readInteger(env.PORT, 3001, 1, 65535),
    host: env.HOST?.trim() || '0.0.0.0',
    midtrans: {
      serverKey: (env.MIDTRANS_SERVER_KEY || '').trim(),
      isProduction,
      qrisExpiryMinutes: readInteger(env.MIDTRANS_QRIS_EXPIRY_MINUTES, 15, 1, 10080),
      ...(acquirer ? { acquirer } : {}),
    },
    orderStorePath: env.ORDER_STORE_PATH?.trim() || path.resolve(process.cwd(), '.data/orders.json'),
    staticDir: env.STATIC_DIR?.trim() || path.resolve(process.cwd(), 'dist'),
    midtransTimeoutMs: readInteger(env.MIDTRANS_TIMEOUT_MS, 12000, 1000, 60000),
    devSimulate: requestedSimulation && !isProduction,
  };
}

export function isMidtransConfigured(config: ServerConfig): boolean {
  return config.midtrans.serverKey.length > 0;
}
