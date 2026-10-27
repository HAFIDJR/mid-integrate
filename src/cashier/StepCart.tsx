import { Icon, Thumb } from '../components/Icon';
import { fmtRp } from '../lib/format';
import type { CartItem, Customer } from '../state/types';

interface StepCartProps {
  cart: CartItem[];
  customer: Customer;
  total: number;
  onCustomer: (customer: Customer) => void;
  onQty: (productId: string, delta: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
}

export function StepCart({ cart, customer, total, onCustomer, onQty, onRemove, onClear }: StepCartProps) {
  return (
    <>
      <div className="panel cust-card">
        <h3 className="panel-title">
          <Icon name="user" size={15} /> Customer <span className="panel-tag">optional</span>
        </h3>
        <div className="field-2col">
          <div className="field">
            <label>Name</label>
            <input
              className="input"
              placeholder="Walk-in"
              value={customer.name}
              onChange={(event) => onCustomer({ ...customer, name: event.target.value })}
            />
          </div>
          <div className="field">
            <label>WhatsApp</label>
            <input
              className="input"
              inputMode="tel"
              placeholder="08xx xxxx xxxx"
              value={customer.phone}
              onChange={(event) => onCustomer({ ...customer, phone: event.target.value })}
            />
          </div>
        </div>
      </div>
      <div className="cart-head">
        <h3 className="panel-title no-mb">
          <Icon name="bag" size={15} /> Cart Items
        </h3>
        <button className="link-danger" id="cart-clear" hidden={cart.length === 0} onClick={onClear}>
          <Icon name="trash" size={13} /> Clear
        </button>
      </div>
      <div id="sale-cart">
        {cart.length === 0 ? (
          <div className="empty">
            <Icon name="bag" size={24} />
            <p>Your cart is empty.</p>
          </div>
        ) : (
          cart.map((item) => (
            <div className="cart-row" key={item.productId}>
              <Thumb source={{ photo: item.photo }} className="p-thumb sm" />
              <div className="cart-mid">
                <div className="cart-top">
                  <span className="cart-name">{item.name}</span>
                  <b className="cart-amt">{fmtRp(item.price * item.qty)}</b>
                </div>
                <div className="cart-bot">
                  <span className="cart-unit">
                    {item.qty} × {fmtRp(item.price)} / {item.unit}
                  </span>
                  <div className="qty-ctl">
                    <button onClick={() => onQty(item.productId, -1)} aria-label="Decrease">
                      <Icon name="minus" size={13} />
                    </button>
                    <b>{item.qty}</b>
                    <button onClick={() => onQty(item.productId, 1)} aria-label="Increase">
                      <Icon name="plus" size={13} />
                    </button>
                  </div>
                  <button
                    className="cart-x"
                    onClick={() => onRemove(item.productId)}
                    aria-label="Remove item"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="cart-total">
        <span>Subtotal</span>
        <b id="cart-total">{fmtRp(total)}</b>
      </div>
    </>
  );
}
