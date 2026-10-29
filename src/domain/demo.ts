// Deterministic demo data: a 2-day plan and ~6 weeks of simulated workouts, built with the real domain functions.
import { newDay, newPlan, newPlanItem } from './factory';
import { emptyDataSet, type DataSet } from './interchange';
import type { Exercise, PlanItem, ProgressionState, Workout, WorkoutEntry } from './types';
import { decide, finishWorkout, lastEntryFinder, startWorkout } from './workout';

const byEn = (list: Exercise[], en: string) => list.find((e) => e.name === en || e.aliases.includes(en));

function simulate(entry: WorkoutEntry, session: number, sinceChange: number): WorkoutEntry {
  const working = entry.prescription.filter((p) => p.kind === 'working');
  let wi = 0;
  const sets = entry.sets.map((s) => {
    if (s.kind !== 'working') return { ...s, status: 'done' as const };
    const p = working[wi];
    const i = wi++;
    const v = { ...s.values };
    if (entry.progression.strategy === 'double' && p.targets.reps) {
      const { min = 8, max = 12 } = p.targets.reps;
      v.reps = Math.min(max, min + 1 + sinceChange - Math.floor(i / 2));
    } else if (entry.progression.strategy === 'duration' && p.targets.duration?.value !== undefined) {
      const target = p.targets.duration.value;
      v.duration = entry.exercise.metrics.find((m) => m.key === 'duration')?.unit === 's' && sinceChange % 2 === 0 && i === 2 ? target - 5 : target;
      if (v.distance === undefined && v.speed) v.distance = Math.round(((v.speed * v.duration) / 60) * 100) / 100;
    } else if (p.targets.duration?.value !== undefined) {
      // Fixed warm-up: completed as prescribed, cut short once.
      v.duration = session === 5 ? p.targets.duration.value - 1 : p.targets.duration.value;
      v.speed ??= 5.5;
      v.incline ??= 1;
    }
    return { ...s, values: v, rir: entry.progression.strategy === 'double' ? 2 : undefined, status: 'done' as const };
  });
  return { ...entry, sets };
}

export function generateDemo(exercises: Exercise[], weeks = 6, now = new Date()): DataSet {
  const pick = (en: string) => byEn(exercises, en);
  const { plan, version } = newPlan('Demo Upper / Lower');
  plan.description = 'Demo data';
  const a = newDay('A · Upper');
  const b = newDay('B · Lower');
  a.weekday = 0;
  b.weekday = 3;
  const add = (day: typeof a, en: string, load?: number, patch: Partial<PlanItem> = {}) => {
    const ex = pick(en);
    if (!ex) return;
    const item = { ...newPlanItem(ex), ...patch };
    if (load !== undefined) for (const s of item.sets) if (s.targets.load) s.targets.load = { value: load };
    day.items.push(item);
  };
  add(a, 'Treadmill Warm-up', undefined, { role: 'warmup' });
  add(a, 'Machine Chest Press', 40);
  add(a, 'Lat Pulldown', 45);
  add(a, 'Plank');
  add(b, 'Treadmill Warm-up', undefined, { role: 'warmup' });
  add(b, 'Barbell Back Squat', 60);
  add(b, 'Romanian Deadlift', 50);
  add(b, 'Treadmill Walking');
  version.days = [a, b];
  version.locked = true;

  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const states = new Map<string, ProgressionState>();
  const since = new Map<string, number>();
  const workouts: Workout[] = [];
  const events: DataSet['progressionEvents'] = [];
  const start = new Date(now.getTime() - weeks * 7 * 86400000);
  let session = 0;
  for (let wk = 0; wk < weeks; wk++) {
    for (const [day, offset] of [[a, 0], [b, 3]] as const) {
      const date = new Date(start.getTime() + (wk * 7 + offset) * 86400000);
      date.setHours(18, 0, 0, 0);
      const last = lastEntryFinder(workouts);
      let w = startWorkout(plan, version, day, { exercises: exMap, states, lastEntry: last });
      w = { ...w, startedAt: date.toISOString(), entries: w.entries.map((e) => simulate(e, session, since.get(e.lineageId!) ?? 0)) };
      if (session === 7) w.entries[2] = { ...w.entries[2], pain: true };
      if (session === 9) w.entries[2].sets[2] = { ...w.entries[2].sets[2], status: 'skipped' };
      const res = finishWorkout(w, false, last, states);
      const end = new Date(date.getTime() + 65 * 60000).toISOString();
      const workout = { ...res.workout, endedAt: end, updatedAt: end };
      workouts.push(workout);
      for (const ev of res.events) {
        since.set(ev.lineageId, (since.get(ev.lineageId) ?? 0) + 1);
        if (ev.decision !== 'pending') {
          events.push({ ...ev, createdAt: end });
          continue;
        }
        const d = decide({ ...ev, createdAt: end }, states.get(ev.lineageId), session === 10 ? { kind: 'defer' } : { kind: 'accept' });
        events.push({ ...d.event, decidedAt: end });
        if (d.event.decision === 'accepted') {
          states.set(d.state.lineageId, d.state);
          since.set(ev.lineageId, 0);
        }
      }
      session++;
    }
  }
  return { ...emptyDataSet(), plans: [plan], planVersions: [version], progressionStates: [...states.values()], workouts, progressionEvents: events };
}
