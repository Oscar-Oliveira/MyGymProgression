import { useState, type ReactNode } from 'react';

const read = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
};

/** Card with a title that collapses and expands; the state is remembered per `id` on this device. */
export function Section({ id, title, extra, defaultOpen = true, children }: { id: string; title: ReactNode; extra?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const key = `section:${id}`;
  const [open, setOpen] = useState(() => read(key, defaultOpen));
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(key, open ? '0' : '1');
    } catch {
      // Storage may be unavailable (private mode); the section still works for this visit.
    }
  };
  return (
    <section className={`card fold ${open ? 'open' : ''}`}>
      <div className="fold-head">
        <button type="button" className="fold-toggle" aria-expanded={open} onClick={toggle}>
          <h2>{title}</h2>
          <span className="fold-chev" aria-hidden="true">
            ⌄
          </span>
        </button>
        {extra}
      </div>
      {open && <div className="fold-body">{children}</div>}
    </section>
  );
}
