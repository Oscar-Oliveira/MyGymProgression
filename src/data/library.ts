// Loads the exercise library file produced by scripts/import_exsercise.py (served from public/library/).
import type { LibraryRecord } from '../domain/library';

export interface LibraryFile {
  source: string;
  fetchedAt: string;
  exercises: LibraryRecord[];
}

export async function loadLibrary(): Promise<LibraryFile | undefined> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}library/exsercise.json`, { cache: 'no-cache' });
    if (!r.ok) return undefined;
    const data = (await r.json()) as LibraryFile;
    return Array.isArray(data.exercises) ? data : undefined;
  } catch {
    return undefined;
  }
}
