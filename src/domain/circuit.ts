// Circuits: exercises of a day done back to back, without rest, for a number of rounds (D18).
// Items of a circuit are consecutive in day.items; each has one working set per round.
import { uid } from './factory';
import type { Circuit, PlanDay, PlanItem, SetPrescription, WorkoutEntry } from './types';

/** The day as blocks: one block per circuit (its items in order) and one per item outside a circuit. */
export function blocks(day: PlanDay): { circuit?: Circuit; items: PlanItem[] }[] {
  const out: { circuit?: Circuit; items: PlanItem[] }[] = [];
  const circuits = day.circuits ?? [];
  for (const item of day.items) {
    const c = circuits.find((x) => x.id === item.circuitId);
    const prev = out[out.length - 1];
    if (c && prev?.circuit?.id === c.id) prev.items.push(item);
    else out.push({ circuit: c, items: [item] });
  }
  // Empty circuits (just created) are shown at the end.
  for (const c of circuits) if (!out.some((b) => b.circuit?.id === c.id)) out.push({ circuit: c, items: [] });
  return out;
}

const flatten = (bs: { items: PlanItem[] }[]) => bs.flatMap((b) => b.items);

/** One working set per round, from the item's first working set (other sets are dropped: no warm-up inside a circuit). */
function roundSets(sets: SetPrescription[], rounds: number): SetPrescription[] {
  const template = sets.find((s) => s.kind === 'working') ?? { kind: 'working' as const, targets: {} };
  return Array.from({ length: rounds }, () => structuredClone(template));
}

export function addCircuit(day: PlanDay, name: string, rounds = 3): { day: PlanDay; circuit: Circuit } {
  const circuit = { id: uid(), name, rounds };
  return { day: { ...day, circuits: [...(day.circuits ?? []), circuit] }, circuit };
}

export function updateCircuit(day: PlanDay, circuitId: string, patch: Partial<Pick<Circuit, 'name' | 'rounds'>>): PlanDay {
  const circuits = (day.circuits ?? []).map((c) => (c.id === circuitId ? { ...c, ...patch } : c));
  const rounds = circuits.find((c) => c.id === circuitId)?.rounds ?? 1;
  const items = patch.rounds === undefined ? day.items : day.items.map((i) => (i.circuitId === circuitId ? { ...i, sets: roundSets(i.sets, rounds) } : i));
  return { ...day, circuits, items };
}

/** Puts an item (new or existing) at the end of a circuit. */
export function addToCircuit(day: PlanDay, item: PlanItem, circuitId: string): PlanDay {
  const circuit = day.circuits?.find((c) => c.id === circuitId);
  if (!circuit) return day;
  const moved = { ...item, circuitId, group: undefined, sets: roundSets(item.sets, circuit.rounds) };
  const bs = blocks({ ...day, items: day.items.filter((i) => i.id !== item.id) });
  const target = bs.find((b) => b.circuit?.id === circuitId)!;
  target.items.push(moved);
  return { ...day, items: flatten(bs) };
}

/** Takes an item out of its circuit; it goes right after the circuit. Its sets stay (one per round). */
export function removeFromCircuit(day: PlanDay, itemId: string): PlanDay {
  const item = day.items.find((i) => i.id === itemId);
  if (!item?.circuitId) return day;
  const bs = blocks({ ...day, items: day.items.filter((i) => i.id !== itemId) });
  const at = bs.findIndex((b) => b.circuit?.id === item.circuitId);
  bs.splice(at + 1, 0, { items: [{ ...item, circuitId: undefined }] });
  return { ...day, items: flatten(bs) };
}

/** Deletes the circuit; its exercises stay in the day as normal items. */
export function removeCircuit(day: PlanDay, circuitId: string): PlanDay {
  return { ...day, circuits: (day.circuits ?? []).filter((c) => c.id !== circuitId), items: day.items.map((i) => (i.circuitId === circuitId ? { ...i, circuitId: undefined } : i)) };
}

/** Moves an item one place up or down: inside its circuit, or past the neighbour block (an item or a whole circuit). */
export function moveItem(day: PlanDay, itemId: string, d: -1 | 1): PlanDay {
  const bs = blocks(day);
  const item = day.items.find((i) => i.id === itemId);
  if (item?.circuitId) {
    const b = bs.find((x) => x.circuit?.id === item.circuitId)!;
    swap(b.items, b.items.findIndex((i) => i.id === itemId), d);
  } else swap(bs, bs.findIndex((b) => !b.circuit && b.items[0]?.id === itemId), d);
  return { ...day, items: flatten(bs) };
}

/** Moves a whole circuit one block up or down. */
export function moveCircuit(day: PlanDay, circuitId: string, d: -1 | 1): PlanDay {
  const bs = blocks(day);
  swap(bs, bs.findIndex((b) => b.circuit?.id === circuitId), d);
  return { ...day, items: flatten(bs) };
}

function swap<T>(arr: T[], i: number, d: number) {
  const j = i + d;
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

/** Workout steps: one per entry, except that consecutive entries of the same circuit form one step. */
export function workoutSteps(entries: WorkoutEntry[]): { circuit?: Circuit; indexes: number[] }[] {
  const out: { circuit?: Circuit; indexes: number[] }[] = [];
  entries.forEach((e, i) => {
    const prev = out[out.length - 1];
    if (e.circuit && prev?.circuit?.id === e.circuit.id) prev.indexes.push(i);
    else out.push({ circuit: e.circuit, indexes: [i] });
  });
  return out;
}
