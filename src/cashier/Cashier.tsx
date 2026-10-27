import { Fragment, useCallback, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Overlay } from '../hooks/useOverlay';
import { fmtRp, fmtTime } from '../lib/format';
import { addOrphanPayment, addPaymentAlert, clearPendingPayment } from '../state/storage';
import { useApp } from '../state/AppContext';
import { buildSale, cartTotal, reduceStock } from '../state/sales';
import type { CartItem, PaymentMethod, Product, Sale, SaleDraft } from '../state/types';
import type { QrisStatus } from '../payments/api';
import { finalizeQrisSale } from '../payments/finalize';
import { useQrisPayment, type AbandonedPayment } from '../payments/useQrisPayment';
import { StepProducts } from './StepProducts';
import { StepCart } from './StepCart';
import { StepPayment } from './StepPayment';
import { QrisPanel } from './QrisPanel';

const initialDraft = (): SaleDraft => ({
  step: 1,
  q: '',
  cat: 'All',
  cart: [],
  customer: { name: '', phone: '' },
  pay: 'Cash',
  cash: '',
});

const STEPS: Array<{ n: 1 | 2 | 3; label: string }> = [
  { n: 1, label: 'Products' },
  { n: 2, label: 'Cart' },
  { n: 3, label: 'Payment' },
];

export interface SaleCompletionOptions {
  autoPrint: boolean;
  orderId?: string;
  /** false when the sale could not be persisted — never reload in that case. */
  reload?: boolean;
}

interface CashierProps {
  onClose: () => void;
  onGoToProducts: () => void;
  onSaleComplete: (sale: Sale, options: SaleCompletionOptions) => void;
}

