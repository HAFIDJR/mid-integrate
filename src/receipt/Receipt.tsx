import { useCallback, useEffect, useRef } from 'react';
import { Icon } from '../components/Icon';
import { Overlay } from '../hooks/useOverlay';
import { fmtDate, fmtRp, fmtTime } from '../lib/format';
import { useApp } from '../state/AppContext';
import type { Sale } from '../state/types';

interface ReceiptProps {
  sale: Sale;
  onClose: () => void;
  /** Fired once the receipt DOM, fonts and styles are ready (used for auto-print). */
  onReady?: () => void;
}

export function Receipt({ sale, onClose, onReady }: ReceiptProps) {
  const { store } = useApp();
  const paperWrapRef = useRef<HTMLDivElement | null>(null);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const readyRef = useRef(false);

  // Animate the paper out of the printer exactly like the vanilla version.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const wrap = paperWrapRef.current;
        const paper = paperRef.current;
        if (wrap && paper) wrap.style.maxHeight = paper.offsetHeight + 30 + 'px';
      });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Resolve the auto-print gate after two paint frames + web fonts.
  useEffect(() => {
    let cancelled = false;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const finish = () => {
          if (cancelled || readyRef.current) return;
          readyRef.current = true;
          onReady?.();
        };
        const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
        if (fonts?.ready) {
          fonts.ready.then(finish).catch(finish);
        } else {
          finish();
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [onReady]);

  const sendWhatsApp = useCallback(() => {
    const lines = [
      `*${store.storeName} — Receipt ${sale.saleNumber}*`,
      fmtDate(sale.date) + ' · ' + fmtTime(sale.date),
      sale.customerName ? `Customer: ${sale.customerName}` : '',
      '──────────────',
      ...sale.items.map(
        (item) => `${item.qty}× ${item.name} — ${fmtRp(item.price * item.qty)}`,
      ),
      '──────────────',
      `*Total: ${fmtRp(sale.total)}*`,
    ];
    if (sale.paymentMethod === 'Cash') {
      lines.push(`Cash: ${fmtRp(sale.cashReceived)}`, `Change: ${fmtRp(sale.change)}`);
    } else {
      lines.push(`Paid via ${sale.paymentMethod}`);
    }
    lines.push('Thank you!');
    const digits = (sale.customerPhone || '').replace(/\D/g, '');
    const full = digits ? (digits.startsWith('0') ? '62' + digits.slice(1) : digits) : '';
    const url = full
      ? `https://wa.me/${full}?text=${encodeURIComponent(lines.join('\n'))}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(url, '_blank', 'noopener');
  }, [sale, store.storeName]);

  return (
    <Overlay className="receipt-ov" onClose={onClose}>
      {() => (
        <div className="receipt-stage">
          <div className="printer-block">
            <div className="printer">
              <span className="printer-led" />
            </div>
            <div className="paper-wrap" id="paper-wrap" ref={paperWrapRef}>
              <div className="paper" id="receipt-paper" ref={paperRef}>
                <div className="r-head">
                  <div className="r-logo">{store.logo}</div>
                  <div className="r-store">{store.storeName}</div>
                  <div className="r-sub">
                    {store.businessType} · {store.ownerName}
                  </div>
                </div>
                <div className="r-sep" />
                <div className="r-meta">
                  <div>
                    {sale.saleNumber}
                    <br />
                    {fmtDate(sale.date)}
                    <br />
                    {fmtTime(sale.date)}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {sale.customerName || 'Walk-in Customer'}
                    {sale.customerPhone ? (
                      <>
                        <br />
                        {sale.customerPhone}
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="r-sep" />
                {sale.items.map((item, index) => (
                  <div className="r-item" key={`${item.productId}-${index}`}>
                    <div className="r-iname">{item.name}</div>
                    <div className="r-iline">
                      <span>
                        {item.qty} × {fmtRp(item.price)}
                      </span>
                      <span className="r-fill" />
                      <span>{fmtRp(item.price * item.qty)}</span>
                    </div>
                  </div>
                ))}
                <div className="r-sep" />
                <div className="ps-row" style={{ color: '#4a4943' }}>
                  <span>Subtotal</span>
                  <span>{fmtRp(sale.total)}</span>
                </div>
                <div className="r-total">
                  <span>TOTAL</span>
                  <span>{fmtRp(sale.total)}</span>
                </div>
                {sale.paymentMethod === 'Cash' ? (
                  <>
                    <div className="r-row">
                      <span>Cash received</span>
                      <span>{fmtRp(sale.cashReceived)}</span>
                    </div>
                    <div className="r-row">
                      <span>Change</span>
                      <span>{fmtRp(sale.change)}</span>
                    </div>
                  </>
                ) : (
                  <div className="r-row">
                    <span>Paid via</span>
                    <span>{sale.paymentMethod}</span>
                  </div>
                )}
                <div className="r-sep" />
                <div className="r-paid-box">
                  <div className="r-steps">
                    <span className="r-step">
                      <span className="r-dot">✓</span>CART
                    </span>
                    <span className="r-step-line" />
                    <span className="r-step">
                      <span className="r-dot">✓</span>PAYMENT
                    </span>
                    <span className="r-step-line" />
                    <span className="r-step">
                      <span className="r-dot">✓</span>RECEIPT
                    </span>
                  </div>
                  <span className="r-stamp">PAID</span>
                </div>
                <div className="r-thanks">
                  Thank you for your purchase!
                  <br />
                  <small>— {store.storeName} · Kasir Digital</small>
                </div>
                <div className="paper-tear" />
              </div>
            </div>
          </div>
          <div className="receipt-actions">
            <button className="btn ghost" onClick={() => window.print()}>
              <Icon name="printer" size={16} /> Print
            </button>
            <button className="btn ghost" onClick={sendWhatsApp}>
              <Icon name="message" size={16} /> WhatsApp
            </button>
            <button className="btn primary" onClick={onClose}>
              <Icon name="plus" size={16} /> New Sale
            </button>
          </div>
        </div>
      )}
    </Overlay>
  );
}
