import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { db } from '../../data/db';
import { repo } from '../../data/repo';
import { weekKey } from '../../domain/challenge';
import { reportOn, rivalOn, rivalRows, rivalWorkout, weekReport } from '../../domain/trainer';
import type { Settings } from '../../domain/types';
import { Empty, PageHead, Pager, ProgressSwitch, usePage } from '../components/Bits';
import { Icon, type IconName } from '../components/Icon';
import { ReportCard, RivalCard } from '../components/TrainerBits';
import { fmtDate, useSettings } from '../util';
import { Analysis } from './Analysis';
import { YearTab } from './YearReview';

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
  const earlier = usePage(data?.earlier ?? []);
  return (
    <>
      {data && (
        <>
          <div className="section-head">
            <h2>{t('reports.thisWeek')}</h2>
          </div>
          <ReportCard report={data.current} coach={coach} />
          <section>
            <div className="section-head">
              <h2>{t('reports.earlier')}</h2>
            </div>
            {data.earlier.length === 0 ? <Empty>{t('reports.noReports')}</Empty> : earlier.items.map((r) => <ReportCard key={r.id} report={r} coach={coach} />)}
            <Pager page={earlier.page} pages={earlier.pages} label={t('reports.earlier')} />
          </section>
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
          <Empty>{t('reports.noRival')}</Empty>
        ))}
    </>
  );
}

const REPORTS = ['week', 'rival', 'year'] as const;
type Report = (typeof REPORTS)[number];
const REPORT_ICON: Record<Report, IconName> = { week: 'calendar', rival: 'swords', year: 'trophy' };
/** The reports whose feature is on (D78). */
const reportsOn = (s: Settings) => REPORTS.filter((x) => (x === 'week' ? reportOn(s) : x === 'rival' ? rivalOn(s) : true));

/** Progress → Summary (V2-D23): the analysis, and the other reports as links to their own pages. */
export function Reports() {
  const { t } = useTranslation();
  const s = useSettings();
  return (
    <div>
      <PageHead title={t('nav.progress')} more />
      <ProgressSwitch on="reports" />
      <Analysis
        after={
          <section className="card reports-card" aria-labelledby="reports-h">
            <h2 id="reports-h">{t('reports.title')}</h2>
            {reportsOn(s).map((x) => (
              <Link key={x} to={`/reports/${x}`} className="nav-row">
                <span className="nav-ico" aria-hidden="true">
                  <Icon name={REPORT_ICON[x]} />
                </span>
                <span className="main">
                  <span className="title">{t(`reports.tabs.${x}`)}</span>
                  <span className="meta">{t(`reports.sub.${x}`)}</span>
                </span>
                <span className="chev" aria-hidden="true">
                  <Icon name="chevronRight" />
                </span>
              </Link>
            ))}
          </section>
        }
      />
    </div>
  );
}

/** One report on its own page (V2-D23): the week, "you vs 3 months ago" or the year in review. */
export function ReportPage() {
  const { t } = useTranslation();
  // The stored settings, not the defaults shown while they load: a report that is on must not send the page away.
  const s = useLiveQuery(() => repo.getSettings(), []);
  const { report } = useParams();
  if (!s) return null;
  const x = reportsOn(s).find((r) => r === report);
  if (!x) return <Navigate to="/reports" replace />;
  return (
    <div>
      <PageHead title={t(`reports.tabs.${x}`)} />
      {x === 'week' && <WeekTab s={s} />}
      {x === 'rival' && <RivalTab s={s} />}
      {x === 'year' && <YearTab />}
    </div>
  );
}
