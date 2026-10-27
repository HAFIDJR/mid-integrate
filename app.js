/* ============================================================
   KASIR DIGITAL — app.js
   Vanilla ES6+ POS · localStorage persistence · zero deps
   ============================================================ */
'use strict';

/* ---------------- Utilities ---------------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmtRp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const fmtInt = (n) => Math.round(n || 0).toLocaleString('id-ID');
const compactRp = (n) => {
  if (n >= 1e6) return (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  if (n >= 1e3) return Math.round(n / 1e3) + ' rb';
  return String(Math.round(n));
};
const fmtDate = (d) => new Date(d).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateShort = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
const fmtTime = (d) => { const t = new Date(d); return String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'); };
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayDiff = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 864e5);
const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseLocalDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const WK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/* ---------------- Inline icons (Lucide paths) ---------------- */
const ICONS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  package: '<path d="M16.5 9.4 7.55 4.24"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  trendUp: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  trendDown: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
  store: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.27 2.27 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  banknote: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01"/><path d="M18 12h.01"/>',
  qr: '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
  sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
};
const icon = (n, s = 18, c = '') =>
  `<svg class="ic ${c}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/* ---------------- Constants ---------------- */
const CATEGORIES = ['All', 'Food', 'Drink', 'Snack', 'Other'];
const UNITS = ['pcs', 'pack', 'kg', 'gram', 'liter', 'ml'];
const BIZ_TYPES = ['Coffee Shop', 'Restaurant', 'Mini Mart', 'Bakery', 'Food Stall', 'Other'];
const LOGO_PRESETS = ['☕', '🍜', '', '🍰', '🍞', '🍱', '', ''];
const PHOTO_PRESETS = [
  { label: 'Coffee', emoji: '☕' }, { label: 'Tea', emoji: '🍵' }, { label: 'Juice', emoji: '🧃' },
  { label: 'Soda', emoji: '🥤' }, { label: 'Pastry', emoji: '🥐' }, { label: 'Bread', emoji: '🍞' },
  { label: 'Bowl', emoji: '🍜' }, { label: 'Fried', emoji: '🍛' }, { label: 'Salad', emoji: '🥗' },
  { label: 'Cake', emoji: '🍰' }, { label: 'Snack', emoji: '🍪' }, { label: 'Water', emoji: '💧' },
];
const SORTS = [
  { id: 'name', label: 'Name A–Z' },
  { id: 'newest', label: 'Newest first' },
  { id: 'priceAsc', label: 'Price: Low → High' },
  { id: 'priceDesc', label: 'Price: High → Low' },
  { id: 'stockAsc', label: 'Stock: Low → High' },
];
const STOCK_FILTERS = [
  { id: 'all', label: 'All' }, { id: 'in', label: 'In Stock' },
  { id: 'low', label: 'Low Stock' }, { id: 'out', label: 'Out of Stock' },
];
const DEMO_PRODUCTS = [
  { name: 'Kopi Susu Gula Aren', category: 'Drink', price: 18000, stock: 32, unit: 'pcs', photoUrl: '☕' },
  { name: 'Espresso', category: 'Drink', price: 15000, stock: 24, unit: 'pcs', photoUrl: '☕' },
  { name: 'Matcha Latte', category: 'Drink', price: 22000, stock: 16, unit: 'pcs', photoUrl: '🍵' },
  { name: 'Es Teh Jumbo', category: 'Drink', price: 8000, stock: 40, unit: 'pcs', photoUrl: '🥤' },
  { name: 'Air Mineral 600ml', category: 'Drink', price: 4000, stock: 48, unit: 'ml', photoUrl: '💧' },
  { name: 'Roti Bakar Coklat', category: 'Food', price: 10000, stock: 14, unit: 'pcs', photoUrl: '🍞' },
  { name: 'Mie Ayam Bakso', category: 'Food', price: 15000, stock: 18, unit: 'pcs', photoUrl: '🍜' },
  { name: 'Nasi Goreng Kampung', category: 'Food', price: 20000, stock: 10, unit: 'pcs', photoUrl: '🍛' },
  { name: 'Croissant Butter', category: 'Snack', price: 15000, stock: 3, unit: 'pcs', photoUrl: '🥐' },
  { name: 'Biskuit Kacang', category: 'Snack', price: 6000, stock: 0, unit: 'pack', photoUrl: '🍪' },
  { name: 'Keripik Pedas', category: 'Snack', price: 9000, stock: 4, unit: 'pack', photoUrl: '🥔' },
  { name: 'Kotak Tissue', category: 'Other', price: 12000, stock: 9, unit: 'pcs', photoUrl: '🧻' },
];

/* ---------------- Data layer (localStorage) ---------------- */
const KEYS = { onboarded: 'kasir_onboarded', store: 'kasir_store', products: 'kasir_products', sales: 'kasir_sales' };
const load = (key, fb) => { try { const v = localStorage.getItem(key); return v == null ? fb : JSON.parse(v); } catch { return fb; } };
const persist = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } };
const defaultStore = () => ({ logo: '☕', storeName: 'Kedai Senja', ownerName: 'Budi Santoso', businessType: 'Coffee Shop', theme: 'light', qris: '' });
const seedProducts = () => DEMO_PRODUCTS.map((p, i) => ({ ...p, id: uid() + i, createdAt: Date.now() - i * 36e5 }));

const state = {
  view: 'dashboard',
  onboarded: load(KEYS.onboarded, false),
  store: load(KEYS.store, null) || defaultStore(),
  products: load(KEYS.products, null) || seedProducts(),
  sales: load(KEYS.sales, []),
  pSearch: '', pCat: 'All', pSort: 'name', pStock: 'all',
  rRange: '7d', rFrom: '', rTo: '', rTopMode: 'units',
  sale: null,
  pm: null,
  onb: { i: 0 },
  justOnboarded: false,
  _rep: null,
};
if (localStorage.getItem(KEYS.products) == null) persist(KEYS.products, state.products);

const productById = (id) => state.products.find(p => p.id === id);
const subtotal = () => (state.sale ? state.sale.cart.reduce((a, i) => a + i.price * i.qty, 0) : 0);

/* ---------------- Theme ---------------- */
function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.store.theme === 'dark' ? 'dark' : 'light');
  const m = $('meta[name="theme-color"]');
  if (m) m.setAttribute('content', state.store.theme === 'dark' ? '#0e1512' : '#f4f6f5');
}
function setTheme(t) {
  state.store.theme = t;
  persist(KEYS.store, state.store);
  applyTheme();
  $$('#theme-seg .seg-btn').forEach(b => b.classList.toggle('on', b.dataset.act === `theme:${t}`));
  toast(t === 'dark' ? 'Dark theme on' : 'Light theme on', 'info');
}

/* ---------------- Overlay system ---------------- */
const overlays = [];
function mount(html) {
  const root = $('#overlay-root');
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  const node = wrap.firstElementChild;
  root.appendChild(node);
  overlays.push(node);
  requestAnimationFrame(() => node.classList.add('in'));
  return node;
}
function unmountOverlay(node) {
  if (!node) return;
  const i = overlays.indexOf(node);
  if (i < 0) return;
  overlays.splice(i, 1);
  node.classList.remove('in');
  node.classList.add('out');
  setTimeout(() => node.remove(), 240);
}
const closeTop = () => { const n = overlays[overlays.length - 1]; if (n) unmountOverlay(n); };

/* ---------------- Toasts ---------------- */
function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `${icon(type === 'warn' ? 'alert' : type === 'info' ? 'info' : 'checkCircle', 16)}<span>${esc(msg)}</span>`;
  $('#toast-root').appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 2300);
}

/* ---------------- Confirm dialog ---------------- */
let confirmCb = null;
function confirmDialog({ title, msg, ok = 'Confirm', danger = false, cb }) {
  confirmCb = cb;
  mount(`<div class="overlay"><div class="modal rise">
    <div class="modal-ic ${danger ? 'danger' : ''}">${icon(danger ? 'alert' : 'info', 22)}</div>
    <h3>${esc(title)}</h3><p>${esc(msg)}</p>
    <div class="modal-actions">
      <button class="btn ghost grow" data-act="confirm-cancel">Cancel</button>
      <button class="btn ${danger ? 'danger' : 'primary'} grow" data-act="confirm-ok">${esc(ok)}</button>
    </div>
  </div></div>`);
}

/* ---------------- Count-up animation ---------------- */
function countUp(el, to, { dur = 1100, fmt = fmtRp } = {}) {
  if (!el) return;
  const t0 = performance.now();
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(to * e);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------------- Bottom nav ---------------- */
function buildNav() {
  $('#bottomNav').innerHTML = `
    <button class="nav-btn" data-act="nav:dashboard">${icon('home', 21)}<span>Dashboard</span></button>
    <button class="nav-btn" data-act="nav:products">${icon('package', 21)}<span>Products</span></button>
    <div class="nav-gap" aria-hidden="true"></div>
    <button class="nav-btn" data-act="nav:reports">${icon('chart', 21)}<span>Reports</span></button>
    <button class="nav-btn" data-act="nav:settings">${icon('settings', 21)}<span>Settings</span></button>`;
  $('#fab').innerHTML = icon('plus', 26);
}
function setNav() {
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.act === `nav:${state.view}`));
}

/* ---------------- Thumbnail helper ---------------- */
function thumbHTML(p, cls = 'p-thumb') {
  const photo = (p && (p.photoUrl || p.photo)) || '📦';
  return photo.startsWith('http')
    ? `<img class="${cls}" src="${esc(photo)}" alt="">`
    : `<span class="${cls}">${esc(photo)}</span>`;
}

/* ============================================================
   VIEWS
   ============================================================ */
function render() {
  applyTheme();
  const makers = { dashboard: viewDashboard, products: viewProducts, reports: viewReports, settings: viewSettings };
  $('#screen').innerHTML = (makers[state.view] || viewDashboard)();
  setNav();
  $('#screen').scrollTop = 0;
  if (state.view === 'dashboard') {
    countUp($('#wallet-amt'), state.sales.reduce((a, s) => a + s.total, 0));
    const today = new Date();
    countUp($('#today-amt'), state.sales.filter(s => sameDay(new Date(s.date), today)).reduce((a, s) => a + s.total, 0), { dur: 900 });
  }
  if (state.view === 'reports') renderReports();
  if (state.view === 'products') renderProdList();
}

/* ---------------- Dashboard ---------------- */
function viewDashboard() {
  const st = state.store;
  const today = new Date();
  const tSales = state.sales.filter(s => sameDay(new Date(s.date), today));
  const tRev = tSales.reduce((a, s) => a + s.total, 0);
  const tItems = tSales.reduce((a, s) => a + s.items.reduce((x, i) => x + i.qty, 0), 0);
  const weekFrom = addDays(startOfDay(today), -6).getTime();
  const weekSales = state.sales.filter(s => new Date(s.date).getTime() >= weekFrom);
  const pop = topSellers(weekSales, 'units').slice(0, 3);
  const lowAll = state.products.filter(p => p.stock < 5).sort((a, b) => a.stock - b.stock);
  const low = lowAll.slice(0, 4);
  const dateStr = today.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return `<div class="view">
    <header class="store-head">
      <div class="logo-tile">${esc(st.logo)}</div>
      <div class="sh-main">
        <h1>${esc(st.storeName)}</h1>
        <div class="sh-badges">
          <span class="badge accent">${icon('store', 12)} ${esc(st.businessType)}</span>
          <span class="badge">${icon('calendar', 12)} ${dateStr}</span>
        </div>
      </div>
    </header>

    ${state.sales.length === 0 ? `<div class="cta-banner">${icon('sparkles', 20)}
      <div class="cb-main"><b>No sales yet</b><span>Tap the + button to ring up your first order.</span></div>
      <button class="btn primary sm" data-act="fab">Start Selling</button>
    </div>` : ''}

    <section class="wallet" aria-label="Total balance">
      ${icon('wallet', 96, 'wallet-mark')}
      <p class="w-label">Total Balance</p>
      <p class="w-amt" id="wallet-amt">Rp 0</p>
      <p class="w-sub">${tRev ? `+ ${fmtRp(tRev)} today · ${tSales.length} sales` : 'All-time revenue'}</p>
      <button class="w-btn" data-act="nav:reports">View Reports ${icon('arrowRight', 14)}</button>
    </section>

    <section class="metrics" aria-label="Summary metrics">
      <div class="metric"><span class="m-ic success">${icon('banknote', 16)}</span><b id="today-amt">Rp 0</b><span>Sales Today<small>${tSales.length} transactions</small></span></div>
      <div class="metric"><span class="m-ic accent">${icon('package', 16)}</span><b>${fmtInt(tItems)}</b><span>Items Sold<small>last 24 hours</small></span></div>
      <div class="metric"><span class="m-ic ${lowAll.length ? 'danger' : 'success'}">${icon(lowAll.length ? 'alert' : 'checkCircle', 16)}</span><b>${lowAll.length}</b><span>Low Stock<small>needs reorder</small></span></div>
    </section>

    <section class="panel">
      <h3 class="panel-title">${icon('trendUp', 15)} Popular Products <span class="panel-tag">last 7 days</span></h3>
      ${pop.length ? pop.map((p, i) => `
        <div class="pop-row">
          <span class="pop-rank">${i + 1}</span>
          ${thumbHTML({ photo: p.photo }, 'p-thumb sm')}
          <div class="pop-main"><b>${esc(p.name)}</b><small>${fmtInt(p.units)} sold</small></div>
          <div>${fmtRp(p.revenue)}</div>
        </div>`).join('')
      : `<div class="empty">${icon('receipt', 24)}<p>No sales in the last 7 days yet.<br>Completed orders will rank here.</p></div>`}
    </section>

    <section class="panel" style="margin-top:12px">
      <h3 class="panel-title">${icon('alert', 15)} Low Stock Warnings <span class="panel-tag">${lowAll.length} items</span></h3>
      ${lowAll.length ? low.map(p => `
        <button class="low-row" data-act="nav:products">
          ${thumbHTML(p, 'p-thumb sm')}
          <span class="low-name">${esc(p.name)}</span>
          <span class="stock ${p.stock === 0 ? 'stock-out' : 'stock-low'}">${p.stock === 0 ? 'Out' : p.stock + ' ' + p.unit + ' left'}</span>
        </button>`).join('')
      : `<div class="empty">${icon('checkCircle', 24, 'ok')}<p>All products are well stocked.</p></div>`}
    </section>
  </div>`;
}

/* ---------------- Products ---------------- */
function filteredProducts() {
  const q = state.pSearch.toLowerCase();
  const list = state.products.filter(p =>
    (state.pCat === 'All' || p.category === state.pCat) &&
    (!q || p.name.toLowerCase().includes(q)) &&
    (state.pStock === 'all' || (state.pStock === 'in' && p.stock > 0) || (state.pStock === 'low' && p.stock > 0 && p.stock < 5) || (state.pStock === 'out' && p.stock === 0))
  );
  const sorters = {
    name: (a, b) => a.name.localeCompare(b.name),
    newest: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    priceAsc: (a, b) => a.price - b.price,
    priceDesc: (a, b) => b.price - a.price,
    stockAsc: (a, b) => a.stock - b.stock,
  };
  return list.sort(sorters[state.pSort] || sorters.name);
}
function prodRowHTML(p) {
  const cls = p.stock === 0 ? 'stock-out' : p.stock < 5 ? 'stock-low' : 'stock-safe';
  return `<button class="p-row ${p.stock === 0 ? 'is-out' : ''}" data-act="prod-edit:${p.id}">
    ${thumbHTML(p)}
    <span class="p-main"><span class="p-name">${esc(p.name)}</span><span class="p-meta">${esc(p.category)} · ${fmtRp(p.price)}</span></span>
    <span class="stock ${cls}">${p.stock === 0 ? 'Out' : p.stock + ' ' + p.unit}</span>
    ${icon('chevronRight', 16, 'p-chev')}
  </button>`;
}
function prodListHTML() {
  const list = filteredProducts();
  if (!list.length) {
    return `<div class="empty big">${icon(state.products.length ? 'search' : 'package', 26)}
      <h4>${state.products.length ? 'No matches' : 'No products yet'}</h4>
      <p>${state.products.length ? 'Try a different search or clear filters.' : 'Add what you sell, or load the demo catalog to explore.'}</p>
      ${!state.products.length ? `<div class="e-actions"><button class="btn primary sm" data-act="prod-add">${icon('plus', 15)} Add Product</button><button class="btn ghost sm" data-act="demo">${icon('sparkles', 15)} Demo Data</button></div>` : ''}
    </div>`;
  }
  return list.map(prodRowHTML).join('');
}
function renderProdList() {
  const box = $('#prod-list');
  if (!box) return;
  box.innerHTML = prodListHTML();
  const list = filteredProducts();
  const cnt = $('#prod-count');
  if (cnt) cnt.textContent = `${list.length} of ${state.products.length} products`;
  const fb = $('#filter-btn');
  if (fb) {
    const n = (state.pSort !== 'name' ? 1 : 0) + (state.pStock !== 'all' ? 1 : 0);
    fb.innerHTML = icon('sliders', 18) + (n ? `<span class="dot-badge">${n}</span>` : '');
  }
}
function viewProducts() {
  return `<div class="view">
    <div class="view-head">
      <div><h2 class="view-title">Products</h2><p class="view-sub" id="prod-count"></p></div>
      <div class="head-actions">
        <button class="icon-btn" id="filter-btn" data-act="filter-open" aria-label="Filter and sort">${icon('sliders', 18)}</button>
        <button class="icon-btn primary" data-act="prod-add" aria-label="Add product">${icon('plus', 18)}</button>
      </div>
    </div>
    <label class="searchbar">${icon('search', 17)}<input data-bind="pSearch" placeholder="Search products…" value="${esc(state.pSearch)}" autocomplete="off"></label>
    <div class="pill-row" id="prod-cats" style="margin-bottom:14px">
      ${CATEGORIES.map(c => `<button class="pill ${state.pCat === c ? 'on' : ''}" data-act="cat-pill:${c}">${c}</button>`).join('')}
    </div>
    <div class="prod-list" id="prod-list">${prodListHTML()}</div>
  </div>`;
}

/* ---------------- Product modal ---------------- */
let pmOv = null, filterOv = null, saleOv = null, receiptOv = null, obOv = null;
function openProductModal(id) {
  const p = id ? productById(id) : null;
  state.pm = p ? { ...p, photo: p.photoUrl || p.photo || '📦' } : { id: null, name: '', category: 'Food', price: '', stock: '', unit: 'pcs', photo: '☕' };
  pmOv = mount(`<div class="overlay"><div class="sheet bottom-sheet rise">
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h3>${p ? 'Edit Product' : 'Add Product'}</h3><button class="icon-btn" data-act="close" aria-label="Close">${icon('x', 17)}</button></div>
    <div class="sheet-body">
      <div class="field"><label>Product name</label><input class="input" id="pm-name" placeholder="e.g. Kopi Susu Gula Aren" value="${esc(p ? p.name : '')}"></div>
      <div class="field" style="margin-top:14px"><label>Category</label>
        <div class="pill-row" id="pm-cats">${CATEGORIES.filter(c => c !== 'All').map(c => `<button class="pill ${state.pm.category === c ? 'on' : ''}" data-act="prod-cat:${c}">${c}</button>`).join('')}</div>
      </div>
      <div class="field" style="margin-top:14px"><label>Photo</label>
        <div class="photo-row">
          <div class="photo-prev" id="pm-prev"></div>
          <div style="flex:1;min-width:0"><input class="input" id="pm-url" data-bind="pmUrl" placeholder="Paste an image URL (optional)" value="${state.pm.photo && state.pm.photo.startsWith('http') ? esc(state.pm.photo) : ''}"><span class="lbl2">Custom image URL</span></div>
        </div>
        <div class="photo-grid" id="pm-grid">${PHOTO_PRESETS.map(pr => `<button class="photo-opt ${state.pm.photo === pr.emoji ? 'on' : ''}" data-act="prod-photo:${pr.emoji}" title="${pr.label}" aria-label="${pr.label}">${pr.emoji}</button>`).join('')}</div>
      </div>
      <div class="field-2col" style="margin-top:14px">
        <div class="field"><label>Price (Rp)</label><input class="input" id="pm-price" inputmode="numeric" placeholder="18000" value="${p ? p.price : ''}"></div>
        <div class="field"><label>Stock</label><input class="input" id="pm-stock" inputmode="numeric" placeholder="0" value="${p ? p.stock : ''}"></div>
      </div>
      <div class="field" style="margin-top:14px"><label>Unit</label>
        <div class="pill-row" id="pm-units">${UNITS.map(u => `<button class="pill sm ${state.pm.unit === u ? 'on' : ''}" data-act="prod-unit:${u}">${u}</button>`).join('')}</div>
      </div>
    </div>
    <div class="sheet-foot">
      ${p ? `<button class="icon-btn danger" data-act="prod-del" aria-label="Delete product">${icon('trash', 17)}</button>` : ''}
      <button class="btn primary grow" data-act="prod-save">${p ? 'Save Changes' : 'Add Product'}</button>
    </div>
  </div></div>`);
  renderPmPhoto();
}
function renderPmPhoto() {
  const el = $('#pm-prev');
  if (!el || !state.pm) return;
  el.innerHTML = state.pm.photo && state.pm.photo.startsWith('http')
    ? `<img class="pm-img" src="${esc(state.pm.photo)}" alt="">` : esc(state.pm.photo || '📦');
}
function markPhotoGrid() {
  $$('#pm-grid .photo-opt').forEach(b => b.classList.toggle('on', b.dataset.act === `prod-photo:${state.pm.photo}`));
}
function saveProduct() {
  const name = $('#pm-name').value.trim();
  const price = parseInt(($('#pm-price').value || '').replace(/\D/g, ''), 10) || 0;
  const stock = parseInt(($('#pm-stock').value || '').replace(/\D/g, ''), 10) || 0;
  if (!name) return toast('Product name is required', 'warn');
  if (price <= 0) return toast('Enter a valid price', 'warn');
  const data = { name, price, stock, category: state.pm.category, unit: state.pm.unit, photoUrl: state.pm.photo || '📦' };
  if (state.pm.id) {
    Object.assign(productById(state.pm.id), data);
    toast('Product updated');
  } else {
    state.products.unshift({ ...data, id: uid(), createdAt: Date.now() });
    toast('Product added');
  }
  persist(KEYS.products, state.products);
  unmountOverlay(pmOv); pmOv = null;
  render();
}
function deleteProduct() {
  confirmDialog({
    title: 'Delete product?', ok: 'Delete', danger: true,
    msg: `"${state.pm.name}" will be removed from the catalog. Past sales are kept.`,
    cb: () => {
      state.products = state.products.filter(p => p.id !== state.pm.id);
      persist(KEYS.products, state.products);
      unmountOverlay(pmOv); pmOv = null;
      toast('Product deleted', 'info');
      render();
    },
  });
}

/* ---------------- Filter sheet ---------------- */
function openFilter() {
  filterOv = mount(`<div class="overlay"><div class="sheet bottom-sheet rise">
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h3>Filter &amp; Sort</h3><button class="icon-btn" data-act="close" aria-label="Close">${icon('x', 17)}</button></div>
    <div class="sheet-body">
      <p class="mini-label" style="margin-top:2px">Sort by</p>
      <div class="opt-list" id="f-sorts">${SORTS.map(s => `<button class="opt ${state.pSort === s.id ? 'on' : ''}" data-act="f-sort:${s.id}"><span>${s.label}</span>${state.pSort === s.id ? icon('check', 17) : ''}</button>`).join('')}</div>
      <p class="mini-label">Stock status</p>
      <div class="pill-row" id="f-stocks" style="flex-wrap:wrap">${STOCK_FILTERS.map(s => `<button class="pill ${state.pStock === s.id ? 'on' : ''}" data-act="f-stock:${s.id}">${s.label}</button>`).join('')}</div>
    </div>
    <div class="sheet-foot"><button class="btn primary block" data-act="f-apply">Apply Filters</button></div>
  </div></div>`);
}

/* ============================================================
   SALE FLOW (3-step cashier)
   ============================================================ */
/* ============================================================
   QRIS ENGINE (EMVCo merchant-presented QR)
   - Static merchant QRIS  -> dynamic QR bound to the exact amount
   - CRC-16/CCITT-FALSE checksum (tag 63) recomputed on every QR
   ============================================================ */
const QRIS_TTL = 5 * 60 * 1000; // QR valid for 5 minutes
let qrTick = null;

function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function parseEMV(s) {
  const out = [];
  let i = 0;
  while (i + 4 <= s.length) {
    const tag = s.substr(i, 2);
    const len = parseInt(s.substr(i + 2, 2), 10);
    if (isNaN(len)) break;
    out.push({ tag, value: s.substr(i + 4, len) });
    i += 4 + len;
  }
  return out;
}
function buildEMV(list) {
  return list.map(({ tag, value }) => tag + String(value.length).padStart(2, '0') + value).join('');
}
function isValidQris(s) {
  return typeof s === 'string' && s.length > 20 && s.startsWith('000201') &&
    s.slice(-8, -4) === '6304' && crc16(s.slice(0, -4)) === s.slice(-4).toUpperCase();
}
function qrisName(code) {
  const t = parseEMV(code).find(x => x.tag === '59');
  return t ? t.value : 'Merchant';
}
/** Convert a static merchant QRIS into a dynamic one bound to `amount` (IDR, integer). */
function qrisDynamic(staticCode, amount) {
  let items = parseEMV(staticCode.replace(/\s+/g, '')).filter(x => x.tag !== '63' && x.tag !== '54');
  items = items.map(x => (x.tag === '01' ? { tag: '01', value: '12' } : x));
  const amt = { tag: '54', value: String(Math.round(amount)) };
  const idx = items.findIndex(x => Number(x.tag) > 54);
  if (idx < 0) items.push(amt); else items.splice(idx, 0, amt);
  const body = buildEMV(items) + '6304';
  return body + crc16(body);
}
function buildDemoQris() {
  const sub = buildEMV([
    { tag: '00', value: 'ID.CO.QRIS.WWW' },
    { tag: '01', value: '9360012345678901234' },
    { tag: '02', value: 'ID1020000000001' },
  ]);
  const body = buildEMV([
    { tag: '00', value: '01' }, { tag: '01', value: '11' }, { tag: '26', value: sub },
    { tag: '52', value: '5812' }, { tag: '53', value: '360' }, { tag: '58', value: 'ID' },
    { tag: '59', value: 'KASIR DIGITAL DEMO' }, { tag: '60', value: 'JAKARTA' },
  ]) + '6304';
  return body + crc16(body);
}
const DEMO_QRIS = buildDemoQris();
function qrisConfig() {
  const code = (state.store.qris || '').trim();
  if (code && isValidQris(code)) return { code, demo: false, name: qrisName(code) };
  return { code: DEMO_QRIS, demo: true, name: 'KASIR DIGITAL DEMO' };
}
function qrSvg(text) {
  if (typeof qrcode !== 'function') {
    return `<div class="qris-exp">${icon('alert', 26)}<p>QR library unavailable offline.<br>Use “Copy code” instead.</p></div>`;
  }
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}
const fmtMMSS = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
function qrisPanelHTML(total) {
  const s = state.sale;
  if (!s.qrExp) s.qrExp = Date.now() + QRIS_TTL;
  const cfg = qrisConfig();
  const left = Math.max(0, Math.ceil((s.qrExp - Date.now()) / 1000));
  const expired = left <= 0;
  return `<div class="panel qris-card">
    <div class="qris-head">
      <span class="badge accent">${icon('qr', 12)} QRIS</span>
      ${cfg.demo ? '<span class="badge">Demo code</span>' : ''}
    </div>
    <div class="qris-merch">${esc(cfg.name)}</div>
    <div class="qris-amt"><span>Scan &amp; pay exact amount</span><b>${fmtRp(total)}</b></div>
    <div class="qris-box ${expired ? 'expired' : ''}">
      ${expired
        ? `<div class="qris-exp">${icon('clock', 26)}<p>QR expired</p><button class="btn primary sm" data-act="qris-refresh">Refresh QR</button></div>`
        : qrSvg(qrisDynamic(cfg.code, total))}
    </div>
    <div class="qris-status ${expired ? 'exp' : ''}"><i></i>${expired ? 'Expired — refresh to get a new QR' : `Waiting for payment · expires in <b id="qris-timer">${fmtMMSS(left)}</b>`}</div>
    <div class="qris-actions">
      <button class="btn ghost sm" data-act="qris-copy">Copy code</button>
      <button class="btn ghost sm" data-act="qris-refresh">${icon('rotate', 14)} Refresh</button>
    </div>
    ${cfg.demo ? '<p class="hint">Demo code. Add your merchant QRIS in Settings to accept real payments.</p>' : ''}
  </div>`;
}
function startQrisTimer() {
  clearInterval(qrTick);
  qrTick = null;
  const s = state.sale;
  if (!s || s.step !== 3 || s.pay !== 'QRIS') return;
  qrTick = setInterval(() => {
    if (!state.sale || !$('#qris-timer')) { clearInterval(qrTick); qrTick = null; return; }
    const left = Math.ceil((state.sale.qrExp - Date.now()) / 1000);
    if (left <= 0) { clearInterval(qrTick); qrTick = null; renderSale(); return; }
    $('#qris-timer').textContent = fmtMMSS(left);
  }, 1000);
}
function copyText(text) {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    toast(ok ? 'QRIS code copied' : 'Copy failed — select manually', ok ? 'ok' : 'warn');
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => toast('QRIS code copied'), fallback);
  } else fallback();
}

function openSale() {
  state.sale = { step: 1, q: '', cat: 'All', cart: [], customer: { name: '', phone: '' }, pay: 'Cash', cash: '' };
  saleOv = mount(`<div class="overlay sale-ov"><div class="sale-sheet rise"></div></div>`);
  renderSale();
}
function closeSale() {
  clearInterval(qrTick); qrTick = null;
  unmountOverlay(saleOv); saleOv = null;
}
function renderSale() {
  if (!saleOv) return;
  const sheet = saleOv.querySelector('.sale-sheet');
  if (!sheet) return;
  const s = state.sale;
  const steps = [['1', 'Products'], ['2', 'Cart'], ['3', 'Payment']];
  const stepper = `<div class="stepper">${steps.map(([n, lb], i) => {
    const cls = i + 1 < s.step ? 'done' : i + 1 === s.step ? 'active' : 'todo';
    return `${i ? '<i class="st-line"></i>' : ''}<button class="step ${cls}" data-act="sale-step:${i + 1}" ${i + 1 >= s.step ? 'disabled' : ''}><span class="st-ic">${i + 1 < s.step ? icon('check', 13) : n}</span><span class="st-lb">${lb}</span></button>`;
  }).join('')}</div>`;

  let body = '', foot = '';
  if (s.step === 1) {
    body = `
      <label class="searchbar">${icon('search', 17)}<input data-bind="saleSearch" placeholder="Search products…" value="${esc(s.q)}" autocomplete="off"></label>
      <div class="pill-row" id="sale-cats" style="margin-bottom:12px">${CATEGORIES.map(c => `<button class="pill ${s.cat === c ? 'on' : ''}" data-act="sale-cat:${c}">${c}</button>`).join('')}</div>
      <div id="sale-grid">${saleGridHTML()}</div>`;
    foot = `<div class="bar-meta"><b id="bar-count">0</b> items<span id="bar-total">Rp 0</span></div>
      <button class="btn primary grow" id="btn-c1" data-act="sale-step:2">Continue to Quantity</button>`;
  } else if (s.step === 2) {
    body = `
      <div class="panel cust-card">
        <h3 class="panel-title">${icon('user', 15)} Customer <span class="panel-tag">optional</span></h3>
        <div class="field-2col">
          <div class="field"><label>Name</label><input class="input" data-bind="custName" placeholder="Walk-in" value="${esc(s.customer.name)}"></div>
          <div class="field"><label>WhatsApp</label><input class="input" data-bind="custPhone" inputmode="tel" placeholder="08xx xxxx xxxx" value="${esc(s.customer.phone)}"></div>
        </div>
      </div>
      <div class="cart-head">
        <h3 class="panel-title no-mb">${icon('bag', 15)} Cart Items</h3>
        <button class="link-danger" data-act="cart-clear" id="cart-clear" ${s.cart.length ? '' : 'hidden'}>${icon('trash', 13)} Clear</button>
      </div>
      <div id="sale-cart">${cartHTML()}</div>
      <div class="cart-total"><span>Subtotal</span><b id="cart-total">${fmtRp(subtotal())}</b></div>`;
    foot = `<div class="bar-meta"><b id="bar-count">0</b> items<span id="bar-total">Rp 0</span></div>
      <button class="btn primary grow" id="btn-c2" data-act="sale-step:3">Continue to Payment</button>`;
  } else {
    const total = subtotal();
    body = `
      <div class="pay-methods" id="pay-methods">
        ${[['Cash', 'banknote'], ['QRIS', 'qr'], ['Card', 'card']].map(([m, ic]) => `<button class="pay-pill ${s.pay === m ? 'on' : ''}" data-act="pay-method:${m}">${icon(ic, 20)}<span>${m}</span></button>`).join('')}
      </div>
      ${s.pay === 'Cash' ? `
        <div class="field"><label>Cash received</label>
          <div class="cash-box"><span class="cash-rp">Rp</span><input id="cash-input" data-bind="cash" inputmode="numeric" placeholder="0" value="${esc(s.cash)}" autocomplete="off"></div>
        </div>
        <div class="denoms">
          <button class="denom" data-act="cash-quick:exact">Exact</button>
          <button class="denom" data-act="cash-quick:50000">Rp 50.000</button>
          <button class="denom" data-act="cash-quick:100000">Rp 100.000</button>
          <button class="denom" data-act="cash-quick:200000">Rp 200.000</button>
        </div>`
      : `
        ${s.pay === 'QRIS' ? qrisPanelHTML(total) : `<div class="qr-note">${icon('card', 26)}
          <div><b>Card payment</b><span>Charge <b>${fmtRp(total)}</b> on your card terminal, then complete the sale.</span></div>
        </div>`}`}
      <div class="panel pay-summary" id="pay-summary"></div>`;
    foot = `<div class="bar-meta">Total<span>${fmtRp(total)}</span></div>
      <button class="btn primary grow" id="btn-complete" data-act="pay-complete">Complete Payment</button>`;
  }
  sheet.innerHTML = `
    <div class="sale-head">
      <div><h2 class="sale-title">New Sale</h2><p class="sale-sub">${esc(state.store.storeName)} · ${fmtTime(new Date())}</p></div>
      <button class="icon-btn" data-act="sale-close" aria-label="Close cashier">${icon('x', 18)}</button>
    </div>
    ${stepper}
    <div class="sale-body">${body}</div>
    <div class="sale-foot" id="sale-foot">${foot}</div>`;
  if (s.step === 3) updatePayment();
  renderSaleBar();
  if (s.step === 3 && s.pay === 'QRIS') startQrisTimer();
}
function saleGridHTML() {
  const s = state.sale;
  const q = s.q.toLowerCase();
  const list = state.products.filter(p => (s.cat === 'All' || p.category === s.cat) && (!q || p.name.toLowerCase().includes(q)));
  if (!list.length) {
    return `<div class="empty big">${icon(state.products.length ? 'search' : 'package', 26)}
      <h4>${state.products.length ? 'No matches' : 'Your catalog is empty'}</h4>
      <p>${state.products.length ? 'No products match this search.' : 'Add products first, then come back to the cashier.'}</p>
      ${!state.products.length ? '<button class="btn primary sm" data-act="sale-goto-products">Go to Products</button>' : ''}
    </div>`;
  }
  return list.map(p => {
    const it = s.cart.find(c => c.productId === p.id);
    const out = p.stock <= 0;
    return `<div class="s-row ${it ? 'in-cart' : ''} ${out ? 'is-out' : ''}" ${out ? '' : `data-act="cart-add:${p.id}"`}>
      ${thumbHTML(p)}
      <div class="s-main"><span class="s-name">${esc(p.name)}</span><span class="s-meta">${fmtRp(p.price)} / ${p.unit}${!out && p.stock < 5 ? ` <em class="s-low">· ${p.stock} left</em>` : ''}${out ? '<em class="s-outtag"> · Out of stock</em>' : ''}</span></div>
      ${it ? `<div class="qty-ctl"><button data-act="cart-dec:${p.id}" aria-label="Decrease">${icon('minus', 13)}</button><b>${it.qty}</b><button data-act="cart-inc:${p.id}" aria-label="Increase">${icon('plus', 13)}</button></div>`
        : (out ? '' : `<span class="add-ic">${icon('plus', 16)}</span>`)}
    </div>`;
  }).join('');
}
function renderSaleGrid() {
  const g = $('#sale-grid');
  if (g) g.innerHTML = saleGridHTML();
}
function cartHTML() {
  const c = state.sale.cart;
  if (!c.length) return `<div class="empty">${icon('bag', 24)}<p>Your cart is empty.</p></div>`;
  return c.map(it => `<div class="cart-row">
    ${thumbHTML({ photo: it.photo }, 'p-thumb sm')}
    <div class="cart-mid">
      <div class="cart-top"><span class="cart-name">${esc(it.name)}</span><b class="cart-amt">${fmtRp(it.price * it.qty)}</b></div>
      <div class="cart-bot">
        <span class="cart-unit">${it.qty} × ${fmtRp(it.price)} / ${it.unit}</span>
        <div class="qty-ctl"><button data-act="cart-dec:${it.productId}" aria-label="Decrease">${icon('minus', 13)}</button><b>${it.qty}</b><button data-act="cart-inc:${it.productId}" aria-label="Increase">${icon('plus', 13)}</button></div>
        <button class="cart-x" data-act="cart-remove:${it.productId}" aria-label="Remove item">${icon('x', 14)}</button>
      </div>
    </div>
  </div>`).join('');
}
function renderSaleCart() {
  const box = $('#sale-cart');
  if (!box) return;
  box.innerHTML = cartHTML();
  const tot = $('#cart-total'); if (tot) tot.textContent = fmtRp(subtotal());
  const clr = $('#cart-clear'); if (clr) clr.hidden = !state.sale.cart.length;
}
function renderSaleBar() {
  const n = ((state.sale && state.sale.cart) || []).reduce((a, i) => a + i.qty, 0);
  const t = fmtRp(subtotal());
  const bc = $('#bar-count'); if (bc) bc.textContent = n;
  const bt = $('#bar-total'); if (bt) bt.textContent = t;
  const b1 = $('#btn-c1'); if (b1) b1.disabled = !n;
  const b2 = $('#btn-c2'); if (b2) b2.disabled = !n;
}
function cartAdd(id) {
  const p = productById(id);
  if (!p) return;
  if (p.stock <= 0) return toast('This product is out of stock', 'warn');
  const it = state.sale.cart.find(c => c.productId === id);
  if (it) {
    if (it.qty >= p.stock) return toast(`Only ${p.stock} ${p.unit} left in stock`, 'warn');
    it.qty++;
  } else {
    state.sale.cart.push({ productId: p.id, name: p.name, price: p.price, unit: p.unit, photo: p.photoUrl || p.photo, qty: 1 });
  }
  cartChanged();
}
function cartChange(id, d) {
  const it = state.sale.cart.find(c => c.productId === id);
  if (!it) return;
  if (d > 0) {
    const p = productById(id);
    if (p && it.qty >= p.stock) return toast(`Only ${p.stock} ${p.unit} left in stock`, 'warn');
  }
  it.qty += d;
  if (it.qty <= 0) state.sale.cart = state.sale.cart.filter(c => c.productId !== id);
  cartChanged();
}
function cartChanged() {
  if (state.sale.step === 1) renderSaleGrid();
  if (state.sale.step === 2) renderSaleCart();
  renderSaleBar();
}
function updatePayment() {
  const s = state.sale; if (!s || s.step !== 3) return;
  const box = $('#pay-summary'), btn = $('#btn-complete');
  if (!box) return;
  const total = subtotal();
  if (s.pay === 'Cash') {
    const cash = parseInt(s.cash, 10) || 0;
    const diff = cash - total;
    box.innerHTML = `
      <div class="ps-row"><span>Amount due</span><b>${fmtRp(total)}</b></div>
      <div class="ps-row"><span>Cash received</span><b>${fmtRp(cash)}</b></div>
      ${diff >= 0
        ? `<div class="ps-row strong"><span>Change</span><b class="good">${fmtRp(diff)}</b></div>`
        : `<div class="ps-row strong"><span>Short</span><b class="bad">${fmtRp(-diff)}</b></div>
           <div class="warn-chip">${icon('alert', 14)} Cash received is not enough — short by ${fmtRp(-diff)}.</div>`}`;
    if (btn) btn.disabled = cash < total;
  } else {
    box.innerHTML = `<div class="ps-row"><span>Amount due</span><b>${fmtRp(total)}</b></div>
      <div class="ps-row"><span>Method</span><b>${s.pay}</b></div>`;
    if (btn) btn.disabled = false;
  }
}
function setCash(v) {
  state.sale.cash = v === 'exact' ? String(subtotal()) : v;
  const inp = $('#cash-input'); if (inp) inp.value = state.sale.cash;
  updatePayment();
}
function completeSale() {
  const s = state.sale;
  const total = subtotal();
  if (!s || !s.cart.length) return;
  if (s.pay === 'Cash' && (parseInt(s.cash, 10) || 0) < total) return toast('Cash received is not enough', 'warn');
  if (s.pay === 'QRIS' && s.qrExp && s.qrExp <= Date.now()) return toast('QR expired — refresh the QR first', 'warn');
  const cash = s.pay === 'Cash' ? parseInt(s.cash, 10) || 0 : total;
  const maxNo = state.sales.reduce((m, x) => Math.max(m, parseInt((x.saleNumber || '').replace(/\D/g, ''), 10) || 0), 0);
  const sale = {
    id: uid(),
    saleNumber: '#' + String(maxNo + 1).padStart(4, '0'),
    date: new Date().toISOString(),
    customerName: s.customer.name.trim(),
    customerPhone: s.customer.phone.trim(),
    items: s.cart.map(it => ({ productId: it.productId, name: it.name, price: it.price, qty: it.qty })),
    total,
    cashReceived: cash,
    change: cash - total,
    paymentMethod: s.pay,
    status: 'PAID',
  };
  state.sales.push(sale);
  s.cart.forEach(it => {
    const p = productById(it.productId);
    if (p) p.stock = Math.max(0, p.stock - it.qty);
  });
  persist(KEYS.sales, state.sales);
  persist(KEYS.products, state.products);
  closeSale();
  render();
  openReceipt(sale);
}

/* ============================================================
   RECEIPT PRINTER
   ============================================================ */
let lastSale = null;
function receiptHTML(s) {
  const st = state.store;
  return `
  <div class="r-head">
    <div class="r-logo">${esc(st.logo)}</div>
    <div class="r-store">${esc(st.storeName)}</div>
    <div class="r-sub">${esc(st.businessType)} · ${esc(st.ownerName)}</div>
  </div>
  <div class="r-sep"></div>
  <div class="r-meta"><div>${s.saleNumber}<br>${fmtDate(s.date)}<br>${fmtTime(s.date)}</div>
  <div style="text-align:right">${esc(s.customerName || 'Walk-in Customer')}${s.customerPhone ? '<br>' + esc(s.customerPhone) : ''}</div></div>
  <div class="r-sep"></div>
  ${s.items.map(it => `<div class="r-item"><div class="r-iname">${esc(it.name)}</div>
    <div class="r-iline"><span>${it.qty} × ${fmtRp(it.price)}</span><span class="r-fill"></span><span>${fmtRp(it.price * it.qty)}</span></div></div>`).join('')}
  <div class="r-sep"></div>
  <div class="ps-row" style="color:#4a4943"><span>Subtotal</span><span>${fmtRp(s.total)}</span></div>
  <div class="r-total"><span>TOTAL</span><span>${fmtRp(s.total)}</span></div>
  ${s.paymentMethod === 'Cash'
    ? `<div class="r-row"><span>Cash received</span><span>${fmtRp(s.cashReceived)}</span></div><div class="r-row"><span>Change</span><span>${fmtRp(s.change)}</span></div>`
    : `<div class="r-row"><span>Paid via</span><span>${s.paymentMethod}</span></div>`}
  <div class="r-sep"></div>
  <div class="r-paid-box">
    <div class="r-steps">
      <span class="r-step"><span class="r-dot">✓</span>CART</span><span class="r-step-line"></span>
      <span class="r-step"><span class="r-dot">✓</span>PAYMENT</span><span class="r-step-line"></span>
      <span class="r-step"><span class="r-dot">✓</span>RECEIPT</span>
    </div>
    <span class="r-stamp">PAID</span>
  </div>
  <div class="r-thanks">Thank you for your purchase!<br><small>— ${esc(st.storeName)} · Kasir Digital</small></div>`;
}
function openReceipt(sale) {
  lastSale = sale;
  receiptOv = mount(`<div class="overlay receipt-ov"><div class="receipt-stage">
    <div class="printer-block">
      <div class="printer"><span class="printer-led"></span></div>
      <div class="paper-wrap" id="paper-wrap"><div class="paper" id="receipt-paper">${receiptHTML(sale)}<div class="paper-tear"></div></div></div>
    </div>
    <div class="receipt-actions">
      <button class="btn ghost" data-act="rec-print">${icon('printer', 16)} Print</button>
      <button class="btn ghost" data-act="rec-wa">${icon('message', 16)} WhatsApp</button>
      <button class="btn primary" data-act="rec-new">${icon('plus', 16)} New Sale</button>
    </div>
  </div></div>`);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const w = $('#paper-wrap');
    if (w && w.firstElementChild) w.style.maxHeight = (w.firstElementChild.offsetHeight + 30) + 'px';
  }));
}
function sendWA() {
  const s = lastSale;
  if (!s) return;
  const L = [
    `*${state.store.storeName} — Receipt ${s.saleNumber}*`,
    fmtDate(s.date) + ' · ' + fmtTime(s.date),
    s.customerName ? `Customer: ${s.customerName}` : '',
    '──────────────',
    ...s.items.map(it => `${it.qty}× ${it.name} — ${fmtRp(it.price * it.qty)}`),
    '──────────────',
    `*Total: ${fmtRp(s.total)}*`,
  ];
  if (s.paymentMethod === 'Cash') {
    L.push(`Cash: ${fmtRp(s.cashReceived)}`, `Change: ${fmtRp(s.change)}`);
  } else L.push(`Paid via ${s.paymentMethod}`);
  L.push('Thank you!');
  const digits = (s.customerPhone || '').replace(/\D/g, '');
  const full = digits ? (digits.startsWith('0') ? '62' + digits.slice(1) : digits) : '';
  const url = full
    ? `https://wa.me/${full}?text=${encodeURIComponent(L.join('\n'))}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(L.join('\n'))}`;
  window.open(url, '_blank', 'noopener');
}

