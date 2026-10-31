import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, duplicateAsVariation, newDay, newExercise, newPlan, newPlanItem, saveVersion } from './factory';
import { seedExercises, SEED_SIZE } from './seed';
import type { ProgressionState, Workout, WorkoutEntry } from './types';
import { addSet, decide, finishWorkout, lastEntryFinder, manualAdjust, reopenWorkout, resumable, startWorkout, substitute } from './workout';

function setup() {
  const bench = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Machine Chest Press' });
  bench.defaultSets.forEach((s) => (s.targets.load = { value: 40 }));
  const warm = newExercise('treadmill', DEFAULT_SETTINGS, { name: 'Treadmill warm-up', category: 'warmup' });
  warm.defaultSets = [{ kind: 'working', targets: { duration: { value: 5 } } }];
  const { plan, version } = newPlan('Upper');
  // Strength plan: the load goes up automatically at the top of the range.
  plan.goal = 'strength';
  const day = newDay('A');
  day.items.push(newPlanItem(warm), newPlanItem(bench));
  version.days.push(day);
  const exercises = new Map([bench, warm].map((e) => [e.id, e]));
  const states = new Map<string, ProgressionState>();
  const history: Workout[] = [];
  const lastEntry = (lineage: string): WorkoutEntry | undefined =>
    history.flatMap((w) => w.entries).filter((e) => e.lineageId === lineage).pop();
  const session = (benchReps: number[], warmMin = 5) => {
    const w = startWorkout(plan, version, day, { exercises, states, lastEntry });
    w.entries[0].sets[0] = { ...w.entries[0].sets[0], values: { duration: warmMin, speed: 5 }, status: 'done' };
    w.entries[1].sets = w.entries[1].sets.map((s, i) => ({ ...s, values: { ...s.values, reps: benchReps[i] }, status: 'done' }));
    const res = finishWorkout(w, false, lastEntry, states);
    history.push(res.workout);
    for (const st of res.states) states.set(st.lineageId, st);
    return res;
  };
  return { bench, warm, plan, version, day, states, history, session, exercises, lastEntry };
}

