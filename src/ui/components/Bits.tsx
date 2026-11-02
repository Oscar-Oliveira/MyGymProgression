import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type { Outcome, ProgressionStrategy } from '../../domain/types';

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
};

export function OutcomeBadge({ outcome, strategy }: { outcome: Outcome; strategy?: ProgressionStrategy }) {
  const { t } = useTranslation();
  const key = outcome === 'missed' && strategy && strategy !== 'double' ? 'missedTarget' : outcome;
  return <span className={`badge ${TONE[outcome]}`}>{t(`outcome.${key}`)}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
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
        ‹ {t('history.prev')}
      </button>
      <span className="pager-info" aria-live="polite">
        {t('history.page', { page, pages })}
      </span>
      <button className="outline" disabled={page >= pages} onClick={() => go(page + 1)}>
        {t('history.next')} ›
      </button>
    </nav>
  );
}
