import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface StackEntry {
  close: () => void;
  dismissible: boolean;
}

const stack: StackEntry[] = [];
let listenerInstalled = false;

function ensureEscapeListener(): void {
  if (listenerInstalled || typeof document === 'undefined') return;
  listenerInstalled = true;
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const top = stack[stack.length - 1];
    if (top && top.dismissible) {
      event.preventDefault();
      top.close();
    }
  });
}

export interface OverlayProps {
  className?: string;
  /** Backdrop / Escape dismissal. Defaults to true. */
  dismissible?: boolean;
  onClose: () => void;
  children: (requestClose: () => void) => ReactNode;
}

/**
 * Overlay shell that keeps the original enter/exit animations, backdrop clicks and
 * Escape-to-close behaviour (only the topmost overlay reacts).
 */
export function Overlay({ className = '', dismissible = true, onClose, children }: OverlayProps) {
  const [phase, setPhase] = useState<'enter' | 'in' | 'out'>('enter');
  const closingRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase((prev) => (prev === 'enter' ? 'in' : prev)));
    return () => cancelAnimationFrame(raf);
  }, []);

  const requestClose = useCallback(() => {
    if (!dismissibleRef.current || closingRef.current) return;
    closingRef.current = true;
    setPhase('out');
    setTimeout(() => closeRef.current(), 230);
  }, []);

  useEffect(() => {
    ensureEscapeListener();
    const entry: StackEntry = { close: requestClose, dismissible: true };
    stack.push(entry);
    return () => {
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
    };
  }, [requestClose]);

  return (
    <div
      className={`overlay ${phase === 'in' ? 'in' : ''} ${phase === 'out' ? 'out' : ''} ${className}`.trim()}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      {children(requestClose)}
    </div>
  );
}

/** Generic enter animation state for elements that are not overlays (e.g. cards). */
export function useMountPhase(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return mounted;
}
