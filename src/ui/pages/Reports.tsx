import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../data/db';
import { weekKey } from '../../domain/challenge';
import { rivalRows, rivalWorkout, weekReport } from '../../domain/trainer';
import type { Settings } from '../../domain/types';
import { Empty, PageHead, Pager, usePage } from '../components/Bits';
import { ReportCard, RivalCard } from '../components/TrainerBits';
import { fmtDate, useSettings } from '../util';
import { Analysis } from './Analysis';
import { YearTab } from './YearReview';

const TABS = ['analysis', 'week', 'rival', 'year'] as const;
type Tab = (typeof TABS)[number];

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

/** Reports (D57, D74): Analysis, the week report, "you vs 3 months ago" and the year in review, one tab each. The tab is kept in the URL. */
export function Reports() {
  const { t } = useTranslation();
  const s = useSettings();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((x) => x === params.get('tab')) ?? 'analysis';
  return (
    <div>
      <PageHead title={t('reports.title')} />
      <div className="seg" role="tablist" style={{ marginBottom: '1rem' }} aria-label={t('reports.title')}>
        {TABS.map((x) => (
          <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? 'on' : ''} onClick={() => setParams(x === 'analysis' ? {} : { tab: x }, { replace: true })}>
            {t(`reports.tabs.${x}`)}
          </button>
        ))}
      </div>
      {tab === 'analysis' && <Analysis />}
      {tab === 'week' && <WeekTab s={s} />}
      {tab === 'rival' && <RivalTab s={s} />}
      {tab === 'year' && <YearTab />}
    </div>
  );
}
