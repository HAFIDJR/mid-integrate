import { useState } from 'react';
import { Icon } from '../components/Icon';
import { BIZ_TYPES, LOGO_PRESETS } from '../lib/constants';
import { generateDemo } from '../lib/demo';
import { useApp } from '../state/AppContext';
import { resetUiState } from '../state/uiState';

export function Settings() {
  const {
    store,
    theme,
    justOnboarded,
    setTheme,
    saveStore,
    clearJustOnboarded,
    populateDemo,
    resetAll,
    confirm,
    toast,
    paymentConfig,
  } = useApp();

  const [logo, setLogo] = useState(store.logo);
  const [storeName, setStoreName] = useState(store.storeName);
  const [ownerName, setOwnerName] = useState(store.ownerName);
  const [businessType, setBusinessType] = useState(store.businessType);

  const saveProfile = () => {
    const name = storeName.trim();
    if (!name) {
      toast('Store name cannot be empty', 'warn');
      return;
    }
    saveStore({
      logo,
      storeName: name,
      ownerName: ownerName.trim() || store.ownerName,
      businessType,
    });
    clearJustOnboarded();
    toast('Store profile saved');
  };

  const loadDemo = () => {
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
  };

  const reset = () => {
    void confirm({
      title: 'Remove all data?',
      ok: 'Reset Everything',
      danger: true,
      msg: 'Products, sales and store settings will be erased. Onboarding starts over. This cannot be undone.',
    }).then((ok) => {
      if (!ok) return;
      resetUiState();
      resetAll();
      setLogo('☕');
      setStoreName('Kedai Senja');
      setOwnerName('Budi Santoso');
      setBusinessType('Coffee Shop');
    });
  };

  const paymentLabel = !paymentConfig
    ? 'Checking Midtrans connection…'
    : !paymentConfig.configured
      ? 'Midtrans is not configured'
      : paymentConfig.environment === 'production'
        ? 'Midtrans QRIS · Live'
        : 'Midtrans QRIS · Sandbox';

  const paymentHint = !paymentConfig
    ? 'Verifying the server-side payment connection.'
    : !paymentConfig.configured
      ? 'Set MIDTRANS_SERVER_KEY on the server to accept QRIS payments. QRIS stays disabled until then.'
      : 'Dynamic QRIS is created by the server for the exact cart total and verified before a sale is recorded.';

  return (
    <div className="view">
      <div className="view-head">
        <h2 className="view-title">Settings</h2>
      </div>
      <div className="settings-panels">
        <section className={`panel ${justOnboarded ? 'flash' : ''}`}>
          {justOnboarded ? (
            <div className="welcome-strip">
              <Icon name="sparkles" size={15} /> Welcome! Set up your store to get started.
            </div>
          ) : null}
          <h3 className="panel-title">
            <Icon name="store" size={15} /> Store Profile
          </h3>
          <div className="logo-row">
            <div className="logo-big" id="logo-prev">
              {logo}
            </div>
            <div className="logo-pick" id="logo-pick">
              {LOGO_PRESETS.map((preset) => (
                <button
                  key={preset}
                  className={`logo-opt ${logo === preset ? 'on' : ''}`}
                  onClick={() => setLogo(preset)}
                  aria-label={`Logo ${preset}`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Store name</label>
            <input
              className="input"
              id="set-storeName"
              value={storeName}
              placeholder="Your shop name"
              onChange={(event) => setStoreName(event.target.value)}
            />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Owner name</label>
            <input
              className="input"
              id="set-owner"
              value={ownerName}
              placeholder="Owner"
              onChange={(event) => setOwnerName(event.target.value)}
            />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Business type</label>
            <div className="select-wrap">
              <select
                className="input"
                id="set-biz"
                value={businessType}
                onChange={(event) => setBusinessType(event.target.value)}
              >
                {BIZ_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <Icon name="chevronDown" size={15} className="sel-ic" />
            </div>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>QRIS payments</label>
            <div className="qr-note" style={{ marginBottom: 0 }}>
              <Icon name="qr" size={24} />
              <div>
                <b>{paymentLabel}</b>
                <span>{paymentHint}</span>
              </div>
            </div>
            <p className="hint">
              Powered by Midtrans Core API. The Server Key stays on the server — it is never
              entered, stored or displayed in this browser.
            </p>
          </div>
          <button className="btn primary block" style={{ marginTop: 16 }} onClick={saveProfile}>
            Save Store Profile
          </button>
        </section>

        <section className="panel">
          <h3 className="panel-title">
            <Icon name="sun" size={15} /> Appearance
          </h3>
          <div className="seg" id="theme-seg">
            <button
              className={`seg-btn ${theme === 'light' ? 'on' : ''}`}
              onClick={() => {
                setTheme('light');
                toast('Light theme on', 'info');
              }}
            >
              <Icon name="sun" size={15} /> Light
            </button>
            <button
              className={`seg-btn ${theme === 'dark' ? 'on' : ''}`}
              onClick={() => {
                setTheme('dark');
                toast('Dark theme on', 'info');
              }}
            >
              <Icon name="moon" size={15} /> Dark
            </button>
          </div>
        </section>

        <section className="panel">
          <h3 className="panel-title">
            <Icon name="package" size={15} /> Data Utilities
          </h3>
          <button className="btn soft block" onClick={loadDemo}>
            <Icon name="sparkles" size={16} /> Populate Demo Data
          </button>
          <p className="hint">Injects 12 products and ~30 days of transactions for a full preview.</p>
          <button className="btn danger-soft block" onClick={reset}>
            <Icon name="trash" size={16} /> Reset / Remove All Data
          </button>
          <p className="hint">Clears localStorage and restarts onboarding.</p>
        </section>
      </div>
      <p className="app-foot">Kasir Digital v1.0 · Built for small shops</p>
    </div>
  );
}