describe('workout flow', () => {
  it('runs the §6.3 sequence; success applies the increase; next session targets the new load from the minimum', () => {
    const t = setup();
    expect(t.session([10, 9, 8]).events[0].outcome).toBe('keep');
    const s2 = startWorkout(t.plan, t.version, t.day, { exercises: t.exercises, states: t.states, lastEntry: t.lastEntry });
    expect(s2.entries[1].sets.map((x) => x.goal?.reps)).toEqual([11, 10, 9]);
    expect(t.session([11, 10, 9]).events[0].outcome).toBe('progress');
    const r = t.session([12, 12, 12]);
    const ev = r.events.find((e) => e.exerciseId === t.bench.id)!;
    expect(ev.decision).toBe('applied');
    expect(ev.before).toEqual({ load: 40 });
    expect(ev.after).toEqual({ load: 42.5 });
    expect(t.states.get(ev.lineageId)?.targets.load).toBe(42.5);

    const next = startWorkout(t.plan, t.version, t.day, { exercises: t.exercises, states: t.states, lastEntry: t.lastEntry });
    expect(next.entries[1].prescription[0].targets.load?.value).toBe(42.5);
    expect(next.entries[1].sets[0].values).toEqual({ reps: 8, load: 42.5 });
    // History keeps the old prescription.
    expect(t.history[0].entries[1].prescription[0].targets.load?.value).toBe(40);
  });

  it('a 5-minute treadmill warm-up repeated never creates progression events', () => {
    const t = setup();
    for (let i = 0; i < 4; i++) {
      const r = t.session([10, 9, 8]);
      expect(r.workout.entries[0].evaluation?.outcome).toBe('no_progression');
      expect(r.events.some((e) => e.exerciseId === t.warm.id)).toBe(false);
    }
  });

  it('pending sets become skipped and the workout is partial', () => {
    const t = setup();
    const w = startWorkout(t.plan, t.version, t.day, { exercises: t.exercises, states: t.states, lastEntry: t.lastEntry });
    w.entries[1].sets[0].status = 'done';
    const r = finishWorkout(w, false, t.lastEntry, t.states);
    expect(r.workout.status).toBe('partial');
    expect(r.workout.entries[1].sets[1].status).toBe('skipped');
    expect(r.workout.entries[1].evaluation?.outcome).toBe('incomplete');
    expect(finishWorkout(w, true, t.lastEntry, t.states).workout.status).toBe('interrupted');
  });

  it('substitution keeps lineage, records the original, blocks progression', () => {
    const t = setup();
    const alt = duplicateAsVariation(t.bench, 'Dumbbell press');
    const w = startWorkout(t.plan, t.version, t.day, { exercises: t.exercises, states: t.states, lastEntry: t.lastEntry });
    w.entries[1] = substitute(w.entries[1], alt);
    w.entries[1].sets = w.entries[1].sets.map((s) => ({ ...s, values: { reps: 12, load: 40 }, status: 'done' }));
    const r = finishWorkout(w, false, t.lastEntry, t.states);
    expect(r.workout.entries[1].substitutedFor).toBe(t.bench.id);
    expect(r.workout.entries[1].exercise.name).toBe('Dumbbell press');
    expect(r.workout.entries[1].evaluation?.outcome).toBe('restricted');
    expect(substitute(w.entries[1], t.bench).substitutedFor).toBeUndefined();
  });

  it('decisions: revert an increase, keep or step back after missed reps, set a value', () => {
    const t = setup();
    const inc = t.session([12, 12, 12]).events[0];
    const rev = decide(inc, t.states.get(inc.lineageId), { kind: 'revert' });
    expect(rev.event.decision).toBe('reverted');
    expect(rev.state.targets.load).toBe(40);

    const t2 = setup();
    const missed = t2.session([9, 7, 6]).events[0];
    expect(missed.outcome).toBe('missed');
    expect(missed.decision).toBe('pending');
    expect(decide(missed, undefined, { kind: 'keep' }).state.targets.load).toBe(40);
    const back = decide(missed, undefined, { kind: 'stepBack' });
    expect(back.event.decision).toBe('stepped_back');
    expect(back.state.targets.load).toBe(37.5);
    const set = decide(missed, undefined, { kind: 'set', value: 38, reason: '1 kg plates' });
    expect(set.state.targets.load).toBe(38);
    expect(set.event.decisionReason).toBe('1 kg plates');
  });

  it('manual adjustment logs before/after', () => {
    const m = manualAdjust({ lineageId: 'L', exerciseId: 'E', targets: { load: 40 }, updatedAt: '' }, 'L', 'E', { load: 35 }, 'deload', 'double');
    expect(m.event.before).toEqual({ load: 40 });
    expect(m.event.after).toEqual({ load: 35 });
  });

  it('addSet copies the previous values as pending', () => {
    const t = setup();
    const w = startWorkout(t.plan, t.version, t.day, { exercises: t.exercises, states: t.states, lastEntry: t.lastEntry });
    const e = addSet(w.entries[1]);
    expect(e.sets).toHaveLength(4);
    expect(e.sets[3].status).toBe('pending');
    expect(e.sets[3].values.load).toBe(40);
  });
});

