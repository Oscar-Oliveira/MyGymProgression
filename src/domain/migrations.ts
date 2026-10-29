// Record-level migrations. Used by the IndexedDB upgrade (src/data/db.ts) and by JSON import (interchange.ts).
type Obj = Record<string, unknown>;

const OUTCOME_V1: Record<string, string> = {
  completed_as_prescribed: 'keep',
  increase_recommended: 'increase',
  below_target: 'missed',
};
const DECISION_V1: Record<string, string> = { accepted: 'applied', deferred: 'kept', pending: 'kept' };

/** v1 → v2: RIR/RPE removed; "recommendation" renamed "suggestion"; new outcome and decision names. */
export const v1to2 = {
  prescription(p: Obj): Obj {
    const { rir: _r, rpe: _p, ...rest } = p;
    return rest;
  },
  criteria(c: Obj | undefined): Obj | undefined {
    if (!c) return c;
    const { useRir: _u, ...rest } = c;
    return rest;
  },
  progression(cfg: Obj | undefined): Obj | undefined {
    return cfg ? { ...cfg, criteria: v1to2.criteria(cfg.criteria as Obj) } : cfg;
  },
  suggestion(rec: Obj | undefined): Obj | undefined {
    if (!rec) return undefined;
    return { ...rec, kind: (rec.to as number) >= (rec.from as number) ? 'increase' : 'decrease' };
  },
  evaluation(ev: Obj | undefined): Obj | undefined {
    if (!ev) return ev;
    const { recommendation, ...rest } = ev;
    const out: Obj = { ...rest, outcome: OUTCOME_V1[ev.outcome as string] ?? ev.outcome };
    const s = v1to2.suggestion(recommendation as Obj | undefined);
    if (s) out.suggestion = s;
    return out;
  },
  exercise(e: Obj): Obj {
    return { ...e, defaultSets: (e.defaultSets as Obj[]).map(v1to2.prescription), progression: v1to2.progression(e.progression as Obj) };
  },
  planVersion(v: Obj): Obj {
    return {
      ...v,
      days: (v.days as Obj[]).map((d) => ({
        ...d,
        items: (d.items as Obj[]).map((i) => ({ ...i, sets: (i.sets as Obj[]).map(v1to2.prescription), ...(i.progression ? { progression: v1to2.progression(i.progression as Obj) } : {}) })),
      })),
    };
  },
  workout(w: Obj): Obj {
    return {
      ...w,
      entries: (w.entries as Obj[]).map((e) => {
        const out: Obj = {
          ...e,
          prescription: (e.prescription as Obj[]).map(v1to2.prescription),
          progression: v1to2.progression(e.progression as Obj),
          sets: (e.sets as Obj[]).map(v1to2.prescription),
        };
        if (e.evaluation) out.evaluation = v1to2.evaluation(e.evaluation as Obj);
        return out;
      }),
    };
  },
  event(ev: Obj): Obj {
    const { recommendation, ...rest } = ev;
    const out: Obj = { ...rest, outcome: OUTCOME_V1[ev.outcome as string] ?? ev.outcome, decision: DECISION_V1[ev.decision as string] ?? ev.decision };
    const s = v1to2.suggestion(recommendation as Obj | undefined);
    if (s) out.suggestion = s;
    return out;
  },
  revision(r: Obj): Obj {
    return { ...r, previous: v1to2.workout(r.previous as Obj) };
  },
  bundle(b: Obj): Obj {
    const d = (b.data ?? {}) as Record<string, Obj[] | undefined>;
    const map = (k: string, f: (x: Obj) => Obj) => (d[k] ? d[k]!.map(f) : d[k]);
    return {
      ...b,
      schemaVersion: 2,
      data: {
        ...d,
        exercises: map('exercises', v1to2.exercise),
        planVersions: map('planVersions', v1to2.planVersion),
        workouts: map('workouts', v1to2.workout),
        progressionEvents: map('progressionEvents', v1to2.event),
        revisions: map('revisions', v1to2.revision),
      },
    };
  },
};
