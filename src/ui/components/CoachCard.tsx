import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../data/db';
import { coachContext, coachKey, coachMessage, coachOnPages, dayPart, type CoachContext, type CoachPlace } from '../../domain/coach';
import type { CoachGender, CoachStyle, Exercise, MetricKey, ProgressionEvent } from '../../domain/types';
import { COACH_BANKS } from '../../i18n/coach';
import { fmtValue, useSettings } from '../util';
import { CoachAvatar } from './CoachAvatar';

/**
 * Personal trainer message; can be closed. Hidden while localStorage `storageKey` holds `storageValue`.
 * `once`: that value is stored as soon as the message shows, so it shows one time only.
 */
export function CoachCard({ storageKey, storageValue = '1', once = false, message, style, gender }: { storageKey: string; storageValue?: string; once?: boolean; message: string; style: CoachStyle; gender?: CoachGender }) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === storageValue;
    } catch {
      return false;
    }
  });
  const store = () => {
    try {
      localStorage.setItem(storageKey, storageValue);
    } catch {
      // Without storage the message only hides for this visit.
    }
  };
  useEffect(() => {
    if (once && !hidden && message) store();
  }, [once, hidden, message]);
  if (hidden || !message) return null;
  const close = () => {
    setHidden(true);
    store();
  };
  return (
    <div className="coach" role="note" aria-label={t('coach.title')}>
      <CoachAvatar style={style} gender={gender} />
      <p>{message}</p>
      <button className="ghost sm" aria-label={t('common.close')} onClick={close}>
        ✕
      </button>
    </div>
  );
}

/** The latest increase of a progression event, formatted for a trainer message. */
export function coachIncrease(exercises: Map<string, Exercise>, lang: string) {
  return (ev: ProgressionEvent) => {
    const ex = exercises.get(ev.exerciseId);
    const k = (Object.keys(ev.after) as MetricKey[]).find((m) => ev.after[m] !== ev.before[m]);
    if (!ex || !k) return undefined;
    const unit = ex.metrics.find((m) => m.key === k)?.unit ?? '';
    return { exercise: ex.name, from: fmtValue(ev.before[k], unit, lang), to: fmtValue(ev.after[k], unit, lang) };
  };
}

const today = () => new Date().toLocaleDateString('sv');

/**
 * Personal trainer outside the workout (D35): one message per page per day (`id` instead of the day: one per id).
 * Home starts with a greeting for the time of day. `extra` adds page data (next workout, sets, records).
 */
export function PageCoach({ place, id, extra }: { place: CoachPlace; id?: string; extra?: Partial<CoachContext> }) {
  const s = useSettings();
  const coach = coachOnPages(s);
  const data = useLiveQuery(async () => (coach ? { workouts: await db.workouts.toArray(), events: await db.progressionEvents.toArray(), exercises: await db.exercises.toArray() } : undefined), [!!coach]);
  if (!coach || !data) return null;
  const now = new Date();
  const bank = COACH_BANKS[s.language];
  const seen = id ?? today();
  const ctx = { ...coachContext(data.workouts, data.events, now, coachIncrease(new Map(data.exercises.map((e) => [e.id, e])), s.language)), ...extra };
  const text = coachMessage(bank[place], coach, ctx, `${place}:${seen}`);
  const message = text && place === 'home' ? `${bank.greet[coachKey(coach)][dayPart(now)]} ${text}` : text;
  return <CoachCard storageKey={`coach:${place}`} storageValue={seen} once message={message} style={coach.style} gender={coach.gender} />;
}
