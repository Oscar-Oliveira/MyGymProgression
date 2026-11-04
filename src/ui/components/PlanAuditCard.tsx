import { useTranslation } from 'react-i18next';
import { MUSCLE_SETS_GUIDE } from '../../domain/analysis';
import { AUDIT_RATIO_MAX, planAudit } from '../../domain/audit';
import type { Exercise, PlanDay } from '../../domain/types';
import { fmtNum, tr, useSettings } from '../util';
import { BodyMap } from './BodyMap';
import { Icon } from './Icon';
import { Section } from './Section';

/** Plan balance (D72): planned sets per muscle on the body map and the warnings, updated while the plan is edited. */
export function PlanAuditCard({ id = 'plan-audit', days, exercises }: { id?: string; days: PlanDay[]; exercises: Map<string, Exercise> }) {
  const { t } = useTranslation();
  const s = useSettings();
  const { sets, warnings } = planAudit(days, exercises);
  const num = (v: number) => fmtNum(v, s.language, 1);
  const title = (
    <>
      {t('audit.title')} {warnings.length > 0 && <span className="pill warn">{t('audit.count', { count: warnings.length })}</span>}
    </>
  );
  return (
    <Section id={id} title={title} defaultOpen={false}>
      <p className="help">{t('audit.help')}</p>
      <BodyMap sets={sets} lang={s.language} small />
      {warnings.length === 0 ? (
        <p className="up-text">{t('audit.ok')}</p>
      ) : (
        <ul className="audit-list">
          {warnings.map((w) => (
            <li key={w.kind}>
              <Icon name="warning" />
              <span>
                {'muscles' in w
                  ? t(`audit.${w.kind}`, { ...MUSCLE_SETS_GUIDE, list: w.muscles.map((m) => tr(t, 'muscle', m)).join(', ') })
                  : t(`audit.${w.kind}`, { a: num(w.a), b: num(w.b), ratio: num(AUDIT_RATIO_MAX) })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="help">{t('audit.formula')}</p>
    </Section>
  );
}
