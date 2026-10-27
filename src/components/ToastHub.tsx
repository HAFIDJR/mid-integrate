import { useApp } from '../state/AppContext';
import { Icon } from './Icon';

export function ToastHub() {
  const { toasts } = useApp();
  return (
    <div className="toast-root" id="toast-root" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast ${toast.kind} ${toast.phase === 'in' ? 'in' : ''} ${toast.phase === 'out' ? 'out' : ''}`.trim()}
          role="status"
        >
          <Icon name={toast.kind === 'warn' ? 'alert' : toast.kind === 'info' ? 'info' : 'checkCircle'} size={16} />
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
