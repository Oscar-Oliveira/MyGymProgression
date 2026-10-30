// Sharing one plan with another person: as a file, or as a link with the plan compressed in the address.
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
    plans: [{ ...copy.plan, color: plan.color }],
    planVersions: [copy.version],
    exercises: all.exercises.map((e) => shareExercise(e, lite)),
  };
  // The "plans" scope keeps only the exercises the plan uses.
  return buildBundle(data, 'plans', appVersion);
}

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
}

/** Bundle → compressed text safe for a URL (deflate + base64url). */
export async function encodeShare(bundle: Bundle): Promise<string> {
  const bytes = await through(new TextEncoder().encode(JSON.stringify(bundle)), new CompressionStream('deflate-raw'));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Compressed text from a link → JSON text (validate with parseBundle). Undefined when the text is damaged. */
export async function decodeShare(code: string): Promise<string | undefined> {
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(await through(bytes, new DecompressionStream('deflate-raw')));
  } catch {
    return undefined;
  }
}