describe('plan versions and library', () => {
  it('editing a locked version creates a new version and keeps lineage', () => {
    const t = setup();
    const locked = { ...t.version, locked: true };
    const days = structuredClone(locked.days);
    days[0].items[1].sets.forEach((s) => (s.targets.reps = { min: 6, max: 10 }));
    const v2 = saveVersion(locked, days);
    expect(v2.id).not.toBe(locked.id);
    expect(v2.number).toBe(2);
    expect(v2.days[0].items[1].lineageId).toBe(locked.days[0].items[1].lineageId);
    expect(locked.days[0].items[1].sets[0].targets.reps).toEqual({ min: 8, max: 12 });
    expect(saveVersion(t.version, days).id).toBe(t.version.id);
  });
  it('duplicate as variation keeps the original', () => {
    const t = setup();
    const v = duplicateAsVariation(t.bench, 'Paused');
    expect(v.variationOf).toBe(t.bench.id);
    expect(t.bench.name).toBe('Machine Chest Press');
  });
  it('seed library has ~40 exercises with PT names and EN aliases', () => {
    const s = seedExercises({ language: 'pt', loadUnit: 'kg', distanceUnit: 'km' });
    expect(s.length).toBe(SEED_SIZE);
    expect(SEED_SIZE).toBeGreaterThanOrEqual(40);
    const bench = s.find((e) => e.aliases.includes('Barbell Bench Press'))!;
    expect(bench.name).toBe('Supino com barra');
    expect(bench.defaultSets).toHaveLength(3);
    expect(bench.defaultSets[0].targets.reps).toEqual({ min: 6, max: 10 });
    const warm = s.find((e) => e.aliases.includes('Treadmill Warm-up'))!;
    expect(warm.progression.strategy).toBe('none');
  });
});

describe('nextDay', () => {
  it('rotates through plan days after the last finished day', async () => {
    const { nextDay } = await import('./workout');
    const { version } = newPlan('X');
    version.days = [newDay('A'), newDay('B')];
    expect(nextDay(version, [])?.name).toBe('A');
    const w = (dayId: string, startedAt: string, status: Workout['status'] = 'completed') => ({ planId: version.planId, dayId, startedAt, status }) as Workout;
    expect(nextDay(version, [w(version.days[0].id, '2026-01-01')])?.name).toBe('B');
    expect(nextDay(version, [w(version.days[0].id, '2026-01-01'), w(version.days[1].id, '2026-01-03')])?.name).toBe('A');
    expect(nextDay(version, [w(version.days[0].id, '2026-01-01', 'in_progress')])?.name).toBe('A');
  });

  it('prefers the nearest day set to a weekday, over all active plans', async () => {
    const { nextDay, nextPlanned } = await import('./workout');
    const sat = new Date(2026, 9, 31, 10); // Saturday
    const one = newPlan('One');
    one.version.days = [newDay('Mon'), newDay('Sat A'), newDay('Sat B')];
    [0, 5, 5].forEach((wd, i) => (one.version.days[i].weekday = wd));
    const two = newPlan('Two');
    two.version.days = [newDay('Mon 2')];
    two.version.days[0].weekday = 0;
    const plans = [two.plan, one.plan];
    const versions = [one.version, two.version];
    // The other plan was used most recently, but Saturday days come first today.
    const recent = { planId: two.plan.id, dayId: two.version.days[0].id, startedAt: new Date(2026, 9, 26, 10).toISOString(), status: 'completed' } as Workout;
    expect(nextPlanned(plans, versions, [recent], sat)?.day.name).toBe('Sat A');
    // Sat A done today: Sat B is next; both done: Monday of the first plan in the list.
    const done = (name: string) => ({ planId: one.plan.id, dayId: one.version.days.find((d) => d.name === name)!.id, startedAt: new Date(2026, 9, 31, 9).toISOString(), status: 'completed' }) as Workout;
    expect(nextDay(one.version, [done('Sat A')], sat)?.name).toBe('Sat B');
    expect(nextPlanned(plans, versions, [recent, done('Sat A'), done('Sat B')], sat)?.day.name).toBe('Mon 2');
    // Without weekdays: the plan used most recently.
    for (const d of [...one.version.days, ...two.version.days]) d.weekday = undefined;
    expect(nextPlanned(plans, versions, [recent], sat)?.plan.name).toBe('Two');
  });
});

