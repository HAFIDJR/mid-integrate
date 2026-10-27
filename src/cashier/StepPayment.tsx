import type { ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { fmtRp } from '../lib/format';
import type { PaymentMethod } from '../state/types';

const METHODS: Array<{ id: PaymentMethod; icon: string }> = [
  { id: 'Cash', icon: 'banknote' },
  { id: 'QRIS', icon: 'qr' },
  { id: 'Card', icon: 'card' },
];

interface StepPaymentProps {
  pay: PaymentMethod;
  total: number;
  cash: string;
  onPay: (method: PaymentMethod) => void;
  onCash: (value: string) => void;
  qrisPanel: ReactNode;
}

export function StepPayment({ pay, total, cash, onPay, onCash, qrisPanel }: StepPaymentProps) {
  const cashValue = Number.parseInt(cash, 10) || 0;
  const diff = cashValue - total;

  return (
    <>
      <div className="pay-methods" id="pay-methods">
        {METHODS.map((method) => (
          <button
            key={method.id}
            className={`pay-pill ${pay === method.id ? 'on' : ''}`}
            onClick={() => onPay(method.id)}
          >
            <Icon name={method.icon} size={20} />
            <span>{method.id}</span>
          </button>
        ))}
      </div>

      {pay === 'Cash' ? (
        <>
          <div className="field">
            <label>Cash received</label>
            <div className="cash-box">
              <span className="cash-rp">Rp</span>
              <input
                id="cash-input"
                inputMode="numeric"
                placeholder="0"
                value={cash}
                onChange={(event) => onCash(event.target.value.replace(/\D/g, ''))}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="denoms">
            <button className="denom" onClick={() => onCash(String(total))}>
              Exact
            </button>
            <button className="denom" onClick={() => onCash('50000')}>
              Rp 50.000
            </button>
            <button className="denom" onClick={() => onCash('100000')}>
              Rp 100.000
            </button>
            <button className="denom" onClick={() => onCash('200000')}>
              Rp 200.000
            </button>
          </div>
        </>
      ) : pay === 'QRIS' ? (
        qrisPanel
      ) : (
        <div className="qr-note">
          <Icon name="card" size={26} />
          <div>
            <b>Card payment</b>
            <span>
              Charge <b>{fmtRp(total)}</b> on your card terminal, then complete the sale.
            </span>
          </div>
        </div>
      )}

      <div className="panel pay-summary" id="pay-summary">
        {pay === 'Cash' ? (
          <>
            <div className="ps-row">
              <span>Amount due</span>
              <b>{fmtRp(total)}</b>
            </div>
            <div className="ps-row">
              <span>Cash received</span>
              <b>{fmtRp(cashValue)}</b>
            </div>
            {diff >= 0 ? (
              <div className="ps-row strong">
                <span>Change</span>
                <b className="good">{fmtRp(diff)}</b>
              </div>
            ) : (
              <>
                <div className="ps-row strong">
                  <span>Short</span>
                  <b className="bad">{fmtRp(-diff)}</b>
                </div>
                <div className="warn-chip">
                  <Icon name="alert" size={14} /> Cash received is not enough — short by{' '}
                  {fmtRp(-diff)}.
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="ps-row">
              <span>Amount due</span>
              <b>{fmtRp(total)}</b>
            </div>
            <div className="ps-row">
              <span>Method</span>
              <b>{pay}</b>
            </div>
          </>
        )}
      </div>
    </>
  );
}
