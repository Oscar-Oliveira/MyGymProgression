import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="modal" aria-label={title} onCancel={(e) => (e.preventDefault(), onClose())}>
      <header className="row between">
        <h2>{title}</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label="close">
          ✕
        </button>
      </header>
      {children}
    </dialog>
  );
}
