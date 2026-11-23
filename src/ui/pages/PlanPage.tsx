import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { nextDay, startWorkout } from '../../domain/workout';
import { ActionMenu } from '../components/ActionMenu';
import { Empty, HeadAction, PageHead } from '../components/Bits';
import { ViewTabs } from '../components/Controls';
import { DayCard } from '../components/DayCard';
import { PlanAuditCard } from '../components/PlanAuditCard';
import { shareDayImage } from '../dayImage';
import { usePlanActions, usePlanData } from '../planActions';
import { useStart } from '../start';
import { useSettings } from '../util';

/** The page of one plan (V2-D24): one tab per day (the next day first open), its exercises and Start, the plan balance, Edit and ⋯. */
export function PlanPage() {
  const { t } = useTranslation();
  const s = useSettings();
  const nav = useNavigate();
  const start = useStart();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const data = usePlanData();
  const { menu, sheets, copyText, ctx } = usePlanActions(data, () => nav('/train', { replace: true }));
  if (!data || !ctx) return null;
  const plan = data.plans.find((p) => p.id === id);
  if (!plan) return <Navigate to="/train" replace />;
  const v = data.versions.find((x) => x.id === plan.currentVersionId);
  const next = v && plan.status === 'active' ? nextDay(v, data.workouts) : undefined;
  const day = v?.days.find((d) => d.id === params.get('day')) ?? next ?? v?.days[0];

  return (
    <div>
      <PageHead
        title={plan.name}
        sub={[t(`goal.${plan.goal}`), plan.status === 'archived' ? t('plan.archived') : undefined].filter(Boolean).join(' · ')}
        actions={
          <>
            <HeadAction icon="edit" label={t('common.edit')} to={`/plans/${plan.id}`} />
            {menu(plan)}
          </>
        }
      />
      {!v || !day ? (
        <Empty
          action={
            <button className="btn primary" onClick={() => nav(`/plans/${plan.id}`)}>
              {t('common.edit')}
            </button>
          }
        >
          {t('plan.noDays')}
        </Empty>
      ) : (
        <>
          {v.days.length > 1 && (
            <ViewTabs
              label={t('plan.days')}
              active={day.id}
              onPick={(k) => setParams({ day: k }, { replace: true })}
              items={v.days.map((d) => ({ key: d.id, label: d.name }))}
            />
          )}
          <DayCard
            plan={plan}
            day={day}
            entries={startWorkout(plan, v, day, ctx).entries}
            exercises={data.exercises}
            next={day.id === next?.id}
            onStart={() => void start(plan.id, day.id)}
            menu={
              <ActionMenu
                title={day.name}
                actions={[
                  { label: t('home.start'), icon: 'play', onClick: () => void start(plan.id, day.id) },
                  { label: t('menu.editDay'), icon: 'edit', onClick: () => nav(`/plans/${plan.id}`) },
                  { label: t('share.image'), icon: 'image', sub: t('menu.imageSub'), onClick: () => void shareDayImage(plan, day, startWorkout(plan, v, day, ctx).entries, t, s.language) },
                  { label: t('plan.copyText'), icon: 'note', sub: t('menu.copyTextSub'), onClick: () => void copyText([plan], { ...v, days: [day] }) },
                ]}
              />
            }
          />
          {v.days.some((d) => d.items.length > 0) && <PlanAuditCard id={`plan-audit:${plan.id}`} days={v.days} exercises={data.exercises} />}
        </>
      )}
      {sheets}
    </div>
  );
}
