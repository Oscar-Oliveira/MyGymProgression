// Sharing one plan with another person: as a file, as a link with the plan compressed in the address,
// or as QR codes, one per day (D60).
import { duplicatePlan } from './factory';
import { buildBundle, emptyDataSet, type Bundle, type DataSet } from './interchange';
import type { Exercise } from './types';

/**
 * Exercise as shared: personal notes are never included. For a link (lite), library text and images are left out
 * to keep the address short; the receiver's library usually has them, and a later library import fills them in.
 */
function shareExercise(e: Exercise, lite: boolean): Exercise {
  const out = { ...e, personalNotes: '' };
  if (!lite) return out;
  return { ...out, instructions: '', safetyNotes: '', links: [], thumb: undefined, image: undefined, video: undefined, overview: undefined, steps: undefined, tips: undefined, muscleDetail: undefined, related: undefined };
}

/**
 * Bundle with a copy of the plan's current version and the exercises it uses. The copy gets new ids
 * (plan, version, days, items, lineages), so importing it always adds a new plan and never touches existing ones.
 * Progression states and workouts are not included.
 */
export function planShare(all: DataSet, planId: string, appVersion: string, lite = false): Bundle | undefined {
  const plan = all.plans.find((p) => p.id === planId);
  const version = plan && all.planVersions.find((v) => v.id === plan.currentVersionId);
  if (!plan || !version) return undefined;
  const copy = duplicatePlan(plan, version, plan.name);
  const data: DataSet = {
    ...emptyDataSet(),
    plans: [copy.plan],
    planVersions: [copy.version],
    exercises: all.exercises.map((e) => shareExercise(e, lite)),
  };
  // The "plans" scope keeps only the exercises the plan uses.
  return buildBundle(data, 'plans', appVersion);
}

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
}

async function pack(text: string): Promise<string> {
  const bytes = await through(new TextEncoder().encode(text), new CompressionStream('deflate-raw'));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Bundle → compressed text safe for a URL (deflate + base64url). */
export async function encodeShare(bundle: Bundle): Promise<string> {
  return pack(JSON.stringify(bundle));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;

/**
 * Shorter text for a QR code: random ids do not compress, so each id becomes ~0, ~1… and every date becomes the export date.
 * The reader makes new ids (a shared plan always gets new ids). A text that starts with "~" gets one more "~".
 * The result starts with "~", so decodeShare knows it.
 */
export async function encodeCompact(bundle: Bundle): Promise<string> {
  const ids = new Map<string, string>();
  const text = JSON.stringify(bundle, (_k, v: unknown) => {
    if (typeof v !== 'string') return v;
    if (UUID.test(v)) {
      if (!ids.has(v)) ids.set(v, `~${ids.size.toString(36)}`);
      return ids.get(v);
    }
    if (ISO.test(v)) return bundle.exportedAt;
    return v.startsWith('~') ? `~${v}` : v;
  });
  return `~${await pack(text)}`;
}

/** Undoes encodeCompact: each short id gets a new UUID. */
function expand(text: string): string {
  const ids = new Map<string, string>();
  return JSON.stringify(
    JSON.parse(text, (_k, v: unknown) => {
      if (typeof v !== 'string' || !v.startsWith('~')) return v;
      if (v.startsWith('~~')) return v.slice(1);
      if (!ids.has(v)) ids.set(v, crypto.randomUUID());
      return ids.get(v);
    }),
  );
}

/** Compressed text from a link or a QR code → JSON text (validate with parseBundle). Undefined when the text is damaged. */
export async function decodeShare(code: string): Promise<string | undefined> {
  try {
    const compact = code.startsWith('~');
    const bin = atob((compact ? code.slice(1) : code).replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(await through(bytes, new DecompressionStream('deflate-raw')));
    return compact ? expand(text) : text;
  } catch {
    return undefined;
  }
}

/** Copy of the plan with only one of its days, for that day's QR code (D60). */
export function dayShare(all: DataSet, planId: string, dayId: string, appVersion: string): Bundle | undefined {
  const plan = all.plans.find((p) => p.id === planId);
  const version = plan && all.planVersions.find((v) => v.id === plan.currentVersionId);
  const day = version?.days.find((d) => d.id === dayId);
  if (!version || !day) return undefined;
  return planShare({ ...all, planVersions: [{ ...version, days: [day] }] }, planId, appVersion, true);
}

/** What a plan QR code holds: the link data, the plan it comes from (`group`), and which day of how many. */
export interface QrDay {
  code: string;
  group: string;
  index: number;
  total: number;
}

/** A day's QR code is a normal share link (a phone camera opens it) with the plan group, the day number and the day count. */
export const qrLink = (base: string, q: QrDay) => `${base}#/share?d=${q.code}&g=${q.group}&i=${q.index}&n=${q.total}`;

/** Reads a QR code text made by qrLink. A share link without the extra values counts as day 1 of 1. */
export function parseQrLink(text: string): QrDay | undefined {
  const hash = text.indexOf('#/share?');
  if (hash < 0) return undefined;
  const p = new URLSearchParams(text.slice(hash + '#/share?'.length));
  const code = p.get('d');
  const index = Number(p.get('i') ?? 0);
  const total = Number(p.get('n') ?? 1);
  if (!code || !Number.isInteger(index) || !Number.isInteger(total) || index < 0 || index >= total) return undefined;
  return { code, group: p.get('g') ?? code.slice(0, 12), index, total };
}

const sameExercise = (e: Exercise) => `${e.name.trim().toLowerCase()}|${e.equipment.trim().toLowerCase()}`;

/**
 * Joins the days read from the QR codes of one plan (in day order) into one plan.
 * Each code has its own copy of the exercises: copies with the same name and equipment become one.
 */
export function joinDays(parts: Bundle[]): Bundle {
  const [first] = parts;
  const kept = new Map<string, string>();
  const idMap = new Map<string, string>();
  const exercises: Exercise[] = [];
  for (const p of parts)
    for (const e of p.data.exercises) {
      const id = kept.get(sameExercise(e));
      if (id) idMap.set(e.id, id);
      else {
        kept.set(sameExercise(e), e.id);
        exercises.push(e);
      }
    }
  const to = (id: string) => idMap.get(id) ?? id;
  const days = parts.flatMap((p) => p.data.planVersions[0].days.map((d) => ({ ...d, items: d.items.map((i) => ({ ...i, exerciseId: to(i.exerciseId), substitutes: i.substitutes.map(to) })) })));
  return { ...first, data: { ...first.data, planVersions: [{ ...first.data.planVersions[0], days }], exercises } };
}
