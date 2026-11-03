import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import { achievements, achievementsOn } from '../../domain/achievements';
import { Empty, PageHead } from '../components/Bits';
import { Medals } from '../components/Medals';
import { useSettings } from '../util';

/** Achievements (D73): the medals earned (newest first), then the others with their progress. */
export function Achievements() {
  const { t } = useTranslation();
  const s = useSettings();
  const workouts = useLiveQuery(() => db.workouts.toArray(), []);
  const list = useMemo(() => (workouts ? achievements(workouts) : []), [workouts]);
  if (!workouts) return null;
  const earned = list.filter((a) => a.earnedAt).sort((a, b) => b.earnedAt!.localeCompare(a.earnedAt!));
  const locked = list.filter((a) => !a.earnedAt);
  return (
    <div>
      <PageHead title={t('nav.achievements')} count={achievementsOn(s) ? t('achievements.count', { done: earned.length, total: list.length }) : undefined} />
      {!achievementsOn(s) ? (
        <Empty
          action={
            <Link className="btn outline" to="/settings">
              {t('nav.settings')}
            </Link>
          }
        >
          {t('achievements.off')}
        </Empty>
      ) : (
        <>
          <div className="section-head">
            <h2>{t('achievements.earned')}</h2>
          </div>
          {earned.length ? <Medals items={earned} s={s} /> : <Empty>{t('achievements.none')}</Empty>}
          {locked.length > 0 && (
            <>
              <div className="section-head">
                <h2>{t('achievements.locked')}</h2>
              </div>
              <Medals items={locked} s={s} />
            </>
          )}
        </>
      )}
    </div>
  );
}