describe('demo data', () => {
  it('produces progression, fixed warm-ups that never progress, and valid bundles', async () => {
    const { generateDemo } = await import('./demo');
    const { buildBundle, parseBundle } = await import('./interchange');
    const ex = seedExercises({ language: 'en', loadUnit: 'kg', distanceUnit: 'km' });
    const d = generateDemo(ex, 6, new Date('2026-10-29T12:00:00Z'));
    expect(d.workouts).toHaveLength(12);
    expect(d.progressionEvents.some((e) => e.decision === 'applied' && e.suggestion?.metric === 'load')).toBe(true);
    expect(d.progressionEvents.some((e) => e.decision === 'applied' && e.suggestion?.metric === 'duration')).toBe(true);
    expect(d.progressionEvents.filter((e) => e.decision === 'pending').length).toBeGreaterThanOrEqual(1);
    expect(d.progressionEvents.some((e) => e.decision === 'reps_up')).toBe(true);
    const warm = ex.find((e) => e.name === 'Treadmill Warm-up')!;
    expect(d.progressionEvents.some((e) => e.exerciseId === warm.id)).toBe(false);
    const warmEntries = d.workouts.flatMap((w) => w.entries).filter((e) => e.exerciseId === warm.id);
    expect(warmEntries.every((e) => e.evaluation?.outcome === 'no_progression')).toBe(true);
    const chest = ex.find((e) => e.name === 'Machine Chest Press')!;
    const loads = d.workouts.flatMap((w) => w.entries).filter((e) => e.exerciseId === chest.id).map((e) => e.prescription[0].targets.load?.value);
    expect(loads[0]).toBe(40);
    expect(Math.max(...(loads as number[]))).toBeGreaterThan(40);
    expect(parseBundle(JSON.stringify(buildBundle({ ...d, exercises: ex }, 'full', 't'))).ok).toBe(true);
  });
});

