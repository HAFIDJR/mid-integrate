import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { defaultStore, loadInitialState, KEYS, removeKey, writeJSON } from './storage';
import type {
  ConfirmOptions,
  Product,
  Sale,
  StoreSettings,
  ThemeMode,
  ToastItem,
  ToastKind,
  ViewId,
} from './types';
import { seedProducts } from '../lib/constants';
import { uid } from '../lib/format';

export interface AppContextValue {
  view: ViewId;
  setView: (view: ViewId) => void;
  onboarded: boolean;
  justOnboarded: boolean;
  store: StoreSettings;
  products: Product[];
  sales: Sale[];
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  saveStore: (patch: Partial<StoreSettings>) => void;
  addProduct: (product: Omit<Product, 'id' | 'createdAt'>) => void;
  updateProduct: (id: string, product: Partial<Product>) => void;
  removeProduct: (id: string) => void;
  populateDemo: (products: Product[], sales: Sale[]) => void;
  resetAll: () => void;
  completeOnboarding: () => void;
  clearJustOnboarded: () => void;
  /** Persist a completed sale + stock synchronously, then update React state. */
  commitSale: (sale: Sale, nextProducts: Product[]) => { ok: boolean };
  /** Latest committed sales (safe to read from async payment callbacks). */
  getSales: () => Sale[];
  getProducts: () => Product[];
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  toast: (message: string, kind?: ToastKind) => void;
  toasts: ToastItem[];
  confirmState: ConfirmState | null;
  resolveConfirm: (value: boolean) => void;
  paymentConfig: import('./types').PaymentConfig | null;
  setPaymentConfig: (config: import('./types').PaymentConfig | null) => void;
}

export interface ConfirmState {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => loadInitialState(), []);
  const [view, setView] = useState<ViewId>('dashboard');
  const [onboarded, setOnboarded] = useState(initial.onboarded);
  const [justOnboarded, setJustOnboarded] = useState(false);
  const [store, setStore] = useState<StoreSettings>(initial.store);
  const [products, setProducts] = useState<Product[]>(initial.products);
  const [sales, setSales] = useState<Sale[]>(initial.sales);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<import('./types').PaymentConfig | null>(null);

  const salesRef = useRef(sales);
  const productsRef = useRef(products);
  salesRef.current = sales;
  productsRef.current = products;

  const toast = useCallback((message: string, kind: ToastKind = 'ok') => {
    const id = uid();
    setToasts((prev) => [...prev.slice(-3), { id, message, kind, phase: 'enter' }]);
    requestAnimationFrame(() => {
      setToasts((prev) => prev.map((item) => (item.id === id ? { ...item, phase: 'in' } : item)));
    });
    const removeTimer = setTimeout(() => {
      setToasts((prev) => prev.map((item) => (item.id === id ? { ...item, phase: 'out' } : item)));
      setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 260);
    }, 2300);
    return () => clearTimeout(removeTimer);
  }, []);

  const theme = store.theme === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0e1512' : '#f4f6f5');
  }, [theme]);

  const setTheme = useCallback((next: ThemeMode) => {
    setStore((prev) => {
      const updated = { ...prev, theme: next };
      writeJSON(KEYS.store, updated);
      return updated;
    });
  }, []);

  const saveStore = useCallback((patch: Partial<StoreSettings>) => {
    setStore((prev) => {
      const updated = { ...prev, ...patch };
      writeJSON(KEYS.store, updated);
      return updated;
    });
  }, []);

  const addProduct = useCallback((product: Omit<Product, 'id' | 'createdAt'>) => {
    setProducts((prev) => {
      const updated = [{ ...product, id: uid(), createdAt: Date.now() }, ...prev];
      writeJSON(KEYS.products, updated);
      return updated;
    });
  }, []);

  const updateProduct = useCallback((id: string, patch: Partial<Product>) => {
    setProducts((prev) => {
      const updated = prev.map((product) => (product.id === id ? { ...product, ...patch } : product));
      writeJSON(KEYS.products, updated);
      return updated;
    });
  }, []);

  const removeProduct = useCallback((id: string) => {
    setProducts((prev) => {
      const updated = prev.filter((product) => product.id !== id);
      writeJSON(KEYS.products, updated);
      return updated;
    });
  }, []);

  const populateDemo = useCallback((demoProducts: Product[], demoSales: Sale[]) => {
    setProducts(demoProducts);
    setSales(demoSales);
    writeJSON(KEYS.products, demoProducts);
    writeJSON(KEYS.sales, demoSales);
  }, []);

  const resetAll = useCallback(() => {
    Object.values(KEYS).forEach((key) => removeKey(key));
    const freshProducts = seedProducts();
    setStore(defaultStore());
    setProducts(freshProducts);
    setSales([]);
    setOnboarded(false);
    setJustOnboarded(false);
    setView('dashboard');
    writeJSON(KEYS.products, freshProducts);
  }, []);

  const clearJustOnboarded = useCallback(() => setJustOnboarded(false), []);

  const completeOnboarding = useCallback(() => {
    setOnboarded(true);
    setJustOnboarded(true);
    writeJSON(KEYS.onboarded, true);
    setView('settings');
  }, []);

  const commitSale = useCallback((sale: Sale, nextProducts: Product[]) => {
    const okSales = writeJSON(KEYS.sales, [...salesRef.current, sale]);
    const okProducts = writeJSON(KEYS.products, nextProducts);
    salesRef.current = [...salesRef.current, sale];
    productsRef.current = nextProducts;
    setSales(salesRef.current);
    setProducts(nextProducts);
    return { ok: okSales && okProducts };
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ options, resolve });
    });
  }, []);

  const resolveConfirm = useCallback((value: boolean) => {
    setConfirmState((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      view,
      setView,
      onboarded,
      justOnboarded,
      store,
      products,
      sales,
      theme,
      setTheme,
      saveStore,
      addProduct,
      updateProduct,
      removeProduct,
      populateDemo,
      resetAll,
      completeOnboarding,
      clearJustOnboarded,
      commitSale,
      getSales: () => salesRef.current,
      getProducts: () => productsRef.current,
      confirm,
      toast,
      toasts,
      confirmState,
      resolveConfirm,
      paymentConfig,
      setPaymentConfig,
    }),
    [
      view,
      onboarded,
      justOnboarded,
      store,
      products,
      sales,
      theme,
      setTheme,
      saveStore,
      addProduct,
      updateProduct,
      removeProduct,
      populateDemo,
      resetAll,
      completeOnboarding,
      clearJustOnboarded,
      commitSale,
      confirm,
      toast,
      toasts,
      confirmState,
      resolveConfirm,
      paymentConfig,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
