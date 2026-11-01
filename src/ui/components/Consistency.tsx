// Consistency map (D43): the last 12 months, one square per day in the plan colour, and the weeks in a row.
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { consistencyMap, weekStreak } from '../../domain/analysis';
import type { Workout } from '../../domain/types';
import { toneStyle, useTones } from '../colors';
import { fmtDate, useSettings } from '../util';

export function Consistency({ workouts }: { workouts: Workout[] }) {
  const { t } = useTranslation();
  const s = useSettings();
  const toneFor = useTones();
  const row = useRef<HTMLDivElement>(null);
  const { weeks, streak } = useMemo(() => {
    const now = new Date();
    return { weeks: consistencyMap(workouts, now), streak: weekStreak(workouts, now) };
  }, [workouts]);
  // Start at the most recent weeks.
  useEffect(() => {
    if (row.current) row.current.scrollLeft = row.current.scrollWidth;
  }, [weeks.length]);
  const days = weeks.flat().filter((d) => d.workouts.length).length;
  return (
    <section className="card">
      <div className="section-head" style={{ marginTop: 0 }}>
        <h2>{t('analysis.consistency')}</h2>
      </div>
      <div className="grid3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginBottom: '0.8rem' }}>
        <div className="stat">
          <div className="value">{t('analysis.weeksN', { count: streak.current })}</div>
          <div className="label">{t('analysis.streak')}</div>
        </div>
        <div className="stat">
          <div className="value">{t('analysis.weeksN', { count: streak.best })}</div>
          <div className="label">{t('analysis.bestStreak')}</div>
        </div>
      </div>
      <div className="heat" ref={row} role="img" aria-label={`${t('analysis.consistency')}: ${days}`}>
        {weeks.map((week) => (
          <div key={week[0].date} className="heat-col">
            {week.map((d) => {
              const w = d.workouts[d.workouts.length - 1];
              return (
                <span
                  key={d.date}
                  className={`heat-cell ${w ? 'on toned' : ''} ${d.workouts.length > 1 ? 'many' : ''}`}
                  style={w ? toneStyle(toneFor(w.planId, w.dayId)) : undefined}
                  title={t('analysis.dayCell', { date: fmtDate(`${d.date}T12:00:00`, s.language), count: d.workouts.length })}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="help">{t('analysis.consistencyHelp')}</p>
    </section>
  );
}