describe('plan goal decides the progression (D11)', () => {
  const run = (goal: 'hypertrophy' | 'strength' | 'mixed') => {
    const t = setup();
    t.plan.goal = goal;
    return t;
  };

  it('strength: top of the range → load up automatically', () => {
    const ev = run('strength').session([12, 12, 12]).events[0];
    expect(ev.outcome).toBe('increase');
    expect(ev.decision).toBe('applied');
  });

  it('mixed: the exercise rule (auto load) is kept', () => {
    expect(run('mixed').session([12, 12, 12]).events[0].decision).toBe('applied');
  });

  it('hypertrophy: top of the range → ready, user chooses load or reps', () => {
    const t = run('hypertrophy');
    const ev = t.session([12, 12, 12]).events[0];
    expect(ev.outcome).toBe('ready');
    expect(ev.decision).toBe('pending');
    expect(ev.suggestion).toEqual({ metric: 'load', from: 40, to: 42.5, kind: 'increase' });
    expect(ev.repsOption).toEqual({ from: { min: 8, max: 12 }, to: { min: 9, max: 13 } });
    expect(t.states.get(ev.lineageId)).toBeUndefined();
  });

  it('hypertrophy reps up: same load, range 9–13 next session; load up later resets to 8–12', () => {
    const t = run('hypertrophy');
    const ev = t.session([12, 12, 12]).events[0];
    const r = decide(ev, t.states.get(ev.lineageId), { kind: 'repsUp' });
    expect(r.event.decision).toBe('reps_up');
    expect(r.event.rangeAfter).toEqual({ min: 9, max: 13 });
    t.states.set(r.state.lineageId, r.state);
    const next = startWorkout(t.plan, t.version, t.day, { exercises: t.exercises, states: t.states, lastEntry: t.lastEntry });
    expect(next.entries[1].prescription[0].targets).toEqual({ reps: { min: 9, max: 13 }, load: { value: 40 } });
    expect(next.entries[1].sets.map((x) => x.goal?.reps)).toEqual([13, 13, 13]);

    const ev2 = t.session([13, 13, 13]).events[0];
    expect(ev2.outcome).toBe('ready');
    expect(ev2.repsOption?.to).toEqual({ min: 10, max: 14 });
    const up = decide(ev2, t.states.get(ev2.lineageId), { kind: 'apply' });
    expect(up.event.decision).toBe('applied');
    expect(up.state.targets.load).toBe(42.5);
    expect(up.state.repsRange).toBeUndefined();
    t.states.set(up.state.lineageId, up.state);
    const after = startWorkout(t.plan, t.version, t.day, { exercises: t.exercises, states: t.states, lastEntry: t.lastEntry });
    expect(after.entries[1].prescription[0].targets).toEqual({ reps: { min: 8, max: 12 }, load: { value: 42.5 } });
  });

  it('reverting reps up restores the previous range', () => {
    const t = run('hypertrophy');
    const ev = t.session([12, 12, 12]).events[0];
    const r = decide(ev, undefined, { kind: 'repsUp' });
    const back = decide(r.event, r.state, { kind: 'revert' });
    expect(back.state.repsRange).toBeUndefined();
    expect(back.event.decision).toBe('reverted');
  });

  it('hypertrophy missed reps still asks keep or step back', () => {
    const ev = run('hypertrophy').session([9, 7, 6]).events[0];
    expect(ev.outcome).toBe('missed');
    expect(ev.repsOption).toBeUndefined();
  });

  it('non-load exercises ignore the goal (warm-up stays fixed)', () => {
    const t = run('hypertrophy');
    expect(t.session([10, 9, 8]).workout.entries[0].evaluation?.outcome).toBe('no_progression');
  });
  it('mixed: a day with its own goal uses it (hypertrophy day asks; strength day goes up)', () => {
    const h = run('mixed');
    h.day.goal = 'hypertrophy';
    expect(h.session([12, 12, 12]).events[0].decision).toBe('pending');
    const st = run('mixed');
    st.day.goal = 'strength';
    expect(st.session([12, 12, 12]).events[0].decision).toBe('applied');
  });

  it('the day goal is ignored when the plan is not mixed', () => {
    const t = run('hypertrophy');
    t.day.goal = 'strength';
    expect(t.session([12, 12, 12]).events[0].decision).toBe('pending');
  });

  it('a duplicated plan keeps goal and strength mode', async () => {
    const { duplicatePlan } = await import('./factory');
    const t = run('strength');
    t.plan.strengthMode = 'range';
    const copy = duplicatePlan(t.plan, t.version, 'Copy');
    expect([copy.plan.goal, copy.plan.strengthMode]).toEqual(['strength', 'range']);
  });
});

describe('goal default sets', () => {
  it('mixed plan: new items follow the day goal', async () => {
    const { dayGoal, goalSets } = await import('./goals');
    const ex = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Squat' });
    const plan = { goal: 'mixed' as const };
    expect(goalSets(dayGoal(plan, { goal: 'strength' }), ex).filter((x) => x.kind === 'working')).toHaveLength(5);
    expect(goalSets(dayGoal(plan, { goal: 'hypertrophy' }), ex).filter((x) => x.kind === 'working').map((x) => x.targets.reps)).toEqual([{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12 }]);
    expect(goalSets(dayGoal(plan, {}), ex)).toEqual(ex.defaultSets);
  });

  it('hypertrophy 3×8–12, strength 5×5 (an old range mode is ignored)', async () => {
    const { goalSets } = await import('./goals');
    const ex = newExercise('reps_load', DEFAULT_SETTINGS, { name: 'Bench' });
    ex.defaultSets.forEach((s) => (s.targets.load = { value: 60 }));
    const h = goalSets({ goal: 'hypertrophy' }, ex);
    expect(h).toHaveLength(3);
    expect(h[0]).toMatchObject({ targets: { reps: { min: 8, max: 12 }, load: { value: 60 } } });
    expect(h[0]).not.toHaveProperty('restSec');
    const f = goalSets({ goal: 'strength' }, ex);
    expect(f).toHaveLength(5);
    expect(f[0].targets.reps).toEqual({ min: 5, max: 5 });
    const r = goalSets({ goal: 'strength', strengthMode: 'range' } as { goal: 'strength' }, ex);
    expect(r).toHaveLength(5);
    expect(r[0].targets.reps).toEqual({ min: 5, max: 5 });
    const plank = newExercise('duration', DEFAULT_SETTINGS, { name: 'Plank' });
    expect(goalSets({ goal: 'strength' }, plank)).toEqual(plank.defaultSets);
  });
});

