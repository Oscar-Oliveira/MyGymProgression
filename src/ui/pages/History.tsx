import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { repo } from '../../data/repo';
import { dialog } from '../components/Dialog';
import { resumable } from '../../domain/workout';
import { db } from '../../data/db';
import type { Workout } from '../../domain/types';
import { Empty } from '../components/Bits';
import { ThumbStack } from '../components/ExerciseItem';
import { useSettings, useThumbs } from '../util';
import { toneStyle, useTones } from '../colors';

const STATUS_TONE: Record<Workout['status'], string> = { completed: 'up', partial: 'warn', interrupted: 'warn', in_progress: '' };
const PAGE_SIZE = 10;

export function History() {
  const { t } = useTranslation();
  const s = useSettings();
  const thumbOf = useThumbs();
  const toneFor = useTones();
  const nav = useNavigate();
  // The page is kept in the URL, so "back" from a workout returns to the same page.
  const [params, setParams] = useSearchParams();
  const asked = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const data = useLiveQuery(async () => {
    const total = await db.workouts.count();
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    // A page past the end (e.g. after a delete) shows the last page.
    const page = Math.min(asked, pages);
    const workouts = await db.workouts
      .orderBy('startedAt')
      .reverse()
      .offset((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .toArray();
    const latest = await db.workouts.orderBy('startedAt').last();
    return { total, pages, page, workouts, latest };
  }, [asked]);
  if (!data) return null;
  const { total, pages, page, workouts, latest } = data;
  const resume = async (w: Workout) => {
    try {
      if (w.status === 'interrupted') await repo.resumeWorkout(w.id);
      nav(`/workout/${w.id}`);
    } catch {
      await dialog.alert(t('workout.otherInProgress'));
    }
  };
  const locale = s.language === 'pt' ? 'pt-PT' : 'en-GB';
  const month = (iso: string) => new Date(iso).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const go = (p: number) => {
    setParams(p > 1 ? { page: String(p) } : {});
    window.scrollTo(0, 0);
  };

  return (
    <div>
      <div className="page-head">
        <h1>{t('history.title')}</h1>
        {total > 0 && <span className="pill">{t('history.count', { count: total })}</span>}
      </div>
      {total === 0 ? (
        <Empty>{t('history.empty')}</Empty>
      ) : (
        <>
          {latest && resumable(latest, [latest]) && (
            <section className="card warn toned" style={toneStyle(toneFor(latest.planId, latest.dayId))}>
              <p className="eyebrow">{t(`workout.status.${latest.status}`)}</p>
              <h3 style={{ marginTop: 0 }}>{latest.dayName ?? t('workout.free')}</h3>
              {latest.status === 'interrupted' && <p className="help">{t('workout.resumeHelp')}</p>}
              <button className="primary xl" onClick={() => void resume(latest)}>
                ▶ {t('workout.resume')}
              </button>
            </section>
          )}
          {workouts.map((w, i) => {
            const done = w.entries.reduce((a, e) => a + e.sets.filter((x) => x.kind === 'working' && x.status === 'done').length, 0);
            const totalSets = w.entries.reduce((a, e) => a + e.prescription.filter((x) => x.kind === 'working').length, 0);
            const ups = w.entries.filter((e) => e.evaluation?.outcome === 'increase' || e.evaluation?.outcome === 'ready').length;
            const newMonth = i === 0 || month(workouts[i - 1].startedAt) !== month(w.startedAt);
            const d = new Date(w.startedAt);
            return (
              <div key={w.id}>
                {newMonth && <p className="month">{month(w.startedAt)}</p>}
                <Link to={`/workout/${w.id}`} className="card hist-row toned" style={toneStyle(toneFor(w.planId, w.dayId))}>
                  <span className="date-tile" aria-hidden="true">
                    <span className="wd">{d.toLocaleDateString(locale, { weekday: 'short' })}</span>
                    <span className="dd">{d.getDate()}</span>
                  </span>
                  <span className="main">
                    <span className="title">{w.dayName ?? t('workout.free')}</span>
                    <span className="meta">{[w.planName, t('workout.setsDone', { done, total: totalSets })].filter(Boolean).join(' · ')}</span>
                    <span className="meta">
                      <ThumbStack items={w.entries.map((e) => ({ name: e.exercise.name, thumb: thumbOf(e.exerciseId, e.exercise.thumb) }))} />
                    </span>
                  </span>
                  <span className="col" style={{ alignItems: 'flex-end', gap: '0.3rem' }}>
                    <span className={`pill ${STATUS_TONE[w.status]}`}>{t(`workout.status.${w.status}`)}</span>
                    {ups > 0 && <span className="pill up">⬆ {ups}</span>}
                  </span>
                </Link>
              </div>
            );
          })}
          {pages > 1 && (
            <nav className="pager" aria-label={t('history.pages')}>
              <button className="outline" disabled={page <= 1} onClick={() => go(page - 1)}>
                ‹ {t('history.prev')}
              </button>
              <span className="pager-info" aria-live="polite">
                {t('history.page', { page, pages })}
              </span>
              <button className="outline" disabled={page >= pages} onClick={() => go(page + 1)}>
                {t('history.next')} ›
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
