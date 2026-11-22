// v2 navigation (F4, V2-D10): the "More" grid (everything that is not a tab) and the "Start workout" sheet of the ▶ tab.
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { db } from '../../data/db';
import { achievementsOn } from '../../domain/achievements';
import { dayMuscles } from '../../domain/audit';
import { muscleFatigue, recoveryLevel } from '../../domain/recovery';
import type { PlanDay, Settings } from '../../domain/types';
import { nextPlanned } from '../../domain/workout';
import { toneOf, toneStyle } from '../colors';
import { useStart } from '../start';
import { tr, useSettings } from '../util';
import { Icon, type IconName } from './Icon';
import { Modal } from './Modal';

/** Everything that is not a tab, in one place. A feature that is off is not listed (D78). */
export const MORE_ITEMS: { to: string; key: string; icon: IconName; shown?: (s: Settings) => boolean }[] = [
  { to: '/settings', key: 'settings', icon: 'sliders' },
  { to: '/history', key: 'history', icon: 'history' },
  { to: '/reports', key: 'reports', icon: 'chart' },
  { to: '/exercises', key: 'exercises', icon: 'dumbbell' },
  { to: '/body', key: 'body', icon: 'scale' },
  { to: '/tools', key: 'tools', icon: 'calc' },
  { to: '/plans/scan', key: 'scan', icon: 'qr' },
  { to: '/achievements', key: 'achievements', icon: 'medal', shown: achievementsOn },
  { to: '/challenges', key: 'challenges', icon: 'trophy', shown: (s) => !!s.challenge },
  { to: '/coach', key: 'coach', icon: 'user', shown: (s) => !!s.coach?.enabled },
  { to: '/games', key: 'games', icon: 'joystick' },
  { to: '/about', key: 'about', icon: 'info' },
];

export function MoreSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const s = useSettings();
  return (
    <Modal title={t('nav.more')} onClose={onClose}>
      <nav className="more-grid" aria-label={t('nav.more')}>
        {MORE_ITEMS.filter((i) => i.shown?.(s) ?? true).map((i) => (
          <Link key={i.to} to={i.to} className="more-tile" onClick={onClose}>
            <span className="more-ico">
              <Icon name={i.icon} />
            </span>
            <span>{t(`nav.${i.key}`)}</span>
          </Link>
        ))}
      </nav>
    </Modal>
  );
}

/** Round icon button for page headers: opens the "More" grid. */
export function MoreButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="icon-btn" aria-label={t('nav.moreOptions')} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Icon name="grid" />
      </button>
      {open && <MoreSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** The ▶ tab: the next planned workout first, then every day of the active plans, then a free workout. Nothing starts on one tap by mistake. */
export function StartSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const start = useStart();
  const data = useLiveQuery(async () => {
    const [plans, versions, workouts, exercises] = await Promise.all([db.plans.toArray(), db.planVersions.toArray(), db.workouts.orderBy('startedAt').reverse().toArray(), db.exercises.toArray()]);
    return { plans: plans.filter((p) => p.status === 'active'), versions, workouts, exercises: new Map(exercises.map((e) => [e.id, e])) };
  });
  if (!data) return null;
  const next = nextPlanned(data.plans, data.versions, data.workouts);
  // Recovery (V2-D20): the primary muscles of each day that are still tired, or else still recovering.
  const fatigue = muscleFatigue(data.workouts, new Date());
  const recoveryHint = (day: PlanDay) => {
    const primary = Object.entries(dayMuscles(day, data.exercises).roles).filter(([, r]) => r === 'primary').map(([m]) => m);
    for (const level of ['tired', 'recovering'] as const) {
      const list = primary.filter((m) => recoveryLevel(fatigue[m]) === level);
      if (list.length) return t(`recovery.day.${level}`, { list: list.map((m) => tr(t, 'muscle', m)).join(', ') });
    }
    return '';
  };
  const go = (planId?: string, dayId?: string) => {
    onClose();
    void start(planId, dayId);
  };
  return (
    <Modal title={t('startSheet.title')} onClose={onClose}>
      <div className="start-sheet">
        {next && (
          <button type="button" className="primary xl toned" style={toneStyle(toneOf(next.plan, next.day))} onClick={() => go(next.plan.id, next.day.id)}>
            <Icon name="play" /> {t('startSheet.next', { day: next.day.name })}
          </button>
        )}
        {data.plans.map((p) => {
          const v = data.versions.find((x) => x.id === p.currentVersionId);
          if (!v?.days.length) return null;
          return (
            <section key={p.id} className="start-plan">
              <p className="eyebrow">{p.name}</p>
              <div className="start-days">
                {v.days.map((d) => {
                  const hint = recoveryHint(d);
                  return (
                    <button key={d.id} type="button" className="start-day toned" style={toneStyle(toneOf(p, d))} onClick={() => go(p.id, d.id)}>
                      <span className="dot" aria-hidden="true" />
                      <span className="start-day-text">
                        {d.name}
                        {hint && <span className="start-day-hint">{hint}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        <button type="button" className="outline xl" onClick={() => go()}>
          <Icon name="plus" /> {t('workout.free')}
        </button>
      </div>
    </Modal>
  );
}
