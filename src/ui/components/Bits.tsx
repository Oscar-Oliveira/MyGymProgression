import { useTranslation } from 'react-i18next';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Evaluation, MetricDef, Outcome } from '../../domain/types';
import { reasonText } from '../util';

const TONE: Record<Outcome, string> = {
  increase_recommended: 'good',
  progress: 'good',
  completed_as_prescribed: 'ok',
  no_progression: 'neutral',
  manual: 'neutral',
  below_target: 'warn',
  incomplete: 'warn',
  restricted: 'warn',
};

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const { t } = useTranslation();
  return <span className={`badge ${TONE[outcome]}`}>{t(`outcome.${outcome}`)}</span>;
}

export function EvaluationView({ ev, metrics }: { ev: Evaluation; metrics?: MetricDef[] }) {
  const { t } = useTranslation();
  return (
    <div className="eval">
      <OutcomeBadge outcome={ev.outcome} />
      {ev.strategy === 'none' && <span className="badge neutral">{t(`completion.${ev.completion}`)}</span>}
      {ev.reasons.length > 0 && (
        <ul className="reasons">
          {ev.reasons.map((r, i) => (
            <li key={i}>{reasonText(t, r, metrics)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export interface Point {
  date: string;
  value: number | undefined;
}

/** Simple line chart. `kind` labels whether values are actual, derived or estimated. */
export function TrendChart({ title, data, unit, kind, format }: { title: string; data: Point[]; unit?: string; kind: 'actual' | 'derived' | 'estimated'; format?: (v: number) => string }) {
  const { t } = useTranslation();
  const pts = data.filter((d) => d.value !== undefined);
  if (pts.length === 0) return null;
  return (
    <figure className="chart">
      <figcaption>
        {title} {unit && <small>({unit})</small>} <span className={`tag ${kind}`}>{t(`common.${kind}`)}</span>
      </figcaption>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={pts} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} domain={['auto', 'auto']} tickFormatter={format} />
          <Tooltip formatter={(v) => (format ? format(Number(v)) : String(v))} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
          <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} strokeDasharray={kind === 'estimated' ? '5 4' : undefined} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}
