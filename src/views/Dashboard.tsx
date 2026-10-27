import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext';
import { Icon, Thumb } from '../components/Icon';
import { topSellers } from '../lib/analytics';
import { addDays, fmtInt, fmtRp, sameDay, startOfDay } from '../lib/format';

function CountUp({
  value,
  format = fmtRp,
  duration = 1100,
}: {
  value: number;
  format?: (value: number) => string;
  duration?: number;
}) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(value * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <>{format(current)}</>;
}

export function Dashboard({ onStartSale }: { onStartSale: () => void }) {
  const { store, sales, products, setView } = useApp();
  const today = new Date();
  const todaySales = sales.filter((sale) => sameDay(new Date(sale.date), today));
  const todayRevenue = todaySales.reduce((total, sale) => total + sale.total, 0);
  const todayItems = todaySales.reduce(
    (total, sale) => total + sale.items.reduce((sum, item) => sum + item.qty, 0),
    0,
  );
  const weekFrom = addDays(startOfDay(today), -6).getTime();
  const weekSales = sales.filter((sale) => new Date(sale.date).getTime() >= weekFrom);
  const popular = topSellers(weekSales, products, 'units', 3);
  const lowAll = products.filter((product) => product.stock < 5).sort((a, b) => a.stock - b.stock);
  const low = lowAll.slice(0, 4);
  const dateStr = today.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const totalBalance = sales.reduce((total, sale) => total + sale.total, 0);

  return (
    <div className="view">
      <header className="store-head">
        <div className="logo-tile">{store.logo}</div>
        <div className="sh-main">
          <h1>{store.storeName}</h1>
          <div className="sh-badges">
            <span className="badge accent">
              <Icon name="store" size={12} /> {store.businessType}
            </span>
            <span className="badge">
              <Icon name="calendar" size={12} /> {dateStr}
            </span>
          </div>
        </div>
      </header>

      {sales.length === 0 ? (
        <div className="cta-banner">
          <Icon name="sparkles" size={20} />
          <div className="cb-main">
            <b>No sales yet</b>
            <span>Tap the + button to ring up your first order.</span>
          </div>
          <button className="btn primary sm" onClick={onStartSale}>
            Start Selling
          </button>
        </div>
      ) : null}

      <section className="wallet" aria-label="Total balance">
        <Icon name="wallet" size={96} className="wallet-mark" />
        <p className="w-label">Total Balance</p>
        <p className="w-amt" id="wallet-amt">
          <CountUp value={totalBalance} />
        </p>
        <p className="w-sub">
          {todayRevenue
            ? `+ ${fmtRp(todayRevenue)} today · ${todaySales.length} sales`
            : 'All-time revenue'}
        </p>
        <button className="w-btn" onClick={() => setView('reports')}>
          View Reports <Icon name="arrowRight" size={14} />
        </button>
      </section>

      <section className="metrics" aria-label="Summary metrics">
        <div className="metric">
          <span className="m-ic success">
            <Icon name="banknote" size={16} />
          </span>
          <b id="today-amt">
            <CountUp value={todayRevenue} duration={900} />
          </b>
          <span>
            Sales Today
            <small>{todaySales.length} transactions</small>
          </span>
        </div>
        <div className="metric">
          <span className="m-ic accent">
            <Icon name="package" size={16} />
          </span>
          <b>{fmtInt(todayItems)}</b>
          <span>
            Items Sold
            <small>last 24 hours</small>
          </span>
        </div>
        <div className="metric">
          <span className={`m-ic ${lowAll.length ? 'danger' : 'success'}`}>
            <Icon name={lowAll.length ? 'alert' : 'checkCircle'} size={16} />
          </span>
          <b>{lowAll.length}</b>
          <span>
            Low Stock
            <small>needs reorder</small>
          </span>
        </div>
      </section>

      <section className="panel">
        <h3 className="panel-title">
          <Icon name="trendUp" size={15} /> Popular Products{' '}
          <span className="panel-tag">last 7 days</span>
        </h3>
        {popular.length ? (
          popular.map((product, index) => (
            <div className="pop-row" key={product.productId}>
              <span className="pop-rank">{index + 1}</span>
              <Thumb source={{ photo: product.photo }} className="p-thumb sm" />
              <div className="pop-main">
                <b>{product.name}</b>
                <small>{fmtInt(product.units)} sold</small>
              </div>
              <div>{fmtRp(product.revenue)}</div>
            </div>
          ))
        ) : (
          <div className="empty">
            <Icon name="receipt" size={24} />
            <p>
              No sales in the last 7 days yet.
              <br />
              Completed orders will rank here.
            </p>
          </div>
        )}
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <h3 className="panel-title">
          <Icon name="alert" size={15} /> Low Stock Warnings{' '}
          <span className="panel-tag">{lowAll.length} items</span>
        </h3>
        {lowAll.length ? (
          low.map((product) => (
            <button className="low-row" key={product.id} onClick={() => setView('products')}>
              <Thumb source={product} className="p-thumb sm" />
              <span className="low-name">{product.name}</span>
              <span className={`stock ${product.stock === 0 ? 'stock-out' : 'stock-low'}`}>
                {product.stock === 0 ? 'Out' : `${product.stock} ${product.unit} left`}
              </span>
            </button>
          ))
        ) : (
          <div className="empty">
            <Icon name="checkCircle" size={24} className="ok" />
            <p>All products are well stocked.</p>
          </div>
        )}
      </section>
    </div>
  );
}