/* ============================================================
   REPORTS
   ============================================================ */
function viewReports() {
  return `<div class="view">
    <div class="view-head"><div><h2 class="view-title">Reports</h2><p class="view-sub">Sales performance &amp; trends</p></div></div>
    <div class="seg" id="r-tabs">
      <button class="seg-btn ${state.rRange === '7d' ? 'on' : ''}" data-act="rtab:7d">7 Days</button>
      <button class="seg-btn ${state.rRange === '30d' ? 'on' : ''}" data-act="rtab:30d">30 Days</button>
      <button class="seg-btn ${state.rRange === 'month' ? 'on' : ''}" data-act="rtab:month">This Month</button>
      <button class="seg-btn ${state.rRange === 'custom' ? 'on' : ''}" data-act="rtab:custom">Custom</button>
    </div>
    <div class="date-row" id="r-dates" ${state.rRange === 'custom' ? '' : 'hidden'}>
      <input type="date" class="input" id="r-from" data-bind="rFrom" value="${state.rFrom}">
      <span>→</span>
      <input type="date" class="input" id="r-to" data-bind="rTo" value="${state.rTo}">
    </div>
    <div id="rep-body"></div>
  </div>`;
}
function rangeBounds(tab) {
  const now = new Date();
  const endDay = new Date(now); endDay.setHours(23, 59, 59, 999);
  let start, end = endDay;
  if (tab === '7d') start = addDays(startOfDay(now), -6);
  else if (tab === '30d') start = addDays(startOfDay(now), -29);
  else if (tab === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
  else {
    const f = state.rFrom ? parseLocalDate(state.rFrom) : addDays(startOfDay(now), -6);
    const t = state.rTo ? parseLocalDate(state.rTo) : now;
    t.setHours(23, 59, 59, 999);
    if (isNaN(f) || isNaN(t) || t < f) return { start: addDays(startOfDay(now), -6), end: endDay, span: 7 };
    return { start: f, end: t, span: dayDiff(f, t) + 1 };
  }
  return { start, end, span: dayDiff(start, end) + 1 };
}
function computeReport() {
  const { start, end, span } = rangeBounds(state.rRange);
  const inR = d => { const t = new Date(d).getTime(); return t >= start.getTime() && t <= end.getTime(); };
  const sales = state.sales.filter(s => inR(s.date)).sort((a, b) => new Date(a.date) - new Date(b.date));
  const pEnd = new Date(start.getTime() - 1);
  const pStart = addDays(start, -span);
  const prevSales = state.sales.filter(s => { const t = new Date(s.date).getTime(); return t >= pStart.getTime() && t <= pEnd.getTime(); });
  const rev = sales.reduce((a, x) => a + x.total, 0);
  const prevRev = prevSales.reduce((a, x) => a + x.total, 0);
  const growth = prevRev > 0 ? ((rev - prevRev) / prevRev) * 100 : null;
  const units = sales.reduce((a, x) => a + x.items.reduce((y, i) => y + i.qty, 0), 0);
  return { start, end, span, sales, rev, prevRev, growth, txns: sales.length, units, avg: sales.length ? rev / sales.length : 0 };
}
function topSellers(sales, mode) {
  const m = {};
  sales.forEach(s => s.items.forEach(it => {
    const p = productById(it.productId);
    m[it.productId] = m[it.productId] || { name: it.name, photo: (p && p.photoUrl) || '📦', unit: (p && p.unit) || 'pcs', units: 0, revenue: 0 };
    m[it.productId].units += it.qty;
    m[it.productId].revenue += it.price * it.qty;
  }));
  return Object.values(m).sort((a, b) => (mode === 'units' ? b.units - a.units : b.revenue - a.revenue));
}
function buckets(d) {
  const days = dayDiff(d.start, d.end) + 1;
  const out = [];
  const sumFor = (a, b) => d.sales.reduce((s, x) => { const t = new Date(x.date).getTime(); return (t >= a && t <= b) ? s + x.total : s; }, 0);
  if (days <= 14) {
    for (let i = 0; i < days; i++) {
      const a = addDays(startOfDay(d.start), i);
      const v = sumFor(a.getTime(), addDays(a, 1).getTime() - 1);
      out.push({ label: state.rRange === '7d' ? WK[a.getDay()] : `${a.getDate()}/${a.getMonth() + 1}`, v });
    }
  } else {
    let a = new Date(d.start);
    while (a.getTime() <= d.end.getTime()) {
      const b = addDays(a, 7);
      out.push({ label: `${a.getDate()}/${a.getMonth() + 1}`, v: sumFor(a.getTime(), Math.min(b.getTime() - 1, d.end.getTime())) });
      a = b;
    }
  }
  return out;
}
function rangeLabel() {
  const d = state._rep; if (!d) return '';
  if (state.rRange === '7d') return 'last 7 days';
  if (state.rRange === '30d') return 'last 30 days';
  if (state.rRange === 'month') return d.start.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  return `${fmtDateShort(d.start)} – ${fmtDateShort(d.end)}`;
}
function renderReports() {
  const box = $('#rep-body');
  if (!box) return;
  const d = computeReport();
  state._rep = d;
  if (!d.sales.length) {
    box.innerHTML = `<div class="panel empty big" style="margin-top:2px">${icon('receipt', 26)}<h4>No sales in this period</h4>
      <p>Transactions you complete will appear here with trends, charts and top sellers.</p>
      <div class="e-actions"><button class="btn primary sm" data-act="fab">Start a Sale</button><button class="btn ghost sm" data-act="demo">Populate Demo Data</button></div></div>`;
    return;
  }
  const bk = buckets(d);
  const max = Math.max(...bk.map(b => b.v), 1);
  const g = d.growth;
  box.innerHTML = `
  <div class="stats-grid">
    <div class="stat hero">
      <span class="s-label">Revenue</span>
      <b class="s-hero">${fmtRp(d.rev)}</b>
      <span class="chip ${g == null ? 'flat' : g >= 0 ? 'up' : 'down'}">
        ${g == null ? icon('info', 12) + ' First recorded period' : icon(g >= 0 ? 'trendUp' : 'trendDown', 12) + Math.abs(g).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '% vs prev. period'}
      </span>
    </div>
    <div class="stat"><span class="s-label">Transactions</span><b>${d.txns}</b><small>${fmtInt(d.units)} items sold</small></div>
    <div class="stat"><span class="s-label">Avg / Sale</span><b>${fmtRp(d.avg)}</b><small>per transaction</small></div>
  </div>
  <section class="panel" style="margin-top:10px">
    <h3 class="panel-title">${icon('chart', 15)} Busiest Days <span class="panel-tag">${rangeLabel()}</span></h3>
    <div class="chart">${bk.map((b, i) => `<div class="chart-col">
      <span class="chart-val">${b.v ? compactRp(b.v) : ''}</span>
      <div class="chart-track"><div class="chart-bar ${b.v === max && b.v > 0 ? 'hot' : ''}" data-h="${Math.max(5, Math.round((b.v / max) * 100))}%" style="height:4%;transition-delay:${i * 50}ms"></div></div>
      <span class="chart-lbl">${b.label}</span>
    </div>`).join('')}</div>
  </section>
  <section class="panel" style="margin-top:10px" id="top-section"></section>
  <section class="panel" style="margin-top:10px">
    <h3 class="panel-title">${icon('clock', 15)} Recent Transactions <span class="panel-tag">last 6</span></h3>
    ${d.sales.slice(-6).reverse().map(s => {
      const dt = new Date(s.date);
      return `<div class="log-item" id="log-${s.id}">
        <button class="log-head" data-act="log-toggle:${s.id}">
          <span class="log-ic">${icon('receipt', 16)}</span>
          <span class="log-main"><b>${s.saleNumber}</b><small>${fmtTime(s.date)} · ${fmtDateShort(dt)} · ${s.items.length} items</small></span>
          <span class="log-right"><b>${fmtRp(s.total)}</b><span class="pay-chip ${s.paymentMethod.toLowerCase()}">${s.paymentMethod}</span></span>
          ${icon('chevronDown', 15, 'log-chev')}
        </button>
        <div class="log-detail">
          ${s.items.map(it => `<div class="ld-row"><span>${esc(it.name)}</span><span>${it.qty} × ${fmtRp(it.price)}</span><b>${fmtRp(it.qty * it.price)}</b></div>`).join('')}
          <div class="ld-foot"><span>${esc(s.customerName || 'Walk-in Customer')}${s.customerPhone ? ' · ' + esc(s.customerPhone) : ''}</span><span class="paid-chip">${icon('checkCircle', 12)} PAID</span></div>
        </div>
      </div>`;
    }).join('')}
  </section>`;
  renderToppers();
  requestAnimationFrame(() => requestAnimationFrame(() =>
    $$('#rep-body .chart-bar').forEach(b => { b.style.height = b.dataset.h; })
  ));
}
function renderToppers() {
  const sec = $('#top-section');
  if (!sec) return;
  const d = state._rep || computeReport();
  const list = topSellers(d.sales, state.rTopMode).slice(0, 5);
  const max = Math.max(...list.map(t => (state.rTopMode === 'units' ? t.units : t.revenue)), 1);
  sec.innerHTML = `
    <div class="top-head">
      <h3 class="panel-title no-mb">${icon('package', 15)} Top Sellers</h3>
      <div class="seg mini" id="top-seg">
        <button class="seg-btn ${state.rTopMode === 'units' ? 'on' : ''}" data-act="top-mode:units">Units</button>
        <button class="seg-btn ${state.rTopMode === 'revenue' ? 'on' : ''}" data-act="top-mode:revenue">Revenue</button>
      </div>
    </div>
    ${list.length ? list.map((t, i) => {
      const v = state.rTopMode === 'units' ? t.units : t.revenue;
      return `<div class="top-row">
        <span class="rank">${i + 1}</span>
        ${thumbHTML({ photo: t.photo }, 'p-thumb sm')}
        <div class="top-main"><span class="top-name">${esc(t.name)}</span><div class="top-bar"><i data-w="${Math.round((v / max) * 100)}"></i></div></div>
        <div class="top-val"><b>${state.rTopMode === 'units' ? fmtInt(v) + ' ' + t.unit : fmtRp(v)}</b><small>${state.rTopMode === 'units' ? fmtRp(t.revenue) : fmtInt(t.units) + ' units'}</small></div>
      </div>`;
    }).join('') : '<p class="hint">No items sold in this period.</p>'}`;
  requestAnimationFrame(() => requestAnimationFrame(() =>
    $$('#top-section .top-bar i').forEach(b => { b.style.width = b.dataset.w + '%'; })
  ));
}

/* ============================================================
   SETTINGS
   ============================================================ */
function viewSettings() {
  const st = state.store;
  const dark = st.theme === 'dark';
  return `<div class="view">
    <div class="view-head"><h2 class="view-title">Settings</h2></div>
    <div class="settings-panels">
      <section class="panel ${state.justOnboarded ? 'flash' : ''}">
        ${state.justOnboarded ? `<div class="welcome-strip">${icon('sparkles', 15)} Welcome! Set up your store to get started.</div>` : ''}
        <h3 class="panel-title">${icon('store', 15)} Store Profile</h3>
        <div class="logo-row">
          <div class="logo-big" id="logo-prev">${esc(st.logo)}</div>
          <div class="logo-pick" id="logo-pick">${LOGO_PRESETS.map(l => `<button class="logo-opt ${st.logo === l ? 'on' : ''}" data-act="logo:${l}" aria-label="Logo ${l}">${l}</button>`).join('')}</div>
        </div>
        <div class="field"><label>Store name</label><input class="input" id="set-storeName" value="${esc(st.storeName)}" placeholder="Your shop name"></div>
        <div class="field" style="margin-top:12px"><label>Owner name</label><input class="input" id="set-owner" value="${esc(st.ownerName)}" placeholder="Owner"></div>
        <div class="field" style="margin-top:12px"><label>Business type</label>
          <div class="select-wrap"><select class="input" id="set-biz">${BIZ_TYPES.map(b => `<option ${b === st.businessType ? 'selected' : ''}>${b}</option>`).join('')}</select>${icon('chevronDown', 15, 'sel-ic')}</div>
        </div>
        <div class="field" style="margin-top:12px"><label>Merchant QRIS code (static)</label>
          <textarea class="input area" id="set-qris" rows="3" spellcheck="false" placeholder="000201010211…">${esc(st.qris || '')}</textarea>
          <p class="hint">Paste your bank or e-wallet static QRIS string. Each sale then gets its own QR for the exact amount. Leave empty to use the demo code.</p>
        </div>
        <button class="btn primary block" style="margin-top:16px" data-act="store-save">Save Store Profile</button>
      </section>

      <section class="panel">
        <h3 class="panel-title">${icon('sun', 15)} Appearance</h3>
        <div class="seg" id="theme-seg">
          <button class="seg-btn ${!dark ? 'on' : ''}" data-act="theme:light">${icon('sun', 15)} Light</button>
          <button class="seg-btn ${dark ? 'on' : ''}" data-act="theme:dark">${icon('moon', 15)} Dark</button>
        </div>
      </section>

      <section class="panel">
        <h3 class="panel-title">${icon('package', 15)} Data Utilities</h3>
        <button class="btn soft block" data-act="demo">${icon('sparkles', 16)} Populate Demo Data</button>
        <p class="hint">Injects 12 products and ~30 days of transactions for a full preview.</p>
        <button class="btn danger-soft block" data-act="reset">${icon('trash', 16)} Reset / Remove All Data</button>
        <p class="hint">Clears localStorage and restarts onboarding.</p>
      </section>
    </div>
    <p class="app-foot">Kasir Digital v1.0 · Built for small shops</p>
  </div>`;
}
function saveStore() {
  const st = state.store;
  const name = $('#set-storeName').value.trim();
  if (!name) return toast('Store name cannot be empty', 'warn');
  const qrRaw = ($('#set-qris') ? $('#set-qris').value : (st.qris || '')).replace(/\s+/g, '');
  if (qrRaw && !isValidQris(qrRaw)) return toast('QRIS code is invalid (checksum failed)', 'warn');
  st.storeName = name;
  st.ownerName = $('#set-owner').value.trim() || st.ownerName;
  st.businessType = $('#set-biz').value;
  st.qris = qrRaw;
  persist(KEYS.store, st);
  state.justOnboarded = false;
  toast('Store profile saved');
  render();
}
function genDemo() {
  const products = DEMO_PRODUCTS.map((p, i) => ({ ...p, id: uid() + 'd' + i, createdAt: Date.now() - i * 36e5 }));
  const names = ['Andi', 'Siti', 'Rizky', 'Dewi', 'Budi', 'Lia', 'Fajar', 'Maya', 'Raka', 'Tari', 'Yoga', 'Nadia'];
  const sales = [];
  let n = 0;
  for (let d = 29; d >= 0; d--) {
    const day = addDays(new Date(), -d);
    const count = 2 + Math.floor(Math.random() * 6);
    for (let k = 0; k < count; k++) {
      const dt = new Date(day);
      dt.setHours(8 + Math.floor(Math.random() * 13), Math.floor(Math.random() * 60), 0, 0);
      if (d === 0 && dt > new Date()) continue;
      const used = new Set();
      const items = [];
      const picks = 1 + Math.floor(Math.random() * 3);
      for (let j = 0; j < picks; j++) {
        const p = products[Math.floor(Math.random() * products.length)];
        if (used.has(p.id)) continue;
        used.add(p.id);
        items.push({ productId: p.id, name: p.name, price: p.price, qty: 1 + Math.floor(Math.random() * 3) });
      }
      if (!items.length) continue;
      const total = items.reduce((s, it) => s + it.price * it.qty, 0);
      const methods = ['Cash', 'Cash', 'Cash', 'QRIS', 'QRIS', 'Card'];
      const m = methods[Math.floor(Math.random() * methods.length)];
      const cash = m === 'Cash' ? Math.ceil(total / 5000) * 5000 : total;
      n++;
      const hasCust = Math.random() < 0.35;
      sales.push({
        id: uid() + 's' + n,
        saleNumber: '#' + String(n).padStart(4, '0'),
        date: dt.toISOString(),
        customerName: hasCust ? names[Math.floor(Math.random() * names.length)] : '',
        customerPhone: hasCust ? '081' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0') : '',
        items, total,
        cashReceived: cash,
        change: cash - total,
        paymentMethod: m,
        status: 'PAID',
      });
    }
  }
  return { products, sales };
}
function populateDemo() {
  const d = genDemo();
  state.products = d.products;
  state.sales = d.sales;
  persist(KEYS.products, state.products);
  persist(KEYS.sales, state.sales);
  toast('Demo data loaded');
  render();
}
function resetAll() {
  try { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); } catch { /* noop */ }
  state.store = defaultStore();
  state.products = seedProducts();
  state.sales = [];
  state.onboarded = false;
  state.justOnboarded = false;
  state.view = 'dashboard';
  state.pSearch = ''; state.pCat = 'All'; state.pSort = 'name'; state.pStock = 'all';
  state.rRange = '7d'; state.rFrom = ''; state.rTo = '';
  persist(KEYS.products, state.products);
  applyTheme();
  render();
  showOnboarding();
}

