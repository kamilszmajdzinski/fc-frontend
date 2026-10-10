import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { cx } from './ui';
import styles from './Toast.module.css';

type ToastTone = 'success' | 'error';

interface ToastOptions {
  /** A button in the toast, e.g. "Cofnij" after deleting. Clicking it also closes the toast. */
  action?: { label: string; onClick: () => void };
  /** How long it stays, in ms. Defaults to 6 s (9 s for errors). */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: ReactNode;
  tone: ToastTone;
}

type ShowToast = (message: ReactNode, tone?: ToastTone, options?: ToastOptions) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback<ShowToast>(
    (message, tone = 'success', options = {}) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { id, message, tone, ...options }]);
      window.setTimeout(() => dismiss(id), options.duration ?? (tone === 'error' ? 9000 : 6000));
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.stack} aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={cx(styles.toast, toast.tone === 'error' && styles.error)} role="status">
            <div className={styles.message}>{toast.message}</div>
            {toast.action && (
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  dismiss(toast.id);
                  toast.action?.onClick();
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" className={styles.close} onClick={() => dismiss(toast.id)} aria-label="Zamknij">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
