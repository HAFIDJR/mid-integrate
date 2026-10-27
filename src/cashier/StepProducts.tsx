import { Icon, Thumb } from '../components/Icon';
import { CATEGORIES } from '../lib/constants';
import { fmtRp } from '../lib/format';
import type { CartItem, Product } from '../state/types';

interface StepProductsProps {
  products: Product[];
  cart: CartItem[];
  query: string;
  category: string;
  onQuery: (value: string) => void;
  onCategory: (value: string) => void;
  onAdd: (productId: string) => void;
  onQty: (productId: string, delta: number) => void;
  onGoToProducts: () => void;
}

export function StepProducts({
  products,
  cart,
  query,
  category,
  onQuery,
  onCategory,
  onAdd,
  onQty,
  onGoToProducts,
}: StepProductsProps) {
  const search = query.toLowerCase();
  const list = products.filter(
    (product) =>
      (category === 'All' || product.category === category) &&
      (!search || product.name.toLowerCase().includes(search)),
  );

  return (
    <>
      <label className="searchbar">
        <Icon name="search" size={17} />
        <input
          placeholder="Search products…"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          autoComplete="off"
        />
      </label>
      <div className="pill-row" id="sale-cats" style={{ marginBottom: 12 }}>
        {CATEGORIES.map((value) => (
          <button
            key={value}
            className={`pill ${category === value ? 'on' : ''}`}
            onClick={() => onCategory(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <div id="sale-grid">
        {list.length === 0 ? (
          <div className="empty big">
            <Icon name={products.length ? 'search' : 'package'} size={26} />
            <h4>{products.length ? 'No matches' : 'Your catalog is empty'}</h4>
            <p>
              {products.length
                ? 'No products match this search.'
                : 'Add products first, then come back to the cashier.'}
            </p>
            {products.length === 0 ? (
              <button className="btn primary sm" onClick={onGoToProducts}>
                Go to Products
              </button>
            ) : null}
          </div>
        ) : (
          list.map((product) => {
            const item = cart.find((entry) => entry.productId === product.id);
            const out = product.stock <= 0;
            return (
              <div
                key={product.id}
                className={`s-row ${item ? 'in-cart' : ''} ${out ? 'is-out' : ''}`.trim()}
                onClick={out ? undefined : () => onAdd(product.id)}
                role={out ? undefined : 'button'}
                tabIndex={out ? undefined : 0}
                onKeyDown={
                  out
                    ? undefined
                    : (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onAdd(product.id);
                        }
                      }
                }
              >
                <Thumb source={product} />
                <div className="s-main">
                  <span className="s-name">{product.name}</span>
                  <span className="s-meta">
                    {fmtRp(product.price)} / {product.unit}
                    {!out && product.stock < 5 ? (
                      <em className="s-low"> · {product.stock} left</em>
                    ) : null}
                    {out ? <em className="s-outtag"> · Out of stock</em> : null}
                  </span>
                </div>
                {item ? (
                  <div className="qty-ctl" onClick={(event) => event.stopPropagation()}>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onQty(product.id, -1);
                      }}
                      aria-label="Decrease"
                    >
                      <Icon name="minus" size={13} />
                    </button>
                    <b>{item.qty}</b>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onQty(product.id, 1);
                      }}
                      aria-label="Increase"
                    >
                      <Icon name="plus" size={13} />
                    </button>
                  </div>
                ) : out ? null : (
                  <span className="add-ic">
                    <Icon name="plus" size={16} />
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