/* ============================================================
   ONBOARDING
   ============================================================ */
const OB_SLIDES = [
  {
    title: 'Your shop, in your pocket',
    sub: 'A complete point of sale for your warung — inventory, cashier and daily reports in one place.',
    art: `<div class="mock-phone">
      <div class="mock-wallet"><span class="mk-l w-40"></span><span class="mk-l w-75 thick"></span><span class="mk-chip">Rp 2.410.000</span></div>
      <div class="mock-row"><span class="mock-t">☕</span><span class="mk-stack"><span class="mk-l w-60"></span><span class="mk-l w-40"></span></span><span class="mk-price">18k</span></div>
      <div class="mock-row"><span class="mock-t">🥐</span><span class="mk-stack"><span class="mk-l w-55"></span><span class="mk-l w-35"></span></span><span class="mk-price">15k</span></div>
      <div class="mock-row"><span class="mock-t">🍜</span><span class="mk-stack"><span class="mk-l w-60"></span><span class="mk-l w-45"></span></span><span class="mk-price">15k</span></div>
    </div>`,
  },
  {
    title: 'Add what you sell',
    sub: 'Catalog products with prices, stock levels, units and photos in seconds.',
    art: `<div class="mock-card">
      <span class="mock-t big">🍜</span>
      <span class="mk-stack" style="width:100%"><span class="mk-l w-70"></span><span class="mk-l w-45"></span></span>
      <span class="mock-tag">Rp 15.000 · 18 pcs</span>
    </div>
    <span class="mock-plus">+</span>
    <span class="mock-chip-float">${icon('check', 12)} Saved to catalog</span>`,
  },
  {
    title: 'Serve buyers in three steps',
    sub: 'Pick items, confirm the cart, collect the payment. Receipts print instantly.',
    art: `<div>
      <div class="mock-steps"><span class="mock-step filled">✓</span><i></i><span class="mock-step filled">✓</span><i></i><span class="mock-step">3</span></div>
      <div class="mock-pay"><span>Pick items</span><span>Confirm cart</span><span class="ok">✓ Paid</span></div>
    </div>`,
  },
  {
    title: 'See how the day went',
    sub: 'Revenue, busiest days and top sellers — know exactly how your shop is doing.',
    art: `<div class="mock-chart">
      <i style="--h:35%"></i><i style="--h:55%"></i><i style="--h:42%"></i><i class="hot" style="--h:92%"></i><i style="--h:64%"></i><i style="--h:48%"></i>
    </div>
    <span class="mock-delta">▲ +18.2% today</span>`,
  },
];
function showOnboarding() {
  state.onb.i = 0;
  obOv = mount(`<div class="overlay ob-ov" data-no-backdrop><div class="ob-shell">
    <div class="ob-top">
      <div class="ob-brand"><span class="ob-mark">K</span> Kasir Digital</div>
      <button class="ob-skip" data-act="ob-skip">Skip</button>
    </div>
    <div class="ob-viewport" id="ob-viewport"><div class="ob-track" id="ob-track">
      ${OB_SLIDES.map(s => `<div class="ob-slide"><div class="ob-art">${s.art}</div><h2 class="ob-title">${s.title}</h2><p class="ob-sub">${s.sub}</p></div>`).join('')}
    </div></div>
    <div class="ob-dots" id="ob-dots">${OB_SLIDES.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>
    <button class="btn primary ob-next" id="ob-next" data-act="ob-next">Next</button>
  </div></div>`);
  let sx = null;
  const vp = $('#ob-viewport');
  vp.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  vp.addEventListener('touchend', e => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (dx < -42) obNext();
    else if (dx > 42 && state.onb.i > 0) setOb(state.onb.i - 1);
    sx = null;
  }, { passive: true });
}
function setOb(i) {
  state.onb.i = Math.max(0, Math.min(OB_SLIDES.length - 1, i));
  const tr = $('#ob-track');
  if (tr) tr.style.transform = `translateX(-${state.onb.i * 100}%)`;
  $$('#ob-dots i').forEach((d, j) => d.classList.toggle('on', j === state.onb.i));
  const btn = $('#ob-next');
  if (btn) btn.textContent = state.onb.i === OB_SLIDES.length - 1 ? 'Get Started' : 'Next';
}
function obNext() { state.onb.i >= OB_SLIDES.length - 1 ? obFinish() : setOb(state.onb.i + 1); }
function obFinish() {
  state.onboarded = true;
  state.justOnboarded = true;
  persist(KEYS.onboarded, true);
  unmountOverlay(obOv); obOv = null;
  state.view = 'settings';
  render();
}

