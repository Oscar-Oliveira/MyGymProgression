import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { challengeText } from '../components/ChallengeCard';
import { fmtDate, useSettings } from '../util';

const PILL = { open: '', done: 'up', missed: 'down' } as const;
const PAGE_SIZE = 10;

/** The weekly challenge switch (D58), then all weekly challenges, newest first, with how many were done. */
export function Challenges() {
  const { t } = useTranslation();
  const s = useSettings();
  const list = useLiveQuery(() => db.challenges.orderBy('week').reverse().toArray(), [], []);
  const closed = list.filter((c) => c.status !== 'open');
  // The page is kept in the URL, as in the history.
  const [params, setParams] = useSearchParams();
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(Number(params.get('page'))) || 1), pages);
  const go = (p: number) => {
    setParams(p > 1 ? { page: String(p) } : {});
    window.scrollTo(0, 0);
  };
  return (
    <div>
      <div className="page-head">
        <h1>{t('challenge.title')}</h1>
        {closed.length > 0 && <span className="pill">{t('challenge.rate', { done: closed.filter((c) => c.status === 'done').length, total: closed.length })}</span>}
      </div>
      <section className="card">
        <label className="setting-row">
          <span className="lbl">
            {t('challenge.enabled')}
            <small>{t('challenge.settingSub')}</small>
          </span>
          <input type="checkbox" role="switch" className="switch" checked={!!s.challenge} onChange={(e) => void repo.saveSettings({ challenge: e.target.checked })} />
        </label>
      </section>
      {list.length === 0 ? (
        <p className="muted">{t('challenge.empty')}</p>
      ) : (
        <>
          <ul className="card challenge-list">
            {list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((c) => (
              <li key={c.id}>
                <span>
                  <small>{t('challenge.weekOf', { date: fmtDate(`${c.week}T12:00:00`, s.language) })}</small>
                  {challengeText(t, c, s)}
                </span>
                <span className={`pill ${PILL[c.status]}`}>{t(`challenge.status.${c.status}`)}</span>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav className="pager" aria-label={t('challenge.pages')}>
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
          )}
        </>
      )}
    </div>
  );
}
