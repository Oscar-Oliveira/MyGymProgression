import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="modal" aria-label={title} onCancel={(e) => (e.preventDefault(), onClose())}>
      <header className="modal-head">
        <h2>{title}</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label={t('common.close')}>
          ✕
        </button>
      </header>
      {children}
    </dialog>
  );
}
