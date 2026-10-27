import type { ViewId } from '../state/types';
import { Icon } from './Icon';

export function BottomNav({ view, onChange }: { view: ViewId; onChange: (view: ViewId) => void }) {
  return (
    <nav className="bottom-nav" id="bottomNav" aria-label="Main navigation">
      <button
        className={`nav-btn ${view === 'dashboard' ? 'active' : ''}`}
        onClick={() => onChange('dashboard')}
      >
        <Icon name="home" size={21} />
        <span>Dashboard</span>
      </button>
      <button
        className={`nav-btn ${view === 'products' ? 'active' : ''}`}
        onClick={() => onChange('products')}
      >
        <Icon name="package" size={21} />
        <span>Products</span>
      </button>
      <div className="nav-gap" aria-hidden="true" />
      <button
        className={`nav-btn ${view === 'reports' ? 'active' : ''}`}
        onClick={() => onChange('reports')}
      >
        <Icon name="chart" size={21} />
        <span>Reports</span>
      </button>
      <button
        className={`nav-btn ${view === 'settings' ? 'active' : ''}`}
        onClick={() => onChange('settings')}
      >
        <Icon name="settings" size={21} />
        <span>Settings</span>
      </button>
    </nav>
  );
}

export function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button className="fab" id="fab" onClick={onClick} aria-label="New sale — open cashier">
      <Icon name="plus" size={26} />
    </button>
  );
}
