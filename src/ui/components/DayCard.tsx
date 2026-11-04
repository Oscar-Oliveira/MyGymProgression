import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { dayMuscles } from '../../domain/audit';
import type { Exercise, Plan, PlanDay, WorkoutEntry } from '../../domain/types';
import { toneOf, toneStyle } from '../colors';
import { rxLine } from '../progress';
import { tr, useSettings, useThumbs } from '../util';
import { BodyMap } from './BodyMap';
import { ExerciseItem } from './ExerciseItem';
import { Icon } from './Icon';

/** Exercises shown before "show more". */
const PREVIEW = 4;

/** Muscles a plan day works (D76): the primary ones in the summary; open, the body map with the planned sets. */
export function DayMuscles({ day, exercises }: { day: PlanDay; exercises: Map<string, Exercise> }) {
  const { t } = useTranslation();
  const s = useSettings();
  const { sets, roles } = dayMuscles(day, exercises);
  const primary = Object.keys(roles).filter((m) => roles[m] === 'primary');
  if (!primary.length) return null;
  return (
    <details className="day-muscles">
      <summary>
        <span>
          <strong>{t('exercise.muscles')}:</strong> {primary.map((m) => tr(t, 'muscle', m)).join(', ')}
        </span>
      </summary>
      <BodyMap sets={sets} roles={roles} lang={s.language} small />
    </details>
  );
}

/**
 * One plan day, the same everywhere (D77): Home (next workout and the day window) and Train.
 * `entries`: the workout the day would start now (targets after progression). `hero`: the large card of Home.
 */
export function DayCard({
  plan,
  day,
  entries,
  exercises,
  eyebrow,
  hero,
  next,
  showPlan,
  all,
  onStart,
  children,
}: {
  plan: Plan;
  day: PlanDay;
  entries: WorkoutEntry[];
  exercises: Map<string, Exercise>;
  eyebrow?: ReactNode;
  hero?: boolean;
  next?: boolean;
  showPlan?: boolean;
  /** Every exercise at once, without "show more". */
  all?: boolean;
  onStart: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const s = useSettings();
  const thumbOf = useThumbs();
  const [open, setOpen] = useState(all);
  const weekdays = t('weekday', { returnObjects: true }) as string[];
  const sets = entries.reduce((a, e) => a + e.prescription.filter((x) => x.kind === 'working').length, 0);
  const shown = open ? entries : entries.slice(0, PREVIEW);
  const meta = [showPlan && plan.name, day.weekday !== undefined && weekdays[day.weekday], t('home.size', { count: entries.length, sets })].filter(Boolean).join(' · ');
  return (
    <section className={hero ? 'hero toned day-hero' : `card day-card toned tone-bar ${next ? 'next' : ''}`} style={toneStyle(toneOf(plan, day))} aria-label={day.name}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      {hero ? (
        <h1>{day.name}</h1>
      ) : (
        <h2 className="day-title">
          {day.name} {next && <span className="pill tone">{t('train.next')}</span>}
        </h2>
      )}
      <p className="muted day-meta">{meta}</p>
      <DayMuscles day={day} exercises={exercises} />
      <div className="day-list">
        {shown.map((e) => (
          <ExerciseItem key={e.id} name={e.exercise.name} thumb={thumbOf(e.exerciseId, e.exercise.thumb)} sub={rxLine(e, t, s.language)} size="sm" to={`/exercises/${e.exerciseId}`} />
        ))}
        {entries.length > shown.length && (
          <button type="button" className="ghost sm" onClick={() => setOpen(true)}>
            {t('home.andMore', { count: entries.length - shown.length })}
          </button>
        )}
      </div>
      <button className={hero || next ? 'primary xl' : 'outline xl'} disabled={!entries.length} onClick={onStart}>
        <Icon name="play" /> {t('home.start')}
      </button>
      {children}
    </section>
  );
}
