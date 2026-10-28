import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { isMidtransConfigured, loadConfig } from './config.js';
import { HttpMidtransGateway } from './midtrans.js';
import { OrderStore } from './orders.js';

async function main() {
  const config = loadConfig();
  const store = await OrderStore.open(config.orderStorePath);
  const gateway = new HttpMidtransGateway(
    config.midtrans,
    globalThis.fetch as never,
    config.midtransTimeoutMs,
  );
  const api = createApp({ config, store, gateway });

  const app = express();
  app.disable('x-powered-by');
  app.use(api);

  const indexFile = path.join(config.staticDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    app.use(express.static(config.staticDir, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      return res.sendFile(indexFile);
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .status(200)
        .type('text/plain')
        .send('Kasir Digital API is running. Build the frontend with `npm run build`.\n');
    });
  }

  const server = app.listen(config.port, config.host, () => {
    const env = config.midtrans.isProduction ? 'production' : 'sandbox';
    console.log(`[kasir] API listening on http://${config.host}:${config.port}`);
    console.log(
      `[kasir] Midtrans: ${isMidtransConfigured(config) ? `configured (${env})` : 'NOT configured — QRIS charges are disabled'}`,
    );
    console.log(`[kasir] Order store: ${config.orderStorePath}`);
    if (config.devSimulate) {
      console.warn(
        '[kasir] DEV payment simulation ENABLED — POST /api/payments/:orderId/simulate settles orders locally. Never enable this in production.',
      );
    }
  });

  const shutdown = (signal: string) => {
    console.log(`[kasir] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('[kasir] failed to start', error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
});