/* ============================================================
   GLOBAL EVENT DELEGATION
   ============================================================ */
function onAction(act, arg) {
  switch (act) {
    case 'nav': state.view = arg; render(); break;
    case 'fab': openSale(); break;

    /* onboarding */
    case 'ob-next': obNext(); break;
    case 'ob-skip': obFinish(); break;

    /* overlays */
    case 'close': unmountOverlay(e_target.closest('.overlay')); break;
    case 'confirm-ok': { const fn = confirmCb; confirmCb = null; closeTop(); if (fn) fn(); break; }
    case 'confirm-cancel': confirmCb = null; closeTop(); break;

    /* products */
    case 'prod-add': openProductModal(null); break;
    case 'prod-edit': openProductModal(arg); break;
    case 'prod-save': saveProduct(); break;
    case 'prod-del': deleteProduct(); break;
    case 'prod-photo':
      state.pm.photo = arg;
      const u = $('#pm-url'); if (u) u.value = '';
      renderPmPhoto(); markPhotoGrid(); break;
    case 'prod-cat':
      state.pm.category = arg;
      $$('#pm-cats .pill').forEach(b => b.classList.toggle('on', b.dataset.act === `prod-cat:${arg}`)); break;
    case 'prod-unit':
      state.pm.unit = arg;
      $$('#pm-units .pill').forEach(b => b.classList.toggle('on', b.dataset.act === `prod-unit:${arg}`)); break;
    case 'cat-pill':
      state.pCat = arg;
      $$('#prod-cats .pill').forEach(b => b.classList.toggle('on', b.dataset.act === `cat-pill:${arg}`));
      renderProdList(); break;
    case 'filter-open': openFilter(); break;
    case 'f-sort':
      state.pSort = arg;
      $$('#f-sorts .opt').forEach(b => {
        const on = b.dataset.act === `f-sort:${arg}`;
        b.classList.toggle('on', on);
        b.innerHTML = b.innerHTML.replace(/<svg.*<\/svg>$/, '') + (on ? icon('check', 17) : '');
      }); break;
    case 'f-stock':
      state.pStock = arg;
      $$('#f-stocks .pill').forEach(b => b.classList.toggle('on', b.dataset.act === `f-stock:${arg}`)); break;
    case 'f-apply':
      unmountOverlay(filterOv); filterOv = null;
      renderProdList(); break;

    /* sale flow */
    case 'sale-close': closeSale(); break;
    case 'sale-goto-products': closeSale(); state.view = 'products'; render(); break;
    case 'sale-step': {
      const t = +arg;
      if (t < state.sale.step) { state.sale.step = t; renderSale(); }
      else if (t === state.sale.step + 1) { if (state.sale.cart.length) { state.sale.step = t; renderSale(); } }
      break;
    }
    case 'sale-cat':
      state.sale.cat = arg;
      $$('#sale-cats .pill').forEach(b => b.classList.toggle('on', b.dataset.act === `sale-cat:${arg}`));
      renderSaleGrid(); break;
    case 'cart-add': cartAdd(arg); break;
    case 'cart-inc': cartChange(arg, 1); break;
    case 'cart-dec': cartChange(arg, -1); break;
    case 'cart-remove':
      state.sale.cart = state.sale.cart.filter(c => c.productId !== arg);
      cartChanged(); break;
    case 'cart-clear':
      state.sale.cart = [];
      renderSaleCart(); renderSaleBar(); break;
    case 'pay-method':
      state.sale.pay = arg;
      state.sale.qrExp = 0;
      $$('#pay-methods .pay-pill').forEach(b => b.classList.toggle('on', b.dataset.act === `pay-method:${arg}`));
      renderSale(); break;
    case 'cash-quick': setCash(arg); break;
    case 'qris-copy': copyText(qrisDynamic(qrisConfig().code, subtotal())); break;
    case 'qris-refresh':
      state.sale.qrExp = Date.now() + QRIS_TTL;
      renderSale();
      toast('QRIS refreshed for ' + fmtRp(subtotal()), 'info');
      break;
    case 'pay-complete': completeSale(); break;

    /* receipt */
    case 'rec-print': window.print(); break;
    case 'rec-wa': sendWA(); break;
    case 'rec-new': unmountOverlay(receiptOv); receiptOv = null; break;

    /* reports */
    case 'rtab':
      state.rRange = arg;
      $$('#r-tabs .seg-btn').forEach(b => b.classList.toggle('on', b.dataset.act === `rtab:${arg}`));
      const dr = $('#r-dates'); if (dr) dr.hidden = arg !== 'custom';
      if (arg === 'custom' && !state.rFrom) {
        state.rFrom = toISO(addDays(new Date(), -6));
        state.rTo = toISO(new Date());
        const f = $('#r-from'), t = $('#r-to');
        if (f) f.value = state.rFrom;
        if (t) t.value = state.rTo;
      }
      renderReports(); break;
    case 'top-mode':
      state.rTopMode = arg;
      $$('#top-seg .seg-btn').forEach(b => b.classList.toggle('on', b.dataset.act === `top-mode:${arg}`));
      renderToppers(); break;
    case 'log-toggle': {
      const el = document.getElementById('log-' + arg);
      if (el) el.classList.toggle('open');
      break;
    }

    /* settings */
    case 'theme': setTheme(arg); break;
    case 'logo':
      state.store.logo = arg;
      const lp = $('#logo-pick');
      if (lp) lp.innerHTML = LOGO_PRESETS.map(l => `<button class="logo-opt ${state.store.logo === l ? 'on' : ''}" data-act="logo:${l}" aria-label="Logo ${l}">${l}</button>`).join('');
      const pv = $('#logo-prev'); if (pv) pv.textContent = arg;
      break;
    case 'store-save': saveStore(); break;
    case 'demo':
      confirmDialog({
        title: 'Populate Demo Data', ok: 'Populate',
        msg: 'This replaces your current products and sales with 12 products and ~30 days of transactions.',
        cb: populateDemo,
      }); break;
    case 'reset':
      confirmDialog({
        title: 'Remove all data?', ok: 'Reset Everything', danger: true,
        msg: 'Products, sales and store settings will be erased. Onboarding starts over. This cannot be undone.',
        cb: resetAll,
      }); break;
  }
}
let e_target = null;
function bindGlobal() {
  document.addEventListener('click', (e) => {
    e_target = e.target;
    const el = e.target.closest('[data-act]');
    if (el) {
      const [act, arg] = el.dataset.act.split(':');
      onAction(act, arg);
      return;
    }
    const ov = e.target.closest('.overlay');
    if (ov && ov === e.target && !ov.dataset.noBackdrop) unmountOverlay(ov);
  });
  document.addEventListener('input', (e) => {
    const b = e.target.dataset.bind;
    if (!b) return;
    if (b === 'pSearch') { state.pSearch = e.target.value; renderProdList(); }
    else if (b === 'saleSearch') { state.sale.q = e.target.value; renderSaleGrid(); }
    else if (b === 'cash') { state.sale.cash = e.target.value.replace(/\D/g, ''); updatePayment(); }
    else if (b === 'custName') state.sale.customer.name = e.target.value;
    else if (b === 'custPhone') state.sale.customer.phone = e.target.value;
    else if (b === 'pmUrl') {
      state.pm.photo = e.target.value.trim() || '📦';
      renderPmPhoto(); markPhotoGrid();
    }
  });
  document.addEventListener('change', (e) => {
    const b = e.target.dataset.bind;
    if (b === 'rFrom') { state.rFrom = e.target.value; renderReports(); }
    else if (b === 'rTo') { state.rTo = e.target.value; renderReports(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const top = overlays[overlays.length - 1];
      if (top && !top.dataset.noBackdrop) unmountOverlay(top);
    }
  });
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.classList && (t.classList.contains('p-thumb') || t.classList.contains('photo-prev') || t.classList.contains('pm-img'))) {
      t.outerHTML = `<span class="${t.className}">📦</span>`;
    }
  }, true);
}

/* ---------------- Init ---------------- */
function init() {
  buildNav();
  bindGlobal();
  render();
  if (!state.onboarded) showOnboarding();
}
init();