export function Cashier({ onClose, onGoToProducts, onSaleComplete }: CashierProps) {
  const { store, products, getSales, getProducts, commitSale, toast } = useApp();
  const [draft, setDraft] = useState<SaleDraft>(initialDraft);
  const [finalizing, setFinalizing] = useState(false);

  const total = cartTotal(draft.cart);
  const itemCount = draft.cart.reduce((count, item) => count + item.qty, 0);
  const cashValue = Number.parseInt(draft.cash, 10) || 0;

  const recordOrphan = useCallback((payment: AbandonedPayment) => {
    addOrphanPayment({
      orderId: payment.orderId,
      amount: payment.amount,
      expiresAt: payment.expiresAt,
      createdAt: new Date().toISOString(),
      reason: payment.reason,
    });
  }, []);

  /**
   * Stable callbacks handed to the payment hook: the hook stores the newest
   * callback in a ref, so the latest render's closure is always used.
   */
  const paidHandlerRef = useRef<(status: QrisStatus) => void>(() => undefined);
  const abandonHandlerRef = useRef<(payment: AbandonedPayment) => void>(() => undefined);
  const stablePaid = useCallback((status: QrisStatus) => paidHandlerRef.current(status), []);
  const stableAbandon = useCallback(
    (payment: AbandonedPayment) => abandonHandlerRef.current(payment),
    [],
  );

  const qris = useQrisPayment({
    cart: draft.cart,
    customer: draft.customer,
    enabled: draft.step === 3 && draft.pay === 'QRIS',
    onPaid: stablePaid,
    onAbandonPayment: stableAbandon,
  });

  abandonHandlerRef.current = recordOrphan;

  paidHandlerRef.current = (status: QrisStatus) => {
    const active = qris.getActiveOrder();
    const snapshot = qris.snapshot;
    const recordAlert = () =>
      addPaymentAlert({
        orderId: status.orderId,
        amount: status.amount,
        transactionId: status.transactionId,
        paidAt: status.paidAt,
        detectedAt: new Date().toISOString(),
      });

    if (!active || !snapshot) {
      recordAlert();
      toast('A QRIS payment was verified but the cart is gone. Check Reports.', 'warn');
      return;
    }

    const result = finalizeQrisSale({
      snapshot,
      customer: draft.customer,
      products: getProducts(),
      sales: getSales(),
      order: {
        orderId: active.orderId,
        amount: active.amount,
        snapshotKey: active.snapshotKey,
      },
      payment: status,
    });

    if (result.type === 'completed') {
      setFinalizing(true);
      const persisted = commitSale(result.sale, result.products);
      clearPendingPayment();
      onSaleComplete(result.sale, {
        autoPrint: true,
        orderId: status.orderId,
        reload: persisted.ok,
      });
      if (!persisted.ok) {
        toast('Sale saved in this tab only — storage is full, automatic refresh skipped.', 'warn');
      }
      return;
    }

    if (result.type === 'duplicate') {
      clearPendingPayment();
      toast('This payment was already completed.', 'info');
      if (result.sale) onSaleComplete(result.sale, { autoPrint: false });
      return;
    }

    recordAlert();
    toast('The verified payment did not match the open cart. Check Reports to reconcile.', 'warn');
  };

  const addToCart = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    if (product.stock <= 0) {
      toast('This product is out of stock', 'warn');
      return;
    }
    const existing = draft.cart.find((item) => item.productId === productId);
    if (existing) {
      if (existing.qty >= product.stock) {
        toast(`Only ${product.stock} ${product.unit} left in stock`, 'warn');
        return;
      }
      setDraft({
        ...draft,
        cart: draft.cart.map((item) =>
          item.productId === productId ? { ...item, qty: item.qty + 1 } : item,
        ),
      });
      return;
    }
    const cartItem: CartItem = {
      productId: product.id,
      name: product.name,
      price: product.price,
      unit: product.unit,
      photo: product.photoUrl || product.photo,
      qty: 1,
    };
    setDraft({ ...draft, cart: [...draft.cart, cartItem] });
  };

  const changeQty = (productId: string, delta: number) => {
    const existing = draft.cart.find((item) => item.productId === productId);
    if (!existing) return;
    if (delta > 0) {
      const product: Product | undefined = products.find((item) => item.id === productId);
      if (product && existing.qty >= product.stock) {
        toast(`Only ${product.stock} ${product.unit} left in stock`, 'warn');
        return;
      }
    }
    const cart = draft.cart
      .map((item) => (item.productId === productId ? { ...item, qty: item.qty + delta } : item))
      .filter((item) => item.qty > 0);
    setDraft({ ...draft, cart });
  };

  const goToStep = (step: number) => {
    if (step < draft.step) setDraft({ ...draft, step: step as SaleDraft['step'] });
    else if (step === draft.step + 1 && draft.cart.length > 0) {
      setDraft({ ...draft, step: step as SaleDraft['step'] });
    }
  };

  const choosePayment = (method: PaymentMethod) => {
    if (draft.pay === method) return;
    setDraft({ ...draft, pay: method });
    if (method === 'QRIS') void qris.createOrder();
  };

  const completeManual = () => {
    if (draft.cart.length === 0) return;
    if (draft.pay === 'Cash' && cashValue < total) {
      toast('Cash received is not enough', 'warn');
      return;
    }
    if (draft.pay === 'QRIS') {
      toast('QRIS completes automatically once Midtrans verifies the payment.', 'info');
      return;
    }
    const sale = buildSale({
      cart: draft.cart,
      customer: draft.customer,
      paymentMethod: draft.pay,
      cashReceived: draft.pay === 'Cash' ? cashValue : total,
      sales: getSales(),
    });
    const persisted = commitSale(sale, reduceStock(getProducts(), draft.cart));
    if (!persisted.ok) toast('Sale saved in this tab, but browser storage is full.', 'warn');
    onSaleComplete(sale, { autoPrint: false });
  };

  const qrisBusy = qris.state.phase === 'creating' || qris.state.phase === 'paid' || finalizing;
  const completeDisabled =
    qrisBusy || (draft.pay === 'Cash' && cashValue < total) || draft.pay === 'QRIS';

  const completeLabel =
    draft.pay !== 'QRIS'
      ? 'Complete Payment'
      : qris.state.phase === 'pending'
        ? 'Waiting for payment…'
        : qris.state.phase === 'creating'
          ? 'Creating QR…'
          : qris.state.phase === 'paid'
            ? 'Payment received'
            : 'Complete Payment';

  const qrisPanel = (
    <QrisPanel
      state={qris.state}
      storeName={store.storeName}
      total={total}
      configured={qris.state.config?.configured ?? true}
      onCreate={() => {
        void qris.createOrder({ force: true });
      }}
      onCheck={() => qris.checkNow()}
    />
  );

  return (
    <Overlay
      className="sale-ov"
      dismissible={!finalizing}
      onClose={() => {
        qris.dispose('cashier_closed');
        onClose();
      }}
    >
      {(requestClose) => (
        <div className="sale-sheet rise">
          <div className="sale-head">
            <div>
              <h2 className="sale-title">New Sale</h2>
              <p className="sale-sub">
                {store.storeName} · {fmtTime(new Date())}
              </p>
            </div>
            <button className="icon-btn" onClick={requestClose} aria-label="Close cashier">
              <Icon name="x" size={18} />
            </button>
          </div>

          <div className="stepper">
            {STEPS.map((step, index) => {
              const state =
                step.n < draft.step ? 'done' : step.n === draft.step ? 'active' : 'todo';
              return (
                <Fragment key={step.n}>
                  {index ? <i className="st-line" /> : null}
                  <button
                    className={`step ${state}`}
                    onClick={() => goToStep(step.n)}
                    disabled={step.n >= draft.step}
                  >
                    <span className="st-ic">
                      {step.n < draft.step ? <Icon name="check" size={13} /> : step.n}
                    </span>
                    <span className="st-lb">{step.label}</span>
                  </button>
                </Fragment>
              );
            })}
          </div>

          <div className="sale-body">
            {draft.step === 1 ? (
              <StepProducts
                products={products}
                cart={draft.cart}
                query={draft.q}
                category={draft.cat}
                onQuery={(value) => setDraft({ ...draft, q: value })}
                onCategory={(value) => setDraft({ ...draft, cat: value })}
                onAdd={addToCart}
                onQty={changeQty}
                onGoToProducts={() => {
                  qris.dispose('go_to_products');
                  onGoToProducts();
                }}
              />
            ) : draft.step === 2 ? (
              <StepCart
                cart={draft.cart}
                customer={draft.customer}
                total={total}
                onCustomer={(customer) => setDraft({ ...draft, customer })}
                onQty={changeQty}
                onRemove={(productId) =>
                  setDraft({
                    ...draft,
                    cart: draft.cart.filter((item) => item.productId !== productId),
                  })
                }
                onClear={() => setDraft({ ...draft, cart: [] })}
              />
            ) : (
              <StepPayment
                pay={draft.pay}
                total={total}
                cash={draft.cash}
                onPay={choosePayment}
                onCash={(value) => setDraft({ ...draft, cash: value })}
                qrisPanel={qrisPanel}
              />
            )}
          </div>

          <div className="sale-foot" id="sale-foot">
            {draft.step === 3 ? (
              <>
                <div className="bar-meta">
                  Total<span>{fmtRp(total)}</span>
                </div>
                <button
                  className="btn primary grow"
                  id="btn-complete"
                  onClick={completeManual}
                  disabled={completeDisabled}
                >
                  {completeLabel}
                </button>
              </>
            ) : (
              <>
                <div className="bar-meta">
                  <b id="bar-count">{itemCount}</b> items
                  <span id="bar-total">{fmtRp(total)}</span>
                </div>
                <button
                  className="btn primary grow"
                  id={draft.step === 1 ? 'btn-c1' : 'btn-c2'}
                  disabled={itemCount === 0}
                  onClick={() => goToStep(draft.step + 1)}
                >
                  {draft.step === 1 ? 'Continue to Quantity' : 'Continue to Payment'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Overlay>
  );
}
