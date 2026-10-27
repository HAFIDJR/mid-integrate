import 'dotenv/config';
import path from 'node:path';

export interface MidtransConfig {
  /** Midtrans Server Key. Server only — never exposed through the API or the browser bundle. */
  serverKey: string;
  /** false = sandbox (api.sandbox.midtrans.com), true = production (api.midtrans.com). */
  isProduction: boolean;
  /** QR validity requested from Midtrans, in minutes. */
  qrisExpiryMinutes: number;
  /** Optional QRIS acquirer (e.g. "gopay"). Left undefined lets Midtrans pick its default. */
  acquirer?: string;
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

/**
 * Build the runtime configuration from environment variables.
 * Only `MIDTRANS_SERVER_KEY` is secret; everything else is safe to document.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const acquirer = (env.MIDTRANS_QRIS_ACQUIRER || '').trim();
  return {
    port: readInteger(env.PORT, 3001, 1, 65535),
    host: env.HOST?.trim() || '0.0.0.0',
    midtrans: {
      serverKey: (env.MIDTRANS_SERVER_KEY || '').trim(),
      isProduction: readBoolean(env.MIDTRANS_IS_PRODUCTION, false),
      qrisExpiryMinutes: readInteger(env.MIDTRANS_QRIS_EXPIRY_MINUTES, 15, 1, 10080),
      ...(acquirer ? { acquirer } : {}),
    },
    orderStorePath: env.ORDER_STORE_PATH?.trim() || path.resolve(process.cwd(), '.data/orders.json'),
    staticDir: env.STATIC_DIR?.trim() || path.resolve(process.cwd(), 'dist'),
    midtransTimeoutMs: readInteger(env.MIDTRANS_TIMEOUT_MS, 12000, 1000, 60000),
  };
}

export function isMidtransConfigured(config: ServerConfig): boolean {
  return config.midtrans.serverKey.length > 0;
}
