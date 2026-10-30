import { describe, expect, it } from 'vitest';
import { addCircuit, addToCircuit, blocks, moveCircuit, moveItem, removeCircuit, removeFromCircuit, updateCircuit, workoutSteps } from './circuit';
import { DEFAULT_SETTINGS, newDay, newExercise, newPlan, newPlanItem } from './factory';
import type { PlanDay, WorkoutEntry } from './types';
import { lastEntryFinder, startWorkout } from './workout';

const ex = (name: string) => newExercise('reps_load', DEFAULT_SETTINGS, { name });
const names = (day: PlanDay, all: Map<string, string>) => day.items.map((i) => all.get(i.exerciseId));

function setup() {
  const [a, b, c, d] = ['A', 'B', 'C', 'D'].map(ex);
  let day = newDay('Day');
  day.items.push(...[a, b, c, d].map((e) => newPlanItem(e)));
  const made = addCircuit(day, 'Core', 3);
  day = made.day;
  const all = new Map([a, b, c, d].map((e) => [e.id, e.name]));
  return { day, circuit: made.circuit, all, items: day.items, exercises: [a, b, c, d] };
}

describe('circuits', () => {
  it('adding items keeps them consecutive, with one working set per round', () => {
    const t = setup();
    let day = addToCircuit(t.day, t.items[3], t.circuit.id); // D
    day = addToCircuit(day, day.items.find((i) => i.id === t.items[1].id)!, t.circuit.id); // B
    expect(names(day, t.all)).toEqual(['A', 'C', 'D', 'B']);
    const bs = blocks(day);
    expect(bs.map((b) => (b.circuit ? `[${b.items.length}]` : 'item'))).toEqual(['item', 'item', '[2]']);
    for (const i of bs[2].items) expect(i.sets.map((s) => s.kind)).toEqual(['working', 'working', 'working']);
  });

  it('changing rounds changes the sets of every item of the circuit', () => {
    const t = setup();
    let day = addToCircuit(t.day, t.items[0], t.circuit.id);
    day = updateCircuit(day, t.circuit.id, { rounds: 5 });
    expect(day.items.find((i) => i.circuitId)!.sets).toHaveLength(5);
    expect(day.circuits?.[0].rounds).toBe(5);
  });

  it('moves items inside a circuit and whole circuits between blocks', () => {
    const t = setup();
    let day = addToCircuit(t.day, t.items[0], t.circuit.id);
    day = addToCircuit(day, day.items.find((i) => i.id === t.items[1].id)!, t.circuit.id);
    expect(names(day, t.all)).toEqual(['C', 'D', 'A', 'B']);
    day = moveItem(day, t.items[1].id, -1);
    expect(names(day, t.all)).toEqual(['C', 'D', 'B', 'A']);
    day = moveCircuit(day, t.circuit.id, -1);
    expect(names(day, t.all)).toEqual(['C', 'B', 'A', 'D']);
    day = moveItem(day, t.items[2].id, 1); // C passes the whole circuit
    expect(names(day, t.all)).toEqual(['B', 'A', 'C', 'D']);
  });

  it('taking an item out puts it after the circuit; deleting the circuit keeps its exercises', () => {
    const t = setup();
    let day = addToCircuit(t.day, t.items[0], t.circuit.id);
    day = addToCircuit(day, day.items.find((i) => i.id === t.items[1].id)!, t.circuit.id);
    day = removeFromCircuit(day, t.items[0].id);
    expect(names(day, t.all)).toEqual(['C', 'D', 'B', 'A']);
    expect(day.items.find((i) => i.id === t.items[0].id)?.circuitId).toBeUndefined();
    day = removeCircuit(day, t.circuit.id);
    expect(day.circuits).toEqual([]);
    expect(day.items.every((i) => !i.circuitId)).toBe(true);
  });

  it('a workout keeps the circuit as a snapshot, and its entries form one step', () => {
    const t = setup();
    let day = addToCircuit(t.day, t.items[0], t.circuit.id);
    day = addToCircuit(day, day.items.find((i) => i.id === t.items[1].id)!, t.circuit.id);
    const { plan, version } = newPlan('P');
    version.days.push(day);
    const w = startWorkout(plan, version, day, { exercises: new Map(t.exercises.map((e) => [e.id, e])), states: new Map(), lastEntry: lastEntryFinder([]) });
    expect(w.entries.map((e) => e.circuit?.name ?? '-')).toEqual(['-', '-', 'Core', 'Core']);
    expect(w.entries[2].sets).toHaveLength(3);
    expect(workoutSteps(w.entries).map((s) => s.indexes)).toEqual([[0], [1], [2, 3]]);
  });

  it('steps without circuits are one per entry', () => {
    expect(workoutSteps([{}, {}] as WorkoutEntry[]).map((s) => s.indexes)).toEqual([[0], [1]]);
  });
});
