import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import type { Outcome, ProgressionStrategy } from '../../domain/types';
import { ViewTabs } from './Controls';
import { Icon, type IconName } from './Icon';
import { MoreButton } from './NavSheets';

const TONE: Record<Outcome, string> = {
  increase: 'up',
  ready: 'up',
  progress: 'up',
  keep: '',
  at_cap: '',
  no_progression: '',
  manual: '',
  missed: 'warn',
  incomplete: 'warn',
  restricted: 'warn',
  sync: 'warn',
  deload: 'warn',
};

export function OutcomeBadge({ outcome, strategy }: { outcome: Outcome; strategy?: ProgressionStrategy }) {
  const { t } = useTranslation();
  const key = outcome === 'missed' && strategy && strategy !== 'double' && strategy !== 'triple' ? 'missedTarget' : outcome;
  return <span className={`badge ${TONE[outcome]}`}>{t(`outcome.${key}`)}</span>;
}

/**
 * Title of every page: an optional line above; under the title a subtitle and a count, as text (V2-D21);
 * `actions` (icon buttons, e.g. "new") next to the title; `aside` for other content below.
 */
export function PageHead({
  eyebrow,
  title,
  sub,
  count,
  aside,
  actions,
  more,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  count?: ReactNode;
  aside?: ReactNode;
  actions?: ReactNode;
  more?: boolean;
}) {
  return (
    <div className="page-head">
      <div className="page-title">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {sub && <small>{sub}</small>}
          {count !== undefined && <small className="page-count">{count}</small>}
        </div>
        {/* Main pages (tabs) have the "More" grid in the header (V2-D10). */}
        {(actions || more) && (
          <div className="head-actions">
            {actions}
            {more && <MoreButton />}
          </div>
        )}
      </div>
      {aside && <div className="row wrap">{aside}</div>}
    </div>
  );
}

/** An icon button for the page header (V2-D21): a link or a button, always with a name for screen readers. */
export function HeadAction({ icon, label, to, onClick, primary }: { icon: IconName; label: string; to?: string; onClick?: () => void; primary?: boolean }) {
  const cls = `icon-btn ${primary ? 'primary' : ''}`;
  return to ? (
    <Link to={to} className={cls} aria-label={label} title={label}>
      <Icon name={icon} />
    </Link>
  ) : (
    <button type="button" className={cls} aria-label={label} title={label} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}

/** A list or page with nothing to show, with the next step when there is one. */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <p>{children}</p>
      {action}
    </div>
  );
}

/** Items per page of every list that grows over time (history, challenges, reports, exercise history). */
export const PAGE_SIZE = 10;

/** Page asked for in the URL under `key` (1 when absent or not a number). */
export const askedPage = (params: URLSearchParams, key = 'page') => Math.max(1, Math.floor(Number(params.get(key))) || 1);

/**
 * Page of a list held in memory. The page is kept in the URL under `key`, so "back" returns to the same page.
 * A page past the end (e.g. after a delete) shows the last page.
 */
export function pageOf<T>(list: T[], params: URLSearchParams, key = 'page') {
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.min(askedPage(params, key), pages);
  return { page, pages, items: list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}

export function usePage<T>(list: T[], key = 'page') {
  const [params] = useSearchParams();
  return pageOf(list, params, key);
}

/**
 * Previous / next buttons and "Page x of y". Hidden with one page.
 * A list inside a section (lower on the page) stays in view after the change; other pages start at the top.
 */
export function Pager({ page, pages, label, pageKey = 'page' }: { page: number; pages: number; label: string; pageKey?: string }) {
  const { t } = useTranslation();
  const [, setParams] = useSearchParams();
  const ref = useRef<HTMLElement>(null);
  if (pages <= 1) return null;
  const go = (p: number) => {
    const section = ref.current?.closest('section');
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (p > 1) next.set(pageKey, String(p));
      else next.delete(pageKey);
      return next;
    });
    // After the new page is drawn and the scroll memory has moved to the top.
    if (section) requestAnimationFrame(() => requestAnimationFrame(() => section.scrollIntoView({ block: 'start' })));
  };
  return (
    <nav ref={ref} className="pager" aria-label={label}>
      <button className="outline" disabled={page <= 1} onClick={() => go(page - 1)}>
        <Icon name="chevronLeft" /> {t('history.prev')}
      </button>
      <span className="pager-info" aria-live="polite">
        {t('history.page', { page, pages })}
      </span>
      <button className="outline" disabled={page >= pages} onClick={() => go(page + 1)}>
        {t('history.next')} <Icon name="chevronRight" />
      </button>
    </nav>
  );
}

/** Progress tab (V2-D23): Summary, History and Body, as underlined tabs on top of the three pages. */
export function ProgressSwitch({ on }: { on: 'reports' | 'history' | 'body' }) {
  const { t } = useTranslation();
  return (
    <ViewTabs
      label={t('nav.progress')}
      active={on}
      items={[
        { key: 'reports', label: t('nav.summary'), to: '/reports' },
        { key: 'history', label: t('nav.history'), to: '/history' },
        { key: 'body', label: t('nav.body'), to: '/body' },
      ]}
    />
  );
}
