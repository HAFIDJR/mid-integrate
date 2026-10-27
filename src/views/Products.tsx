import { useState } from 'react';
import { Icon, Thumb } from '../components/Icon';
import { Overlay } from '../hooks/useOverlay';
import {
  CATEGORIES,
  PHOTO_PRESETS,
  PRODUCT_CATEGORIES,
  SORTS,
  STOCK_FILTERS,
  UNITS,
  type SortId,
  type StockFilterId,
} from '../lib/constants';
import { fmtRp } from '../lib/format';
import { generateDemo } from '../lib/demo';
import { useApp } from '../state/AppContext';
import { uiState } from '../state/uiState';
import type { Product } from '../state/types';

function stockClass(stock: number): string {
  return stock === 0 ? 'stock-out' : stock < 5 ? 'stock-low' : 'stock-safe';
}

function filteredProducts(products: Product[]): Product[] {
  const query = uiState.pSearch.toLowerCase();
  const list = products.filter(
    (product) =>
      (uiState.pCat === 'All' || product.category === uiState.pCat) &&
      (!query || product.name.toLowerCase().includes(query)) &&
      (uiState.pStock === 'all' ||
        (uiState.pStock === 'in' && product.stock > 0) ||
        (uiState.pStock === 'low' && product.stock > 0 && product.stock < 5) ||
        (uiState.pStock === 'out' && product.stock === 0)),
  );
  const sorters: Record<string, (a: Product, b: Product) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    newest: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    priceAsc: (a, b) => a.price - b.price,
    priceDesc: (a, b) => b.price - a.price,
    stockAsc: (a, b) => a.stock - b.stock,
  };
  return list.sort(sorters[uiState.pSort] || sorters.name);
}

interface ProductDraft {
  id: string | null;
  name: string;
  category: string;
  price: string;
  stock: string;
  unit: string;
  photo: string;
}

