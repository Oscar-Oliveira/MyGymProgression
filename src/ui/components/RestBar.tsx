// Rest timer bar of the workout (V2-D6): counts down after a set, −15 s / +15 s / skip; vibrates and beeps at the end.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adjustRest, endRest, restLeft } from '../../domain/rest';
import type { Workout } from '../../domain/types';
import { fx } from '../games/feedback';
import { Icon } from './Icon';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function RestBar({ workout, onChange }: { workout: Workout; onChange: (w: Workout) => void }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  const rang = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!workout.restUntil) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [workout.restUntil]);
  const left = restLeft(workout, now);
  const over = !!workout.restUntil && left === 0;
  // The latest workout and handler, for the delayed close (the bar re-renders every 250 ms).
  const latest = useRef({ workout, onChange });
  latest.current = { workout, onChange };
  // The end: one alert per rest.
  useEffect(() => {
    if (!over || rang.current === workout.restUntil) return;
    rang.current = workout.restUntil;
    fx('wave');
    navigator.vibrate?.([250, 120, 250]);
  }, [over, workout.restUntil]);
  // Then the bar closes by itself, unless a new rest started meanwhile.
  useEffect(() => {
    if (!over) return;
    const until = workout.restUntil;
    const id = setTimeout(() => {
      const { workout: w, onChange: change } = latest.current;
      if (w.restUntil === until) change(endRest(w));
    }, 6000);
    return () => clearTimeout(id);
  }, [over, workout.restUntil]);
  if (!workout.restUntil) return null;
  const total = workout.restTotal ?? 1;
  return (
    <section className={`rest-bar ${over ? 'over' : ''}`} aria-label={t('rest.title')}>
      <div className="rest-row">
        <span className="rest-time num" role="timer" aria-live={over ? 'assertive' : 'off'}>
          <Icon name="timer" />
          {over ? <span className="rest-over">{t('rest.over')}</span> : mmss(left)}
        </span>
        <div className="rest-actions">
          {!over && (
            <>
              <button type="button" className="sm" onClick={() => onChange(adjustRest(workout, -15))} aria-label={t('rest.less')}>
                −15 s
              </button>
              <button type="button" className="sm" onClick={() => onChange(adjustRest(workout, 15))} aria-label={t('rest.more')}>
                +15 s
              </button>
            </>
          )}
          <button type="button" className="sm primary" onClick={() => onChange(endRest(workout))}>
            {over ? t('common.close') : t('rest.skip')}
          </button>
        </div>
      </div>
      <div className="rest-track" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
      </div>
    </section>
  );
}
