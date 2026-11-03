import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { Achievement, AchievementKind } from '../../domain/achievements';
import type { Settings } from '../../domain/types';
import { fmtDate, fmtNum, loadOut } from '../util';
import { Icon, type IconName } from './Icon';

const ICON: Record<AchievementKind, IconName> = { workouts: 'dumbbell', streak: 'target', session: 'hammer', total: 'stairs', records: 'trophy', muscles: 'body', early: 'rocket', late: 'star' };
const VOLUME: AchievementKind[] = ['session', 'total'];

/** A volume in tonnes (kg) or in pounds. */
function volume(kg: number, s: Settings): string {
  return s.loadUnit === 'kg' ? `${fmtNum(kg / 1000, s.language, 1)} t` : `${fmtNum(loadOut(kg, s), s.language, 0)} ${s.loadUnit}`;
}

/** Name of an achievement, e.g. "10 workouts" or "5 t in one workout". */
export function achievementName(t: TFunction, a: Pick<Achievement, 'kind' | 'target'>, s: Settings): string {
  return t(`achievements.name.${a.kind}`, { count: a.target, value: volume(a.target, s) });
}

/** Medals (D73): earned ones with their date, the others with their progress. */
export function Medals({ items, s }: { items: Achievement[]; s: Settings }) {
  const { t } = useTranslation();
  const value = (a: Achievement, v: number) => (VOLUME.includes(a.kind) ? volume(v, s) : fmtNum(v, s.language, 0));
  return (
    <ul className="medals">
      {items.map((a) => (
        <li key={a.id} className={`medal ${a.earnedAt ? 'on' : ''}`}>
          <span className="medal-ico" aria-hidden="true">
            <Icon name={ICON[a.kind]} />
          </span>
          <span className="medal-main">
            <strong>{achievementName(t, a, s)}</strong>
            <small>{a.earnedAt ? t('achievements.earnedOn', { date: fmtDate(a.earnedAt, s.language) }) : t(`achievements.desc.${a.kind}`)}</small>
            {!a.earnedAt && a.target > 1 && (
              <>
                <span className="mbar" aria-hidden="true">
                  <span className="bar" style={{ width: `${(a.progress / a.target) * 100}%` }} />
                </span>
                <small className="num">{t('achievements.progress', { now: value(a, a.progress), target: value(a, a.target) })}</small>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