export function Products() {
  const { products, addProduct, updateProduct, removeProduct, toast, confirm, populateDemo } = useApp();
  const [search, setSearch] = useState(uiState.pSearch);
  const [category, setCategory] = useState(uiState.pCat);
  const [sort, setSort] = useState(uiState.pSort);
  const [stock, setStock] = useState(uiState.pStock);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const list = filteredProducts(products);
  const activeFilters = (uiState.pSort !== 'name' ? 1 : 0) + (uiState.pStock !== 'all' ? 1 : 0);

  const setSearchValue = (value: string) => {
    uiState.pSearch = value;
    setSearch(value);
  };
  const setCategoryValue = (value: string) => {
    uiState.pCat = value;
    setCategory(value);
  };

  const openProduct = (id: string | null) => {
    const product = id ? products.find((item) => item.id === id) : null;
    setDraft(
      product
        ? {
            id: product.id,
            name: product.name,
            category: product.category,
            price: String(product.price),
            stock: String(product.stock),
            unit: product.unit,
            photo: product.photoUrl || product.photo || '📦',
          }
        : {
            id: null,
            name: '',
            category: 'Food',
            price: '',
            stock: '',
            unit: 'pcs',
            photo: '☕',
          },
    );
  };

  const saveDraft = () => {
    if (!draft) return;
    const name = draft.name.trim();
    const price = Number.parseInt(String(draft.price).replace(/\D/g, ''), 10) || 0;
    const stockValue = Number.parseInt(String(draft.stock).replace(/\D/g, ''), 10) || 0;
    if (!name) {
      toast('Product name is required', 'warn');
      return;
    }
    if (price <= 0) {
      toast('Enter a valid price', 'warn');
      return;
    }
    const data = {
      name,
      price,
      stock: stockValue,
      category: draft.category,
      unit: draft.unit,
      photoUrl: draft.photo || '📦',
    };
    if (draft.id) {
      updateProduct(draft.id, data);
      toast('Product updated');
    } else {
      addProduct(data as Omit<Product, 'id' | 'createdAt'>);
      toast('Product added');
    }
    setDraft(null);
  };

  const deleteDraft = async () => {
    if (!draft?.id) return;
    const ok = await confirm({
      title: 'Delete product?',
      ok: 'Delete',
      danger: true,
      msg: `"${draft.name}" will be removed from the catalog. Past sales are kept.`,
    });
    if (!ok) return;
    removeProduct(draft.id);
    toast('Product deleted', 'info');
    setDraft(null);
  };

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h2 className="view-title">Products</h2>
          <p className="view-sub" id="prod-count">
            {list.length} of {products.length} products
          </p>
        </div>
        <div className="head-actions">
          <button
            className="icon-btn"
            id="filter-btn"
            onClick={() => setFilterOpen(true)}
            aria-label="Filter and sort"
          >
            <Icon name="sliders" size={18} />
            {activeFilters ? <span className="dot-badge">{activeFilters}</span> : null}
          </button>
          <button
            className="icon-btn primary"
            onClick={() => openProduct(null)}
            aria-label="Add product"
          >
            <Icon name="plus" size={18} />
          </button>
        </div>
      </div>
      <label className="searchbar">
        <Icon name="search" size={17} />
        <input
          placeholder="Search products…"
          value={search}
          onChange={(event) => setSearchValue(event.target.value)}
          autoComplete="off"
        />
      </label>
      <div className="pill-row" id="prod-cats" style={{ marginBottom: 14 }}>
        {CATEGORIES.map((value) => (
          <button
            key={value}
            className={`pill ${category === value ? 'on' : ''}`}
            onClick={() => setCategoryValue(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="prod-list" id="prod-list">
        {list.length === 0 ? (
          <div className="empty big">
            <Icon name={products.length ? 'search' : 'package'} size={26} />
            <h4>{products.length ? 'No matches' : 'No products yet'}</h4>
            <p>
              {products.length
                ? 'Try a different search or clear filters.'
                : 'Add what you sell, or load the demo catalog to explore.'}
            </p>
            {products.length === 0 ? (
              <div className="e-actions">
                <button className="btn primary sm" onClick={() => openProduct(null)}>
                  <Icon name="plus" size={15} /> Add Product
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
                  <Icon name="sparkles" size={15} /> Demo Data
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          list.map((product) => (
            <button
              key={product.id}
              className={`p-row ${product.stock === 0 ? 'is-out' : ''}`}
              onClick={() => openProduct(product.id)}
            >
              <Thumb source={product} />
              <span className="p-main">
                <span className="p-name">{product.name}</span>
                <span className="p-meta">
                  {product.category} · {fmtRp(product.price)}
                </span>
              </span>
              <span className={`stock ${stockClass(product.stock)}`}>
                {product.stock === 0 ? 'Out' : `${product.stock} ${product.unit}`}
              </span>
              <Icon name="chevronRight" size={16} className="p-chev" />
            </button>
          ))
        )}
      </div>

      {filterOpen ? (
        <FilterSheet
          sort={sort}
          stock={stock}
          onClose={() => setFilterOpen(false)}
          onApply={(nextSort, nextStock) => {
            uiState.pSort = nextSort;
            uiState.pStock = nextStock;
            setSort(nextSort);
            setStock(nextStock);
            setFilterOpen(false);
          }}
        />
      ) : null}

      {draft ? (
        <ProductSheet
          draft={draft}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={saveDraft}
          onDelete={draft.id ? deleteDraft : undefined}
          isEditing={Boolean(draft.id)}
        />
      ) : null}
    </div>
  );
}

function ProductSheet({
  draft,
  onChange,
  onClose,
  onSave,
  onDelete,
  isEditing,
}: {
  draft: ProductDraft;
  onChange: (draft: ProductDraft) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
  isEditing: boolean;
}) {
  return (
    <Overlay className="product-ov" onClose={onClose}>
      {(requestClose) => (
        <div className="sheet bottom-sheet rise">
          <div className="sheet-grab" />
          <div className="sheet-head">
            <h3>{isEditing ? 'Edit Product' : 'Add Product'}</h3>
            <button className="icon-btn" onClick={requestClose} aria-label="Close">
              <Icon name="x" size={17} />
            </button>
          </div>
          <div className="sheet-body">
            <div className="field">
              <label>Product name</label>
              <input
                className="input"
                placeholder="e.g. Kopi Susu Gula Aren"
                value={draft.name}
                onChange={(event) => onChange({ ...draft, name: event.target.value })}
              />
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Category</label>
              <div className="pill-row" id="pm-cats">
                {PRODUCT_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    className={`pill ${draft.category === category ? 'on' : ''}`}
                    onClick={() => onChange({ ...draft, category })}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Photo</label>
              <div className="photo-row">
                <div className="photo-prev" id="pm-prev">
                  {draft.photo.startsWith('http') ? (
                    <img
                      className="pm-img"
                      src={draft.photo}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    draft.photo || '📦'
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input
                    className="input"
                    placeholder="Paste an image URL (optional)"
                    value={draft.photo.startsWith('http') ? draft.photo : ''}
                    onChange={(event) =>
                      onChange({ ...draft, photo: event.target.value.trim() || '📦' })
                    }
                  />
                  <span className="lbl2">Custom image URL</span>
                </div>
              </div>
              <div className="photo-grid" id="pm-grid">
                {PHOTO_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    className={`photo-opt ${draft.photo === preset.emoji ? 'on' : ''}`}
                    title={preset.label}
                    aria-label={preset.label}
                    onClick={() => onChange({ ...draft, photo: preset.emoji })}
                  >
                    {preset.emoji}
                  </button>
                ))}
              </div>
            </div>
            <div className="field-2col" style={{ marginTop: 14 }}>
              <div className="field">
                <label>Price (Rp)</label>
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="18000"
                  value={draft.price}
                  onChange={(event) => onChange({ ...draft, price: event.target.value })}
                />
              </div>
              <div className="field">
                <label>Stock</label>
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="0"
                  value={draft.stock}
                  onChange={(event) => onChange({ ...draft, stock: event.target.value })}
                />
              </div>
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Unit</label>
              <div className="pill-row" id="pm-units">
                {UNITS.map((unit) => (
                  <button
                    key={unit}
                    className={`pill sm ${draft.unit === unit ? 'on' : ''}`}
                    onClick={() => onChange({ ...draft, unit })}
                  >
                    {unit}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="sheet-foot">
            {onDelete ? (
              <button className="icon-btn danger" onClick={onDelete} aria-label="Delete product">
                <Icon name="trash" size={17} />
              </button>
            ) : null}
            <button className="btn primary grow" onClick={onSave}>
              {isEditing ? 'Save Changes' : 'Add Product'}
            </button>
          </div>
        </div>
      )}
    </Overlay>
  );
}

function FilterSheet({
  sort,
  stock,
  onClose,
  onApply,
}: {
  sort: string;
  stock: string;
  onClose: () => void;
  onApply: (sort: SortId, stock: StockFilterId) => void;
}) {
  const [draftSort, setDraftSort] = useState<SortId>(sort as SortId);
  const [draftStock, setDraftStock] = useState<StockFilterId>(stock as StockFilterId);

  return (
    <Overlay className="filter-ov" onClose={onClose}>
      {(requestClose) => (
        <div className="sheet bottom-sheet rise">
          <div className="sheet-grab" />
          <div className="sheet-head">
            <h3>Filter &amp; Sort</h3>
            <button className="icon-btn" onClick={requestClose} aria-label="Close">
              <Icon name="x" size={17} />
            </button>
          </div>
          <div className="sheet-body">
            <p className="mini-label" style={{ marginTop: 2 }}>
              Sort by
            </p>
            <div className="opt-list" id="f-sorts">
              {SORTS.map((option) => (
                <button
                  key={option.id}
                  className={`opt ${draftSort === option.id ? 'on' : ''}`}
                  onClick={() => setDraftSort(option.id)}
                >
                  <span>{option.label}</span>
                  {draftSort === option.id ? <Icon name="check" size={17} /> : null}
                </button>
              ))}
            </div>
            <p className="mini-label">Stock status</p>
            <div className="pill-row" id="f-stocks" style={{ flexWrap: 'wrap' }}>
              {STOCK_FILTERS.map((option) => (
                <button
                  key={option.id}
                  className={`pill ${draftStock === option.id ? 'on' : ''}`}
                  onClick={() => setDraftStock(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="sheet-foot">
            <button className="btn primary block" onClick={() => onApply(draftSort, draftStock)}>
              Apply Filters
            </button>
          </div>
        </div>
      )}
    </Overlay>
  );
}