describe('review fixes', () => {
  it('manual adjust keeps a reps-up range', async () => {
    const { manualAdjust } = await import('./workout');
    const m = manualAdjust({ lineageId: 'L', exerciseId: 'E', targets: { load: 40 }, repsRange: { min: 9, max: 13 }, updatedAt: '' }, 'L', 'E', { load: 42 }, 'x', 'double');
    expect(m.state.repsRange).toEqual({ min: 9, max: 13 });
  });

  it('"last time" skips a substituted session', () => {
    const t = setup();
    t.session([10, 9, 8]);
    const alt = duplicateAsVariation(t.bench, 'Alt');
    const w = startWorkout(t.plan, t.version, t.day, { exercises: t.exercises, states: t.states, lastEntry: t.lastEntry });
    w.entries[1] = { ...substitute(w.entries[1], alt), sets: w.entries[1].sets.map((s) => ({ ...s, values: { reps: 5, load: 10 }, status: 'done' })) };
    t.history.push(finishWorkout(w, false, t.lastEntry, t.states).workout);
    const prev = lastEntryFinder(t.history)(w.entries[1].lineageId!);
    expect(prev?.exerciseId).toBe(t.bench.id);
    expect(prev?.sets[0].values.reps).toBe(10);
  });

  it('undo is refused once a newer change exists', async () => {
    const { canRevert } = await import('./workout');
    const t = setup();
    const first = t.session([12, 12, 12]).events[0];
    expect(canRevert(first, t.states.get(first.lineageId))).toBe(true);
    t.session([12, 12, 12]);
    const state = t.states.get(first.lineageId)!;
    expect(state.targets.load).toBe(45);
    expect(canRevert(first, state)).toBe(false);
    expect(decide(first, state, { kind: 'revert' }).state.targets.load).toBe(45);
  });
});

describe('resume an interrupted workout', () => {
  it('reopens it: in progress again, open sets pending, no evaluation', () => {
    const t = setup();
    const w = startWorkout(t.plan, t.version, t.day, { exercises: t.exercises, states: t.states, lastEntry: t.lastEntry });
    w.entries[1].sets[0] = { ...w.entries[1].sets[0], values: { ...w.entries[1].sets[0].values, reps: 8 }, status: 'done' };
    const done = finishWorkout(w, true, t.lastEntry, t.states).workout;
    expect(done.status).toBe('interrupted');
    const r = reopenWorkout(done);
    expect(r.status).toBe('in_progress');
    expect(r.endedAt).toBeUndefined();
    expect(r.entries[1].sets.map((x) => x.status)).toEqual(['done', 'pending', 'pending']);
    expect(r.entries.every((e) => e.evaluation === undefined)).toBe(true);
  });
  it('only the most recent workout, when paused or interrupted', () => {
    const t = setup();
    t.session([8, 8, 8]);
    const old = { ...t.history[0], status: 'interrupted' as const, startedAt: '2026-01-01T10:00:00Z' };
    const last = { ...old, id: 'last', startedAt: '2026-01-02T10:00:00Z' };
    expect(resumable(last, [old, last])).toBe(true);
    expect(resumable(old, [old, last])).toBe(false);
    expect(resumable({ ...last, status: 'partial' }, [old, last])).toBe(false);
    expect(resumable({ ...last, status: 'in_progress' }, [old, last])).toBe(true);
  });
});
