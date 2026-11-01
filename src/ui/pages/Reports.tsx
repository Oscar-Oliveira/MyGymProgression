import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { weekKey } from '../../domain/challenge';
import { reportOn, rivalOn, rivalRows, rivalWorkout, weekReport } from '../../domain/trainer';
import type { Settings } from '../../domain/types';
import { ReportCard, RivalCard } from '../components/TrainerBits';
import { fmtDate, useSettings } from '../util';
import { Analysis } from './Analysis';

const TABS = ['analysis', 'week', 'rival'] as const;
type Tab = (typeof TABS)[number];

/** A switch of a report, at the top of its tab (D57). */
function ReportSwitch({ k, on }: { k: 'report' | 'rival'; on: boolean }) {
  const { t } = useTranslation();
  return (
    <section className="card">
      <label className="setting-row">
        <span className="lbl">
          {t(`reports.${k}On`)}
          <small>{t(`reports.${k}OnSub`)}</small>
        </span>
        <input type="checkbox" role="switch" className="switch" checked={on} onChange={(e) => void repo.saveSettings({ [k]: e.target.checked })} />
      </label>
    </section>
  );
}

/** This week so far (made here, not stored), then the stored Sunday reports of earlier weeks. */
function WeekTab({ s }: { s: Settings }) {
  const { t } = useTranslation();
  const coach = s.coach?.enabled ? s.coach : undefined;
  const data = useLiveQuery(async () => {
    const now = new Date();
    const week = weekKey(now);
    const [workouts, events, challenge, stored] = await Promise.all([db.workouts.toArray(), db.progressionEvents.toArray(), db.challenges.where('week').equals(week).first(), db.coachReports.orderBy('week').reverse().toArray()]);
    return { current: weekReport(now, workouts, events, challenge, 'now'), earlier: stored.filter((r) => r.week !== week) };
  }, []);
  return (
    <>
      <ReportSwitch k="report" on={reportOn(s)} />
      {data && (
        <>
          <div className="section-head">
            <h2>{t('reports.thisWeek')}</h2>
          </div>
          <ReportCard report={data.current} coach={coach} />
          <div className="section-head">
            <h2>{t('reports.earlier')}</h2>
          </div>
          {data.earlier.length === 0 ? <p className="muted">{t('reports.noReports')}</p> : data.earlier.map((r) => <ReportCard key={r.id} report={r} coach={coach} />)}
        </>
      )}
    </>
  );
}

/** The latest finished workout against its rival of about 3 months before (D49). */
function RivalTab({ s }: { s: Settings }) {
  const { t } = useTranslation();
  const data = useLiveQuery(async () => {
    const finished = (await db.workouts.where('status').notEqual('in_progress').toArray()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const latest = finished[0];
    const rival = latest && rivalWorkout(latest, finished);
    return { latest, rival, rows: latest && rival ? rivalRows(latest, rival) : [] };
  }, []);
  return (
    <>
      <ReportSwitch k="rival" on={rivalOn(s)} />
      {data &&
        (data.latest && data.rival && data.rows.length > 0 ? (
          <>
            <div className="section-head">
              <h2>{t('reports.latest')}</h2>
              <small>{[data.latest.dayName, fmtDate(data.latest.startedAt, s.language)].filter(Boolean).join(' · ')}</small>
            </div>
            <RivalCard rows={data.rows} date={data.rival.startedAt} coach={s.coach?.enabled ? s.coach : undefined} />
          </>
        ) : (
          <p className="muted">{t('reports.noRival')}</p>
        ))}
    </>
  );
}

/** Reports (D57): Analysis, the week report and "you vs 3 months ago", one tab each. The tab is kept in the URL. */
export function Reports() {
  const { t } = useTranslation();
  const s = useSettings();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((x) => x === params.get('tab')) ?? 'analysis';
  return (
    <div>
      <div className="page-head">
        <h1>{t('reports.title')}</h1>
      </div>
      <div className="report-tabs" role="tablist" aria-label={t('reports.title')}>
        {TABS.map((x) => (
          <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? 'on' : ''} onClick={() => setParams(x === 'analysis' ? {} : { tab: x }, { replace: true })}>
            {t(`reports.tabs.${x}`)}
          </button>
        ))}
      </div>
      {tab === 'analysis' && <Analysis />}
      {tab === 'week' && <WeekTab s={s} />}
      {tab === 'rival' && <RivalTab s={s} />}
    </div>
  );
}
