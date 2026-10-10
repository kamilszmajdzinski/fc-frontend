import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, cx } from './ui';
import styles from './Modal.module.css';

type ModalSize = 'small' | 'medium' | 'large';

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  size?: ModalSize;
  children: ReactNode;
}

export function Modal({ title, onClose, size = 'small', children }: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className={styles.root} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={cx(styles.card, styles[size])}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmModalProps {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  /** Red for deleting, dark for confirming a save. */
  confirmVariant?: 'danger' | 'primary';
  busy?: boolean;
  busyLabel?: string;
  size?: ModalSize;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title = 'Potwierdzenie',
  message,
  confirmLabel = 'Usuń',
  confirmVariant = 'danger',
  busy,
  busyLabel = 'Usuwanie…',
  size,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal title={title} onClose={onCancel} size={size}>
      <div className={styles.message}>{message}</div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onCancel} autoFocus>
          Anuluj
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm} disabled={busy}>
          {busy ? busyLabel : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/** A modal with a message and a single button, for things the user cannot do. */
export function NoticeModal({ title, message, onClose }: { title: string; message: ReactNode; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className={styles.message}>{message}</div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose} autoFocus>
          Rozumiem
        </Button>
      </div>
    </Modal>
  );
}
