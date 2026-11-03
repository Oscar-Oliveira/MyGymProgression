import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { db } from '../../data/db';
import { Link } from 'react-router-dom';
import { Empty, PageHead, Pager, usePage } from '../components/Bits';
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
      <PageHead title={t('challenge.title')} count={closed.length > 0 ? t('challenge.rate', { done: closed.filter((c) => c.status === 'done').length, total: closed.length }) : undefined} />
      {!s.challenge && (
        <Empty
          action={
            <Link className="btn outline" to="/settings">
              {t('nav.settings')}
            </Link>
          }
        >
          {t('challenge.off')}
        </Empty>
      )}
      {list.length === 0 ? (
        s.challenge && <Empty>{t('challenge.empty')}</Empty>
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
