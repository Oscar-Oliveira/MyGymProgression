import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { repo } from '../../data/repo';
import { newPlan } from '../../domain/factory';
import type { Plan } from '../../domain/types';
import { nextDay, nextPlanned } from '../../domain/workout';
import { Empty, HeadAction, PageHead } from '../components/Bits';
import { ViewTabs } from '../components/Controls';
import { Icon } from '../components/Icon';
import { toneStyle } from '../colors';
import { usePlanActions, usePlanData, type PlanData } from '../planActions';
import { useStart } from '../start';
import { fmtDate, useSettings } from '../util';

/**
 * Plan tab (V2-D24): one card per plan, active or archived. A card shows the days, the next day and the last workout,
 * and starts the next day; tapping it opens the page of the plan.
 */
export function Train() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const start = useStart();
  const [params, setParams] = useSearchParams();
  const data = usePlanData();
  const { menu, sheets, copyText } = usePlanActions(data);
  const [creating, setCreating] = useState(false);
  if (!data) return null;
  const active = data.plans.filter((p) => p.status === 'active');
  const old = data.plans.filter((p) => p.status === 'archived');
  const tab = params.get('tab') === 'archived' && old.length ? 'archived' : 'active';
  const shown = tab === 'active' ? active : old;
  // The plan of the next workout gets the main button.
  const next = nextPlanned(active, data.versions, data.workouts);

  const create = async () => {
    setCreating(true);
    const { plan, version } = newPlan(t('plan.new'));
    await repo.createPlan(plan, version);
    nav(`/plans/${plan.id}`);
  };

  return (
    <div>
      <PageHead
        title={t('plan.title')}
        more
        count={active.length > 0 ? t('plan.count', { count: active.length }) : undefined}
        actions={
          <>
            {/* Copy as text and Read QR (a plan shared by QR, D60) are header icons. */}
            {active.length > 1 && <HeadAction icon="note" label={t('plan.copyAll')} onClick={() => void copyText(active)} />}
            <HeadAction icon="qr" label={t('scan.open')} to="/plans/scan" />
            <HeadAction icon="plus" label={t('plan.new')} onClick={() => !creating && void create()} primary />
          </>
        }
      />
      {old.length > 0 && (
        <ViewTabs
          label={t('plan.title')}
          active={tab}
          onPick={(k) => setParams(k === 'archived' ? { tab: 'archived' } : {}, { replace: true })}
          items={[
            { key: 'active', label: t('plan.activeTab'), count: active.length },
            { key: 'archived', label: t('plan.archivedTab'), count: old.length },
          ]}
        />
      )}
      {shown.length === 0 && (
        <Empty
          action={
            <button className="btn primary" onClick={() => void create()}>
              {t('home.createPlan')}
            </button>
          }
        >
          {t('train.noPlans')}
        </Empty>
      )}
      <div className="plan-cards">
        {shown.map((p) => (
          <PlanCard key={p.id} plan={p} data={data} menu={menu(p)} main={next?.plan.id === p.id} onStart={(dayId) => void start(p.id, dayId)} />
        ))}
      </div>
      {tab === 'active' && (
        <>
          <button className="ghost xl" onClick={() => void start()}>
            <Icon name="plus" /> {t('workout.free')}
          </button>
        </>
      )}
      {sheets}
    </div>
  );
}

/** One plan in the list: colour, name, goal, days, next day, last workout; Start for an active plan. */
function PlanCard({ plan, data, menu, main, onStart }: { plan: Plan; data: PlanData; menu: React.ReactNode; main: boolean; onStart: (dayId: string) => void }) {
  const { t } = useTranslation();
  const s = useSettings();
  const v = data.versions.find((x) => x.id === plan.currentVersionId);
  const day = v && plan.status === 'active' ? nextDay(v, data.workouts) : undefined;
  const last = data.workouts.filter((w) => w.planId === plan.id && w.status !== 'in_progress').sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const weekdays = t('weekday', { returnObjects: true }) as string[];
  return (
    <article className="card plan-card toned tone-bar" style={toneStyle(plan.color)} aria-labelledby={`plan-${plan.id}`}>
      <div className="plan-card-head">
        <Link to={`/train/${plan.id}`} className="plan-card-main">
          <h2 id={`plan-${plan.id}`}>{plan.name}</h2>
          <span className="meta">
            <span className="pill">{t(`goal.${plan.goal}`)}</span>
            {t('plan.daysN', { count: v?.days.length ?? 0 })}
          </span>
        </Link>
        {menu}
      </div>
      {v && v.days.length > 0 && <p className="plan-days">{v.days.map((d) => (d.weekday !== undefined ? `${d.name} (${weekdays[d.weekday]})` : d.name)).join(' · ')}</p>}
      <p className="help plan-last">{last ? t('plan.lastWorkout', { date: fmtDate(last.startedAt, s.language) }) : t('plan.notTrained')}</p>
      {day && day.items.length > 0 && (
        <button type="button" className={`${main ? 'primary' : 'outline'} xl`} onClick={() => onStart(day.id)}>
          <Icon name="play" /> {t('plan.startNamed', { day: day.name })}
        </button>
      )}
    </article>
  );
}
