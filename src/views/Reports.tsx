import { useEffect, useState } from 'react';
import { Icon, Thumb } from '../components/Icon';
import {
  computeReport,
  rangeLabel,
  reportBuckets,
  topSellers,
  type ReportRangeId,
  type TopMode,
} from '../lib/analytics';
import { addDays, compactRp, fmtDateShort, fmtInt, fmtRp, fmtTime, toISO } from '../lib/format';
import { generateDemo } from '../lib/demo';
import { useApp } from '../state/AppContext';
import { uiState } from '../state/uiState';
import {
  clearPaymentAlerts,
  listPaymentAlerts,
  type PaymentAlert,
} from '../state/storage';

const RANGES: Array<{ id: ReportRangeId; label: string }> = [
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
];

export function Reports({ onStartSale }: { onStartSale: () => void }) {
  const { sales, products, populateDemo, toast, confirm } = useApp();
  const [range, setRange] = useState<ReportRangeId>(uiState.rRange);
  const [from, setFrom] = useState(uiState.rFrom);
  const [to, setTo] = useState(uiState.rTo);
  const [topMode, setTopMode] = useState<TopMode>(uiState.rTopMode);
  const [openLogs, setOpenLogs] = useState<Set<string>>(() => new Set());
  const [animated, setAnimated] = useState(false);
  const [alerts, setAlerts] = useState<PaymentAlert[]>(() => listPaymentAlerts());

  const data = computeReport(sales, range, from, to);
  const buckets = reportBuckets(data, range);
  const max = Math.max(...buckets.map((bucket) => bucket.v), 1);
  const toppers = topSellers(data.sales, products, topMode, 5);
  const topMax = Math.max(
    ...toppers.map((item) => (topMode === 'units' ? item.units : item.revenue)),
    1,
  );
  const growth = data.growth;

  useEffect(() => {
    setAnimated(false);
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setAnimated(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [range, from, to, sales.length, topMode]);

  const selectRange = (next: ReportRangeId) => {
    uiState.rRange = next;
    setRange(next);
    if (next === 'custom' && !uiState.rFrom) {
      const nextFrom = toISO(addDays(new Date(), -6));
      const nextTo = toISO(new Date());
      uiState.rFrom = nextFrom;
      uiState.rTo = nextTo;
      setFrom(nextFrom);
      setTo(nextTo);
    }
  };

  const changeTopMode = (mode: TopMode) => {
    uiState.rTopMode = mode;
    setTopMode(mode);
  };

  const dismissAlerts = () => {
    clearPaymentAlerts();
    setAlerts([]);
    toast('Payment alerts dismissed', 'info');
  };

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h2 className="view-title">Reports</h2>
          <p className="view-sub">Sales performance &amp; trends</p>
        </div>
      </div>

      {alerts.length > 0 ? (
        <section className="panel" style={{ marginBottom: 12 }}>
          <h3 className="panel-title">
            <Icon name="alert" size={15} /> Payment reconciliation
            <span className="panel-tag">{alerts.length} open</span>
          </h3>
          {alerts.map((alert) => (
            <div className="warn-chip" key={alert.orderId} style={{ marginTop: 8 }}>
              <Icon name="alert" size={14} />
              <span>
                Verified QRIS payment of {fmtRp(alert.amount)} for order {alert.orderId} did not
                create a sale (cashier was already closed). Reconcile manually.
              </span>
            </div>
          ))}
          <button className="btn ghost sm block" style={{ marginTop: 10 }} onClick={dismissAlerts}>
            Dismiss alerts
          </button>
        </section>
      ) : null}

      <div className="seg" id="r-tabs">
        {RANGES.map((item) => (
          <button
            key={item.id}
            className={`seg-btn ${range === item.id ? 'on' : ''}`}
            onClick={() => selectRange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="date-row" id="r-dates" hidden={range !== 'custom'}>
        <input
          type="date"
          className="input"
          id="r-from"
          value={from}
          onChange={(event) => {
            uiState.rFrom = event.target.value;
            setFrom(event.target.value);
          }}
        />
        <span>→</span>
        <input
          type="date"
          className="input"
          id="r-to"
          value={to}
          onChange={(event) => {
            uiState.rTo = event.target.value;
            setTo(event.target.value);
          }}
        />
      </div>

      <div id="rep-body">
        {data.sales.length === 0 ? (
          <div className="panel empty big" style={{ marginTop: 2 }}>
            <Icon name="receipt" size={26} />
            <h4>No sales in this period</h4>
            <p>Transactions you complete will appear here with trends, charts and top sellers.</p>
            <div className="e-actions">
              <button className="btn primary sm" onClick={onStartSale}>
                Start a Sale
              </button>
              <button
                className="btn ghost sm"
                onClick={() => {
                  void confirm({
                    title: 'Populate Demo Data',
                    ok: 'Populate',
                    msg: 'This replaces your current products and sales with 12 products and ~30 days of transactions.',
                  }).then((ok) => {
                    if (!ok) return;
                    const demo = generateDemo();
                    populateDemo(demo.products, demo.sales);
                    toast('Demo data loaded');
                  });
                }}
              >
                Populate Demo Data
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="stats-grid">
              <div className="stat hero">
                <span className="s-label">Revenue</span>
                <b className="s-hero">{fmtRp(data.rev)}</b>
                <span className={`chip ${growth == null ? 'flat' : growth >= 0 ? 'up' : 'down'}`}>
                  {growth == null ? (
                    <>
                      <Icon name="info" size={12} /> First recorded period
                    </>
                  ) : (
                    <>
                      <Icon name={growth >= 0 ? 'trendUp' : 'trendDown'} size={12} />
                      {Math.abs(growth).toLocaleString('id-ID', { maximumFractionDigits: 1 })}% vs
                      prev. period
                    </>
                  )}
                </span>
              </div>
              <div className="stat">
                <span className="s-label">Transactions</span>
                <b>{data.txns}</b>
                <small>{fmtInt(data.units)} items sold</small>
              </div>
              <div className="stat">
                <span className="s-label">Avg / Sale</span>
                <b>{fmtRp(data.avg)}</b>
                <small>per transaction</small>
              </div>
            </div>

            <section className="panel" style={{ marginTop: 10 }}>
              <h3 className="panel-title">
                <Icon name="chart" size={15} /> Busiest Days{' '}
                <span className="panel-tag">{rangeLabel(data, range)}</span>
              </h3>
              <div className="chart">
                {buckets.map((bucket, index) => (
                  <div className="chart-col" key={`${bucket.label}-${index}`}>
                    <span className="chart-val">{bucket.v ? compactRp(bucket.v) : ''}</span>
                    <div className="chart-track">
                      <div
                        className={`chart-bar ${bucket.v === max && bucket.v > 0 ? 'hot' : ''}`}
                        style={{
                          height: animated
                            ? `${Math.max(5, Math.round((bucket.v / max) * 100))}%`
                            : '4%',
                          transitionDelay: `${index * 50}ms`,
                        }}
                      />
                    </div>
                    <span className="chart-lbl">{bucket.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel" style={{ marginTop: 10 }} id="top-section">
              <div className="top-head">
                <h3 className="panel-title no-mb">
                  <Icon name="package" size={15} /> Top Sellers
                </h3>
                <div className="seg mini" id="top-seg">
                  <button
                    className={`seg-btn ${topMode === 'units' ? 'on' : ''}`}
                    onClick={() => changeTopMode('units')}
                  >
                    Units
                  </button>
                  <button
                    className={`seg-btn ${topMode === 'revenue' ? 'on' : ''}`}
                    onClick={() => changeTopMode('revenue')}
                  >
                    Revenue
                  </button>
                </div>
              </div>
              {toppers.length ? (
                toppers.map((item, index) => {
                  const value = topMode === 'units' ? item.units : item.revenue;
                  return (
                    <div className="top-row" key={item.productId}>
                      <span className="rank">{index + 1}</span>
                      <Thumb source={{ photo: item.photo }} className="p-thumb sm" />
                      <div className="top-main">
                        <span className="top-name">{item.name}</span>
                        <div className="top-bar">
                          <i
                            style={{
                              width: animated ? `${Math.round((value / topMax) * 100)}%` : '0%',
                            }}
                          />
                        </div>
                      </div>
                      <div className="top-val">
                        <b>
                          {topMode === 'units'
                            ? `${fmtInt(value)} ${item.unit}`
                            : fmtRp(value)}
                        </b>
                        <small>
                          {topMode === 'units' ? fmtRp(item.revenue) : `${fmtInt(item.units)} units`}
                        </small>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="hint">No items sold in this period.</p>
              )}
            </section>

            <section className="panel" style={{ marginTop: 10 }}>
              <h3 className="panel-title">
                <Icon name="clock" size={15} /> Recent Transactions{' '}
                <span className="panel-tag">last 6</span>
              </h3>
              {data.sales
                .slice(-6)
                .reverse()
                .map((sale) => {
                  const open = openLogs.has(sale.id);
                  return (
                    <div className={`log-item ${open ? 'open' : ''}`} id={`log-${sale.id}`} key={sale.id}>
                      <button
                        className="log-head"
                        onClick={() =>
                          setOpenLogs((prev) => {
                            const next = new Set(prev);
                            if (next.has(sale.id)) next.delete(sale.id);
                            else next.add(sale.id);
                            return next;
                          })
                        }
                      >
                        <span className="log-ic">
                          <Icon name="receipt" size={16} />
                        </span>
                        <span className="log-main">
                          <b>{sale.saleNumber}</b>
                          <small>
                            {fmtTime(sale.date)} · {fmtDateShort(sale.date)} · {sale.items.length}{' '}
                            items
                          </small>
                        </span>
                        <span className="log-right">
                          <b>{fmtRp(sale.total)}</b>
                          <span className={`pay-chip ${sale.paymentMethod.toLowerCase()}`}>
                            {sale.paymentMethod}
                          </span>
                        </span>
                        <Icon name="chevronDown" size={15} className="log-chev" />
                      </button>
                      <div className="log-detail">
                        {sale.items.map((item, index) => (
                          <div className="ld-row" key={`${sale.id}-${item.productId}-${index}`}>
                            <span>{item.name}</span>
                            <span>
                              {item.qty} × {fmtRp(item.price)}
                            </span>
                            <b>{fmtRp(item.qty * item.price)}</b>
                          </div>
                        ))}
                        <div className="ld-foot">
                          <span>
                            {sale.customerName || 'Walk-in Customer'}
                            {sale.customerPhone ? ` · ${sale.customerPhone}` : ''}
                          </span>
                          <span className="paid-chip">
                            <Icon name="checkCircle" size={12} /> PAID
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
