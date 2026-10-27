# Kasir Digital

A mobile-first point of sale for small shops: products, cashier, receipts and reports, plus **real
Midtrans QRIS payments** created and verified on the server.

The UI is the original Kasir Digital interface, ported to **React + Vite + TypeScript** with the same
styles, layout, animations and `localStorage` data. The static "paste your QRIS string" demo is gone;
QR codes now come from the Midtrans **Core API** (`/v2/charge`) and every payment is confirmed by the
server before a sale exists.

---

## Requirements

- Node.js **20.19+** (developed on Node 22)
- A [Midtrans](https://midtrans.com) account — sandbox is enough to try the QRIS flow

## Quick start

```bash
npm install
cp .env.example .env      # optional: add a Midtrans Sandbox server key
npm run dev               # API on :3001 + Vite on :5173
```

Open <http://localhost:5173>. Vite proxies `/api/*` to the API server, so the browser only ever calls
relative URLs.

Without `MIDTRANS_SERVER_KEY` the whole app still works — Cash and Card sales, products, reports —
but QRIS is disabled and the payment panel explains why. **No demo QR fallback exists.**

## Scripts

| Command             | What it does                                                     |
| ------------------- | ---------------------------------------------------------------- |
| `npm run dev`       | API (`tsx watch`) + Vite dev server with `/api` proxy            |
| `npm run build`     | Type-check and build the web app (`dist/`) and the API (`dist-server/`) |
| `npm start`         | Serve `dist/` and the API from one Express process               |
| `npm test`          | Run the Vitest suite (server + client)                            |
| `npm run typecheck` | Type-check app, server and tests                                  |
| `npm run preview`   | Preview the built frontend (API must be running separately)       |

## Environment variables

All of these are **server-side**. Nothing is read through `VITE_*`, so no secret can leak into the
browser bundle.

| Variable                       | Default              | Purpose                                                        |
| ------------------------------ | -------------------- | -------------------------------------------------------------- |
| `MIDTRANS_SERVER_KEY`          | *(empty)*            | Midtrans server key. Empty = QRIS disabled. **Secret.**         |
| `MIDTRANS_IS_PRODUCTION`       | `false`              | `false` = `api.sandbox.midtrans.com`, `true` = `api.midtrans.com` |
| `MIDTRANS_QRIS_EXPIRY_MINUTES` | `15`                 | Requested QR validity (1–10080 minutes)                         |
| `MIDTRANS_QRIS_ACQUIRER`       | *(empty)*            | Optional acquirer, e.g. `gopay`                                 |
| `MIDTRANS_TIMEOUT_MS`          | `12000`              | Timeout for outbound Midtrans calls                             |
| `PORT`                         | `3001`               | API/server port                                                 |
| `HOST`                         | `0.0.0.0`            | Bind address                                                    |
| `ORDER_STORE_PATH`             | `.data/orders.json`  | JSON file with order/status metadata (git-ignored)              |
| `STATIC_DIR`                   | `dist`               | Built frontend served by `npm start`                            |

`.env` is git-ignored; only `.env.example` with empty placeholders is committed.

## Midtrans sandbox setup

1. Log in to <https://dashboard.sandbox.midtrans.com> → **Settings → Access Keys** and copy the
   **Server Key** (starts with `SB-Mid-server-`).
2. Put it in `.env`:

   ```dotenv
   MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxxxxxx
   MIDTRANS_IS_PRODUCTION=false
   ```

3. Restart `npm run dev`. `GET /api/payments/config` should now return `"configured": true`, and the
   Settings screen shows the sandbox badge instead of the "not configured" notice.
4. In **Settings → Configuration → Payment Notification URL** set:

   ```
   https://<your-public-host>/api/payments/midtrans/notification
   ```

   For local development expose the API port with a tunnel (ngrok, Cloudflare Tunnel, …) and use that
   public HTTPS host. The app does not need the notification URL itself — it polls
   `GET /api/payments/:orderId/status`, which the server re-verifies with Midtrans.
5. Ring up a sale → **QRIS** → **Generate QR**, then pay the QR with the Midtrans sandbox QRIS
   simulator (or any sandbox e-wallet app). The screen flips to "Payment received" only when the
   server reports a verified `settlement`.
6. For production, set a live server key and `MIDTRANS_IS_PRODUCTION=true`.

> Sandbox and production keys are **not** interchangeable. A sandbox key with
> `MIDTRANS_IS_PRODUCTION=true` (or the reverse) fails with a Midtrans authentication error.

## How the QRIS flow works

Server (`server/`):

- `POST /api/payments/qris` — validates the cart (`items[]`, `grossAmount`, positive integer prices,
  quantities and totals that reconcile), then creates a Midtrans Core API charge with a unique
  `order_id`. Returns only `orderId`, the normalized status, amount, QR image URL, expiry and
  environment. Replaying the same `Idempotency-Key` returns the existing order instead of charging
  twice.
- `GET /api/payments/:orderId/status` — asks Midtrans for the current status and maps it
  (`pending` / `paid` / `expired` / `canceled` / `denied` / `failed` / `unknown`). Only `settlement`
  (or `capture` with `accept`) counts as **paid**.
- `POST /api/payments/midtrans/notification` — verifies `signature_key`
  (`SHA-512(order_id + status_code + gross_amount + serverKey)`), validates the order id and amount,
  then stores the new status. Notifications can arrive many times; the handler is idempotent.
- `GET /api/payments/:orderId/qr` — proxies the QR image from Midtrans's QR host so the browser never
  needs a cross-origin request.
- Orders live in `ORDER_STORE_PATH` so a restart does not forget an in-flight payment.

Client (`src/payments/`):

- Selecting QRIS creates **one** order per cart snapshot; the action is guarded, so double clicks,
  Strict Mode and re-renders cannot create a second charge.
- Status is polled every ~3 s with an abort controller. Polling stops on success, unmount, closing the
  cashier, switching payment method or replacing the order. Responses for a different order id or
  amount are ignored.
- Changing the cart invalidates the QR; an expired QR needs a new charge.
- The **Complete Payment** button is disabled for QRIS — there is no manual "mark as paid".

Finalization (`src/payments/finalize.ts`) is keyed by the verified `order_id`: it re-checks the amount,
stops polling, writes the sale (with `midtransOrderId`, `midtransTransactionId` and the verified
timestamp), reduces stock once, closes the cashier and shows the animated receipt. A late settlement
for an order that is no longer on screen is reported for reconciliation instead of being dropped.

Successful QRIS sales print the receipt once (after the DOM/fonts are ready) and then reload the page
once (after `afterprint`, with a bounded fallback). Cash and Card keep the original manual receipt and
Print button.

## Data and privacy

`localStorage` keys are unchanged from the vanilla app: `kasir_onboarded`, `kasir_store`,
`kasir_products`, `kasir_sales`. Existing data keeps working, and sales recorded before this update
(without Midtrans fields) still render.

The Midtrans Server Key never reaches the browser: it is not in `VITE_*`, not in the bundle, not in an
API response, not in `localStorage`, and not in the Settings screen. Settings only shows whether QRIS
is configured and in which environment.

## Tests

```bash
npm test
```

- `tests/server/midtrans.test.ts` — signature vector, status mapping, amount parsing, request
  validation, Midtrans client (auth header, expiry, timeouts, QR host allowlist).
- `tests/server/api.test.ts` — the three endpoints through `supertest` with a fake Midtrans gateway:
  idempotency, the 400 validation matrix, 503 when unconfigured, timeouts, notifications and disk
  persistence.
- `tests/client/*` — pending-order guards, polling/idempotent finalization, print/reload coordinator,
  storage migration and a full QRIS checkout with a mocked `fetch`.

No real credentials are needed: every Midtrans call is stubbed.

## Limitations

- **No live transaction was executed while building this.** The Midtrans client, signature check and
  status mapping are unit tested against documented payloads, but a real sandbox/live payment and a
  real notification webhook have not been exercised here.
- **No physical printer was tested.** "Print" opens the browser print dialog using the existing 72 mm
  receipt stylesheet; the auto-print/reload behaviour depends on the browser firing `afterprint`
  (a timeout is used as a fallback). Silent ESC/POS or thermal-printer output is not implemented.
- Receipts and the app state live in this browser's `localStorage`; clearing site data removes them.
  The server only stores Midtrans order metadata for verification.
- Amounts are integer Indonesian rupiah; there is no multi-currency, tax, discount or multi-register
  support (unchanged from the original app).
- Visual checks (mobile widths, light/dark, print preview) must be done in a real browser — the
  automated tests cover behaviour and markup, not pixels.
