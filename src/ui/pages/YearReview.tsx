import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../data/db';
import type { Settings } from '../../domain/types';
import { reviewYears, yearReview, type YearReview } from '../../domain/year';
import { Empty } from '../components/Bits';
import { BodyMap } from '../components/BodyMap';
import { Icon } from '../components/Icon';
import { achievementName } from '../components/Medals';
import { fmtNum, fmtVolume, loadOut, tr, useSettings } from '../util';
import { shareImage } from '../shareCard';
import { drawYearCard } from '../yearCard';

const ELEPHANT_KG = 6000;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A number that counts up from 0 when it appears (at once with reduced motion). */
function CountUp({ value, format }: { value: number; format: (v: number) => string }) {
  const [v, setV] = useState(() => (reduced() ? value : 0));
  useEffect(() => {
    if (reduced()) return setV(value);
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 900);
      setV(value * (1 - (1 - k) ** 3));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{format(v)}</>;
}

const gainPct = (g: { from: number; to: number }) => Math.round(((g.to - g.from) / g.from) * 100);
const weekdayName = (wd: number, lang: string) => new Date(2024, 0, 1 + wd).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB', { weekday: 'long' });

/** Year in review (D74): a year picker, the main numbers and the stories. */
export function YearTab() {
  const { t } = useTranslation();
  const s = useSettings();
  const workouts = useLiveQuery(() => db.workouts.toArray(), []);
  const years = useMemo(() => (workouts ? reviewYears(workouts) : []), [workouts]);
  const [picked, setPicked] = useState<number>();
  const [open, setOpen] = useState(false);
  const year = picked ?? years[0];
  const review = useMemo(() => (workouts && year ? yearReview(workouts, year, new Date()) : undefined), [workouts, year]);
  if (!workouts) return null;
  if (!review) return <Empty>{t('year.empty')}</Empty>;
  return (
    <>
      {years.length > 1 && (
        <label>
          {t('year.pick')}
          <select value={year} onChange={(e) => setPicked(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      )}
      <section className="hero year-hero">
        <p className="eyebrow">{review.year === new Date().getFullYear() ? t('year.soFar') : review.year}</p>
        <h1>{t('year.title', { year: review.year })}</h1>
        <div className="grid3 stats">
          <div className="stat">
            <div className="value">{review.workouts}</div>
            <div className="label">{t('year.workouts')}</div>
          </div>
          <div className="stat">
            <div className="value">{fmtNum(review.hours, s.language, 0)}</div>
            <div className="label">{t('year.hours')}</div>
          </div>
          <div className="stat">
            <div className="value">{fmtVolume(review.volume, s)}</div>
            <div className="label">{t('year.tonnes')}</div>
          </div>
        </div>
        <button className="primary xl" onClick={() => setOpen(true)}>
          <Icon name="play" /> {t('year.open')}
        </button>
      </section>
      {open && <Stories r={review} s={s} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Full-screen screens, one idea each; tap right (or →) for the next, left (or ←) for the previous, Escape closes. */
function Stories({ r, s, onClose }: { r: YearReview; s: Settings; onClose: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(0);
  const num = (v: number, d = 0) => fmtNum(v, s.language, d);
  const kg = (v: number) => `${fmtNum(loadOut(v, s), s.language, 1)} ${s.loadUnit}`;
  const share = async () => {
    const blob = await drawYearCard({
      year: r.year,
      title: t('year.shareTitle', { year: r.year }),
      stats: [
        { value: num(r.workouts), label: t('year.workouts') },
        { value: num(r.hours), label: t('year.hours') },
        { value: fmtVolume(r.volume, s), label: t('year.tonnes') },
        { value: num(r.sets), label: t('year.sets') },
        { value: num(r.bestStreak), label: t('year.weeks') },
        { value: num(r.records), label: t('year.records') },
      ],
      lines: [
        ...(r.topExercise ? [{ label: t('year.favourite'), value: r.topExercise.name }] : []),
        ...(r.topGain ? [{ label: t('year.gain'), value: `${r.topGain.name} · +${gainPct(r.topGain)}%` }] : []),
        ...(r.topMuscle ? [{ label: t('year.muscles'), value: tr(t, 'muscle', r.topMuscle) }] : []),
      ],
      tone: getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#5b4cf5',
      footer: 'MyGymProgression',
    });
    if (blob) await shareImage(blob, `mygymprogression-${r.year}.png`);
  };

  const slides: { key: string; body: ReactNode }[] = [
    { key: 'intro', body: <><p className="story-kicker">MyGymProgression</p><p className="story-big">{r.year}</p><h2>{t('year.title', { year: r.year })}</h2><p className="story-sub">{t('year.tap')}</p></> },
    {
      key: 'count',
      body: (
        <>
          <p className="story-big"><CountUp value={r.workouts} format={(v) => num(v)} /></p>
          <h2>{t('year.workouts')}</h2>
          <p className="story-mid"><CountUp value={r.hours} format={(v) => num(v)} /> {t('year.hours')}</p>
          <p className="story-mid"><CountUp value={r.sets} format={(v) => num(v)} /> {t('year.sets')}</p>
        </>
      ),
    },
    ...(r.volume > 0
      ? [{ key: 'volume', body: <><h2>{t('year.lifted')}</h2><p className="story-big"><CountUp value={r.volume} format={(v) => fmtVolume(v, s)} /></p>{r.volume >= ELEPHANT_KG / 2 && <p className="story-sub">{t('year.elephants', { count: Math.round(r.volume / ELEPHANT_KG) })}</p>}</> }]
      : []),
    {
      key: 'habits',
      body: (
        <>
          <h2>{t('year.habits')}</h2>
          <p className="story-big"><CountUp value={r.bestStreak} format={(v) => num(v)} /></p>
          <p className="story-mid">{t('year.streak')}</p>
          {r.weekday !== undefined && <p className="story-sub">{t('year.day', { day: weekdayName(r.weekday, s.language) })}</p>}
          {r.hour !== undefined && <p className="story-sub">{t('year.hour', { hour: r.hour })}</p>}
        </>
      ),
    },
    ...(r.topExercise ? [{ key: 'favourite', body: <><h2>{t('year.favourite')}</h2><p className="story-name">{r.topExercise.name}</p><p className="story-mid">{t('year.sessions', { count: r.topExercise.sessions })}</p></> }] : []),
    ...(r.topGain
      ? [{ key: 'gain', body: <><h2>{t('year.gain')}</h2><p className="story-name">{r.topGain.name}</p><p className="story-big">+{gainPct(r.topGain)}%</p><p className="story-mid">{t('year.gainLine', { from: kg(r.topGain.from), to: kg(r.topGain.to) })}</p></> }]
      : []),
    {
      key: 'records',
      body: (
        <>
          <p className="story-big"><CountUp value={r.records} format={(v) => num(v)} /></p>
          <h2>{t('year.records')}</h2>
          {r.medals.length > 0 && (
            <>
              <p className="story-mid">{t('year.medals')}</p>
              <ul className="story-medals">
                {r.medals.map((m) => (
                  <li key={m.id}><Icon name="trophy" /> {achievementName(t, m, s)}</li>
                ))}
              </ul>
            </>
          )}
        </>
      ),
    },
    ...(r.topMuscle
      ? [{ key: 'muscles', body: <><h2>{t('year.muscles')}</h2><p className="story-mid">{t('year.topMuscle', { muscle: tr(t, 'muscle', r.topMuscle) })}</p><BodyMap sets={r.muscles} lang={s.language} small /><p className="story-sub">{t('year.musclesSub')}</p></> }]
      : []),
    {
      key: 'end',
      body: (
        <>
          <p className="story-big">{r.year}</p>
          <h2>{t('year.end')}</h2>
          <p className="story-sub">{t('year.endSub')}</p>
          <button className="primary xl" onClick={() => void share()}>
            <Icon name="share" /> {t('year.share')}
          </button>
        </>
      ),
    },
  ];
  const last = slides.length - 1;
  const go = (d: number) => setI((x) => Math.max(0, Math.min(last, x + d)));

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (e.key === 'ArrowRight' ? go(1) : e.key === 'ArrowLeft' ? go(-1) : undefined);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });
  // A tap on the screen (not on a button or the body map): left third back, the rest forward.
  const tap = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('button, [role="button"]')) return;
    const box = e.currentTarget.getBoundingClientRect();
    go(e.clientX - box.left < box.width / 3 ? -1 : 1);
  };

  return (
    <dialog ref={ref} className="story" aria-label={t('year.title', { year: r.year })} onCancel={(e) => (e.preventDefault(), onClose())}>
      <div className="story-bars" aria-hidden="true">
        {slides.map((x, k) => (
          <span key={x.key} className={k < i ? 'done' : k === i ? 'on' : ''} />
        ))}
      </div>
      <button className="ghost story-close" onClick={onClose} aria-label={t('year.close')}>
        <Icon name="close" />
      </button>
      <div className="story-slide" key={slides[i].key} onClick={tap} role="group" aria-roledescription="slide" aria-label={t('year.slide', { n: i + 1, total: slides.length })}>
        {slides[i].body}
      </div>
      <div className="story-nav">
        <button className="ghost" onClick={() => go(-1)} disabled={i === 0} aria-label={t('year.prev')}>
          <Icon name="chevronLeft" />
        </button>
        <span className="num">{i + 1} / {slides.length}</span>
        <button className="ghost" onClick={() => (i === last ? onClose() : go(1))} aria-label={i === last ? t('year.close') : t('year.next')}>
          <Icon name={i === last ? 'close' : 'chevronRight'} />
        </button>
      </div>
    </dialog>
  );
}
