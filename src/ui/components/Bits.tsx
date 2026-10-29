import { useTranslation } from 'react-i18next';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Outcome } from '../../domain/types';

const TONE: Record<Outcome, string> = {
  increase: 'up',
  ready: 'up',
  progress: 'up',
  keep: '',
  at_cap: '',
  no_progression: '',
  manual: '',
  missed: 'warn',
  incomplete: 'warn',
  restricted: 'warn',
};

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const { t } = useTranslation();
  return <span className={`badge ${TONE[outcome]}`}>{t(`outcome.${outcome}`)}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

interface Point {
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
          <Line type="linear" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} strokeDasharray={kind === 'estimated' ? '5 4' : undefined} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}
