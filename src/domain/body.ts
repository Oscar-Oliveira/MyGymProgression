// Body (V2-D6): weigh-ins, measurements and progress photos. Pure figures for the Body page.
import type { BodyWeight, Measurement, MeasurePart } from './types';

const DAY = 86_400_000;
const time = (date: string) => Date.parse(`${date}T12:00:00Z`);

/** Weigh-ins oldest first; one per day (the latest of the day). */
export function weightSeries(weights: BodyWeight[]): BodyWeight[] {
  const byDay = new Map<string, BodyWeight>();
  for (const w of [...weights].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) byDay.set(w.date, w);
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Change of the latest weigh-in against the one nearest to `days` before it (undefined without an older one). */
export function weightChange(series: BodyWeight[], days = 30): number | undefined {
  const last = series.at(-1);
  if (!last || series.length < 2) return undefined;
  const target = time(last.date) - days * DAY;
  const older = series.slice(0, -1).reduce((best, w) => (Math.abs(time(w.date) - target) < Math.abs(time(best.date) - target) ? w : best));
  return Math.round((last.kg - older.kg) * 10) / 10;
}

/** Weekly rate (kg per week) of the last 28 days: least-squares line; needs 3 weigh-ins over at least 7 days. */
export function weeklyRate(series: BodyWeight[]): number | undefined {
  const last = series.at(-1);
  if (!last) return undefined;
  const recent = series.filter((w) => time(last.date) - time(w.date) <= 28 * DAY);
  if (recent.length < 3 || time(last.date) - time(recent[0].date) < 7 * DAY) return undefined;
  const xs = recent.map((w) => (time(w.date) - time(recent[0].date)) / DAY);
  const ys = recent.map((w) => w.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return Math.round(slope * 7 * 100) / 100;
}

/** The latest value of each measured part, with the change from the one before. */
export function latestMeasurements(list: Measurement[]): { part: MeasurePart; value: number; date: string; change?: number }[] {
  const byPart = new Map<MeasurePart, Measurement[]>();
  for (const m of [...list].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))) byPart.set(m.part, [...(byPart.get(m.part) ?? []), m]);
  return [...byPart.entries()].map(([part, ms]) => {
    const last = ms[ms.length - 1];
    const prev = ms[ms.length - 2];
    return { part, value: last.value, date: last.date, ...(prev ? { change: Math.round((last.value - prev.value) * 10) / 10 } : {}) };
  });
}
