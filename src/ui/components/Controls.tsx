// Page controls (V2-D21): one pattern for each job, on every page.
// Views of a page → ViewTabs. Filters → FilterChip (+ OptionSheet). A few values in the content (period, mode) → SegSmall.
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { Modal } from './Modal';

export interface TabItem {
  key: string;
  label: ReactNode;
  /** A view that is its own page: the tab is a link. */
  to?: string;
  count?: number;
}

/** Views of one page: underlined tabs, one level only. Links when every view is a page, else tabs that change the view in place. */
export function ViewTabs({ items, active, onPick, label }: { items: TabItem[]; active: string; onPick?: (key: string) => void; label: string }) {
  const inner = (i: TabItem) => (
    <>
      {i.label}
      {i.count !== undefined && <small className="num">{i.count}</small>}
    </>
  );
  if (items.every((i) => i.to))
    return (
      <nav className="vtabs" aria-label={label}>
        {items.map((i) => (
          <Link key={i.key} to={i.to!} replace className={i.key === active ? 'on' : ''} aria-current={i.key === active ? 'page' : undefined}>
            {inner(i)}
          </Link>
        ))}
      </nav>
    );
  return (
    <div className="vtabs" role="tablist" aria-label={label}>
      {items.map((i) => (
        <button key={i.key} type="button" role="tab" aria-selected={i.key === active} className={i.key === active ? 'on' : ''} onClick={() => onPick?.(i.key)}>
          {inner(i)}
        </button>
      ))}
    </div>
  );
}

/** A row of filter chips, scrolling sideways when it does not fit. */
export function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="frow" role="group" aria-label={label}>
      {children}
    </div>
  );
}

/**
 * One filter. With `onOpen` it opens its options; the chosen value shows in the chip, with ✕ to clear it.
 * With `onToggle` it is on or off (e.g. Favourites).
 */
export function FilterChip({
  label,
  value,
  icon,
  pressed,
  onOpen,
  onToggle,
  onClear,
}: {
  label: string;
  value?: string;
  icon?: IconName;
  pressed?: boolean;
  onOpen?: () => void;
  onToggle?: () => void;
  onClear?: () => void;
}) {
  const { t } = useTranslation();
  if (onToggle)
    return (
      <button type="button" className={`fchip ${pressed ? 'on' : ''}`} aria-pressed={!!pressed} onClick={onToggle}>
        {icon && <Icon name={icon} />}
        {label}
      </button>
    );
  return (
    <span className={`fchip-wrap ${value ? 'on' : ''}`}>
      <button type="button" className={`fchip ${value ? 'on' : ''}`} aria-haspopup="dialog" aria-label={value ? `${label}: ${value}` : label} onClick={onOpen}>
        {icon && <Icon name={icon} />}
        {value ?? label}
        {!value && <Icon name="chevronDown" />}
      </button>
      {value && onClear && (
        <button type="button" className="fchip-x" aria-label={t('filters.clear', { name: label })} onClick={onClear}>
          <Icon name="close" />
        </button>
      )}
    </span>
  );
}

export interface SheetOption {
  value: string;
  label: string;
  count?: number;
}

/** The options of a filter, in a sheet: one tap picks and closes. */
export function OptionSheet({ title, options, value, onPick, onClose }: { title: string; options: SheetOption[]; value: string; onPick: (v: string) => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="opt-list" role="radiogroup" aria-label={title}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={`opt ${o.value === value ? 'on' : ''}`}
            onClick={() => {
              onPick(o.value);
              onClose();
            }}
          >
            <span className="opt-label">{o.label}</span>
            {o.count !== undefined && <small className="num">{o.count}</small>}
            <span className="opt-check" aria-hidden="true">
              {o.value === value && <Icon name="check" />}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** A few values in one line inside the content (a period, a mode). */
export function SegSmall<T extends string>({ options, value, onPick, label }: { options: { value: T; label: string }[]; value: T; onPick: (v: T) => void; label: string }) {
  return (
    <div className="seg-sm" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onPick(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
