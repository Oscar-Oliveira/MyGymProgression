import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { db } from '../../data/db';
import { challengeText } from '../components/ChallengeCard';
import { fmtDate, useSettings } from '../util';

const PILL = { open: '', done: 'up', missed: 'down' } as const;

/** All weekly challenges, newest first, with how many were done. */
export function Challenges() {
  const { t } = useTranslation();
  const s = useSettings();
  const list = useLiveQuery(() => db.challenges.orderBy('week').reverse().toArray(), [], []);
  const closed = list.filter((c) => c.status !== 'open');
  return (
    <div>
      <div className="page-head">
        <h1>{t('challenge.title')}</h1>
        {closed.length > 0 && <span className="pill">{t('challenge.rate', { done: closed.filter((c) => c.status === 'done').length, total: closed.length })}</span>}
      </div>
      {!s.challenge && <p className="help">{t('challenge.off')}</p>}
      {list.length === 0 ? (
        <p className="muted">{t('challenge.empty')}</p>
      ) : (
        <ul className="card challenge-list">
          {list.map((c) => (
            <li key={c.id}>
              <span>
                <small>{t('challenge.weekOf', { date: fmtDate(`${c.week}T12:00:00`, s.language) })}</small>
                {challengeText(t, c, s)}
              </span>
              <span className={`pill ${PILL[c.status]}`}>{t(`challenge.status.${c.status}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
