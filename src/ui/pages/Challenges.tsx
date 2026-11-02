import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { Pager, usePage } from '../components/Bits';
import { challengeText } from '../components/ChallengeCard';
import { fmtDate, useSettings } from '../util';

const PILL = { open: '', done: 'up', missed: 'down' } as const;

/** The weekly challenge switch (D58), then all weekly challenges, newest first, with how many were done. */
export function Challenges() {
  const { t } = useTranslation();
  const s = useSettings();
  const list = useLiveQuery(() => db.challenges.orderBy('week').reverse().toArray(), [], []);
  const closed = list.filter((c) => c.status !== 'open');
  const { page, pages, items } = usePage(list);
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
            {items.map((c) => (
              <li key={c.id}>
                <span>
                  <small>{t('challenge.weekOf', { date: fmtDate(`${c.week}T12:00:00`, s.language) })}</small>
                  {challengeText(t, c, s)}
                </span>
                <span className={`pill ${PILL[c.status]}`}>{t(`challenge.status.${c.status}`)}</span>
              </li>
            ))}
          </ul>
          <Pager page={page} pages={pages} label={t('challenge.pages')} />
        </>
      )}
    </div>
  );
}
