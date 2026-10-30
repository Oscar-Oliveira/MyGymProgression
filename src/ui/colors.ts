// Plan and day colours (palette values in styles.css).
import { useLiveQuery } from 'dexie-react-hooks';
import type { CSSProperties } from 'react';
import { db } from '../data/db';
import type { ColorKey, Plan, PlanDay } from '../domain/types';

/** The day colour, else the plan colour. */
export const toneOf = (plan?: Pick<Plan, 'color'>, day?: Pick<PlanDay, 'color'>): ColorKey | undefined => day?.color ?? plan?.color;

/** Inline style that sets the tone; use with className "toned". */
export const toneStyle = (key?: ColorKey): CSSProperties | undefined => (key ? ({ '--tone': `var(--c-${key})` } as CSSProperties) : undefined);

/** Current colour of a plan day, for records that keep plan and day ids (workouts). */
export function useTones(): (planId?: string, dayId?: string) => ColorKey | undefined {
  const map = useLiveQuery(async () => {
    const m = new Map<string, ColorKey | undefined>();
    for (const p of await db.plans.toArray()) {
      m.set(p.id, p.color);
      const v = await db.planVersions.get(p.currentVersionId);
      for (const d of v?.days ?? []) m.set(`${p.id}:${d.id}`, toneOf(p, d));
    }
    return m;
  }, []);
  return (planId, dayId) => (planId ? (map?.get(`${planId}:${dayId}`) ?? map?.get(planId)) : undefined);
}
