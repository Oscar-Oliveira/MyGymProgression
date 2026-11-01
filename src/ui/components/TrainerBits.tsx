// Personal trainer cards beyond messages: the week report (D46) and the rival (D49).
import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CoachReport, CoachSettings } from '../../domain/types';
import type { RivalRow } from '../../domain/trainer';
import { fmtDate, fmtNum, fmtSeconds, distOut, loadOut, tr, useSettings } from '../util';
import { CoachAvatar } from './CoachAvatar';
import { speak } from '../voice';
import { repo } from '../../data/repo';

/** Reads `text` aloud once when it shows, and again when it changes (D47). Renders nothing. */
export function Speak({ text }: { text?: string }) {
  const s = useSettings();
  useEffect(() => {
    if (text) speak(text, s.language);
  }, [text, s.language]);
  return null;
}

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** One message of a list of the style (the same for a seed). */
export function trainerLine(t: TFunction, key: string, coach: Pick<CoachSettings, 'style'>, seed: string, params: Record<string, string | number> = {}): string {
  const list = t(`trainer.${key}.${coach.style}`, { returnObjects: true, ...params }) as string[] | string;
  return Array.isArray(list) ? (list[hash(seed) % list.length] ?? '') : list;
}

/** great: 2 or more workouts and 2 or more increases (its message counts both). ok: some workouts. none: no workouts. */
export const reportMood = (r: CoachReport) => (r.workouts >= 2 && r.ups >= 2 ? 'great' : r.workouts > 0 ? 'ok' : 'none');

/** The trainer's week report: figures and a comment in the trainer's style. */
export function ReportCard({ report, coach, onClose }: { report: CoachReport; coach: CoachSettings; onClose?: () => void }) {
  const { t } = useTranslation();
  const s = useSettings();
  const load = (kg: number) => `${fmtNum(loadOut(kg, s), s.language)} ${s.loadUnit}`;
  const rows: [string, string][] = [
    [t('trainer.report.workouts'), String(report.workouts)],
    [t('trainer.report.sets'), String(report.sets)],
    [t('trainer.report.ups'), String(report.ups)],
  ];
  return (
    <section className="card report" aria-label={t('trainer.report.title')}>
      <div className="challenge-head">
        <CoachAvatar style={coach.style} gender={coach.gender} size={40} />
        <div style={{ flex: 1 }}>
          <p className="eyebrow">{t('trainer.report.title')}</p>
          <p className="help">{t('trainer.report.weekOf', { date: fmtDate(`${report.week}T12:00:00`, s.language) })}</p>
        </div>
        {onClose && (
          <button className="ghost sm" aria-label={t('common.close')} onClick={onClose}>
            ✕
          </button>
        )}
      </div>
      <p className="report-say">{t(`trainer.reportSay.${coach.style}.${reportMood(report)}`, { workouts: report.workouts, ups: report.ups })}</p>
      <div className="grid3">
        {rows.map(([label, value]) => (
          <div key={label} className="stat">
            <div className="value">{value}</div>
            <div className="label">{label}</div>
          </div>
        ))}
      </div>
      <ul className="report-list">
        {report.best && (
          <li>
            <span>{t('trainer.report.best')}</span>
            <strong>
              {report.best.exerciseName} · {load(report.best.load)}
              {report.best.reps !== undefined && ` × ${report.best.reps}`}
            </strong>
          </li>
        )}
        {report.weak && (
          <li>
            <span>{t('trainer.report.weak')}</span>
            <strong>{tr(t, 'muscle', report.weak)}</strong>
          </li>
        )}
        {report.challenge && (
          <li>
            <span>{t('trainer.report.challenge')}</span>
            <strong>{t(`trainer.report.challengeStatus.${report.challenge}`)}</strong>
          </li>
        )}
      </ul>
    </section>
  );
}

/** "You vs 3 months ago" on the workout summary: one row per exercise and a comment. */
export function RivalCard({ rows, date, coach }: { rows: RivalRow[]; date: string; coach: CoachSettings }) {
  const { t } = useTranslation();
  const s = useSettings();
  const count = (r: RivalRow['result']) => rows.filter((x) => x.result === r).length;
  const [won, lost, tie] = [count('won'), count('lost'), count('tie')];
  const mood = won > lost ? 'won' : lost > won ? 'lost' : 'tie';
  const value = (r: RivalRow, v: number) =>
    r.metric === 'topLoad'
      ? `${fmtNum(loadOut(v, s), s.language)} ${s.loadUnit}`
      : r.metric === 'maxDuration'
        ? fmtSeconds(v)
        : r.metric === 'totalDistance'
          ? `${fmtNum(distOut(v, s), s.language)} ${s.distanceUnit}`
          : fmtNum(v, s.language);
  const icon = { won: '⬆', lost: '⬇', tie: '＝' } as const;
  return (
    <section className="card" aria-label={t('trainer.rival.title')}>
      <h2 style={{ marginTop: 0 }}>⚔ {t('trainer.rival.title')}</h2>
      <p className="help">
        {t('trainer.rival.vs', { date: fmtDate(date, s.language) })} · {t('trainer.rival.score', { won, lost, tie })}
      </p>
      <div className="coach" role="note" aria-label={t('coach.title')}>
        <CoachAvatar style={coach.style} gender={coach.gender} />
        <p>{t(`trainer.rivalSay.${coach.style}.${mood}`)}</p>
      </div>
      <ul className="report-list">
        {rows.map((r) => (
          <li key={r.exerciseId}>
            <span>
              {r.name}
              <small> · {t(`trainer.rival.metric.${r.metric}`)}</small>
            </span>
            <strong className={`num rival-${r.result}`} title={t(`trainer.rival.result.${r.result}`)}>
              {value(r, r.then)} → {value(r, r.now)} {icon[r.result]}
            </strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Sunday report on Home (D46): made or refreshed when Home opens on a Sunday; closed until the next week. */
export function HomeReport() {
  const s = useSettings();
  const coach = s.coach;
  const on = !!(coach?.enabled && coach.report);
  const [report, setReport] = useState<CoachReport>();
  const [closed, setClosed] = useState<string>(() => {
    try {
      return localStorage.getItem('coach:report') ?? '';
    } catch {
      return '';
    }
  });
  useEffect(() => {
    if (on) void repo.ensureReport().then(setReport);
  }, [on]);
  if (!on || !coach || !report || closed === report.week) return null;
  const close = () => {
    setClosed(report.week);
    try {
      localStorage.setItem('coach:report', report.week);
    } catch {
      // Without storage the report only hides for this visit.
    }
  };
  return <ReportCard report={report} coach={coach} onClose={close} />;
}
