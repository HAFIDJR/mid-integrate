import { useApp } from '../state/AppContext';
import { Overlay } from '../hooks/useOverlay';
import { Icon } from './Icon';
import { useEffect } from 'react';

export function ConfirmDialog() {
  const { confirmState, resolveConfirm } = useApp();
  const options = confirmState?.options;

  useEffect(() => {
    if (!confirmState) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        resolveConfirm(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [confirmState, resolveConfirm]);

  if (!confirmState || !options) return null;

  return (
    <Overlay className="confirm-ov" onClose={() => resolveConfirm(false)}>
      {() => (
        <div className="modal rise" role="alertdialog" aria-modal="true" aria-label={options.title}>
          <div className={`modal-ic ${options.danger ? 'danger' : ''}`}>
            <Icon name={options.danger ? 'alert' : 'info'} size={22} />
          </div>
          <h3>{options.title}</h3>
          <p>{options.msg}</p>
          <div className="modal-actions">
            <button className="btn ghost grow" onClick={() => resolveConfirm(false)}>
              Cancel
            </button>
            <button
              className={`btn ${options.danger ? 'danger' : 'primary'} grow`}
              onClick={() => resolveConfirm(true)}
            >
              {options.ok ?? 'Confirm'}
            </button>
          </div>
        </div>
      )}
    </Overlay>
  );
}
