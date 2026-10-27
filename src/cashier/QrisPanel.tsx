import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { fmtMMSS, fmtRp } from '../lib/format';
import type { QrisState } from '../payments/useQrisPayment';

interface QrisPanelProps {
  state: QrisState;
  storeName: string;
  total: number;
  configured: boolean;
  onCreate: () => void;
  onCheck: () => void;
}

function QrImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (failed) {
    return (
      <div className="qris-exp">
        <Icon name="alert" size={26} />
        <p>QR image could not be loaded.</p>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt="QRIS payment QR code"
      style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }}
      onError={() => setFailed(true)}
    />
  );
}

export function QrisPanel({ state, storeName, total, configured, onCreate, onCheck }: QrisPanelProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (state.phase !== 'pending') return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [state.phase, state.orderId]);

  const expiresAt = state.expiresAt ? Date.parse(state.expiresAt) : null;
  const remainingSeconds = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null;
  const locallyExpired = expiresAt != null && expiresAt <= now;

  let box: ReactNode;
  let status: ReactNode;
  let actions: ReactNode | null = null;
  let statusExpired = false;
  let hint: string | null = null;

  if (!configured) {
    box = (
      <div className="qris-box expired">
        <div className="qris-exp">
          <Icon name="alert" size={26} />
          <p>QRIS is not configured</p>
        </div>
      </div>
    );
    status = <>QRIS is disabled — the server has no Midtrans Server Key.</>;
    statusExpired = true;
    hint = 'Set MIDTRANS_SERVER_KEY on the server, then restart. See the README.';
  } else if (state.phase === 'creating') {
    box = (
      <div className="qris-box expired">
        <div className="qris-exp">
          <Icon name="clock" size={26} />
          <p>Creating your QR…</p>
        </div>
      </div>
    );
    status = <>Requesting a QRIS charge from Midtrans…</>;
  } else if (state.phase === 'paid') {
    box = (
      <div className="qris-box">
        <div className="qris-exp" style={{ color: 'var(--success)' }}>
          <Icon name="checkCircle" size={46} />
          <p>Payment received</p>
        </div>
      </div>
    );
    status = <>Verified by Midtrans · completing the sale…</>;
  } else if (state.phase === 'pending' && state.qrImageUrl && !locallyExpired) {
    box = (
      <div className="qris-box" key={state.orderId ?? 'qr'}>
        <QrImage url={state.qrImageUrl} />
      </div>
    );
    status = (
      <>
        Waiting for payment · expires in <b>{remainingSeconds != null ? fmtMMSS(remainingSeconds) : '--:--'}</b>
      </>
    );
    actions = (
      <div className="qris-actions">
        <button className="btn ghost sm" onClick={onCheck}>
          Check status
        </button>
        <button className="btn ghost sm" disabled title="Wait until this QR expires">
          Refresh QR
        </button>
      </div>
    );
  } else {
    const terminalExpired = state.terminal === 'expired';
    statusExpired = true;
    const title =
      state.phase === 'error'
        ? state.message ?? 'Could not create a QR'
        : terminalExpired || locallyExpired
          ? 'QR expired'
          : state.terminal === 'canceled'
            ? 'Payment canceled'
            : state.terminal === 'denied'
              ? 'Payment denied'
              : state.terminal === 'failed'
                ? 'Payment failed'
                : 'Ready to generate a QR';
    const canCreate = configured;
    box = (
      <div className="qris-box expired">
        <div className="qris-exp">
          <Icon
            name={state.phase === 'error' ? 'alert' : terminalExpired || locallyExpired ? 'clock' : 'qr'}
            size={26}
          />
          <p>{title}</p>
          {canCreate ? (
            <button className="btn primary sm" onClick={onCreate}>
              {state.phase === 'error' || locallyExpired || terminalExpired
                ? 'Refresh QR'
                : 'Generate QR'}
            </button>
          ) : null}
        </div>
      </div>
    );
    status = (
      <>
        {state.phase === 'error'
          ? 'Generate a new QR to try again.'
          : terminalExpired || locallyExpired
            ? 'Expired — refresh to get a new QR'
            : 'No active QR'}
      </>
    );
    if (state.phase === 'error' && state.message) hint = null;
  }

  return (
    <div className="panel qris-card">
      <div className="qris-head">
        <span className="badge accent">
          <Icon name="qr" size={12} /> QRIS
        </span>
        {state.environment ? (
          <span className="badge">{state.environment === 'production' ? 'Live' : 'Sandbox'}</span>
        ) : null}
      </div>
      <div className="qris-merch">{storeName}</div>
      <div className="qris-amt">
        <span>Scan &amp; pay exact amount</span>
        <b>{fmtRp(total)}</b>
      </div>
      {box}
      <div className={`qris-status ${statusExpired ? 'exp' : ''}`}>
        <i />
        {status}
      </div>
      {actions}
      {hint ? <p className="hint">{hint}</p> : null}
      {state.phase === 'pending' && !locallyExpired ? (
        <p className="hint">Payment is verified by the server — manual completion is disabled.</p>
      ) : null}
    </div>
  );
}
