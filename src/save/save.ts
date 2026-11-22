// The save (§5, §12): one versioned key, `flingdom:save`, read field by field so anything
// broken falls back on its own. `open` never goes down and is rebuilt from the finished levels
// when unreadable; corrupt JSON still gives up its stars; a save from a newer version keeps the
// fields this one does not know. Storage that is missing or throws just means no memory.

import type { PomKind } from '../sim/types.js';

export const SAVE_KEY = 'flingdom:save';
export const SAVE_VERSION = 1;
const LEVEL_COUNT = 20;

export interface LevelRecord {
  stars: number;
  fewest: number;
}

export interface Settings {
  muted: boolean;
  music: boolean;
  /** null follows the system's prefers-reduced-motion (§D). */
  reducedMotion: boolean | null;
  longAim: boolean;
}

export interface Save {
  /** The highest level that can be played. */
  open: number;
  levels: Record<number, LevelRecord>;
  /** Tricks whose tap ring has been shown: it appears once (§7a). */
  tricks: PomKind[];
  /** Every balloon ever freed: the parade on the map (§5). */
  parade: number;
  settings: Settings;
  hints: { flung: boolean };
}

export interface Loaded {
  save: Save;
  /** Fields this version does not know, kept so writing never destroys a newer save. */
  extras: Record<string, unknown>;
  version: number;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const TRICKS: PomKind[] = ['puff', 'zip', 'thud'];

export function freshSave(): Save {
  return { open: 1, levels: {}, tricks: [], parade: 0, settings: { muted: false, music: true, reducedMotion: null, longAim: false }, hints: { flung: false } };
}

const isLevel = (value: number) => Number.isInteger(value) && value >= 1 && value <= LEVEL_COUNT;
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

function levelRecords(value: unknown): Record<number, LevelRecord> {
  const records: Record<number, LevelRecord> = {};
  if (typeof value !== 'object' || value === null) return records;
  for (const [key, record] of Object.entries(value as Record<string, unknown>)) {
    const stars = count((record as Record<string, unknown> | null)?.stars);
    const fewest = count((record as Record<string, unknown> | null)?.fewest);
    if (isLevel(Number(key)) && stars >= 1 && stars <= 3 && fewest >= 1) records[Number(key)] = { stars, fewest };
  }
  return records;
}

/** Finishing a level opens the next, so the finished levels alone say how far the map is open. */
function openFrom(open: unknown, levels: Record<number, LevelRecord>): number {
  const finished = Object.keys(levels).map(Number);
  return Math.min(LEVEL_COUNT, Math.max(typeof open === 'number' && isLevel(open) ? open : 1, ...finished.map((id) => id + 1)));
}

export function parseSave(raw: string | null): Loaded {
  const save = freshSave();
  const loaded: Loaded = { save, extras: {}, version: SAVE_VERSION };
  if (!raw) return loaded;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    // Corrupt: rescue every legible level record, the parade and how far the map was open.
    for (const match of raw.matchAll(/"(\d+)"\s*:\s*\{\s*"stars"\s*:\s*(\d)\s*,\s*"fewest"\s*:\s*(\d+)/g)) {
      Object.assign(save.levels, levelRecords({ [match[1]!]: { stars: Number(match[2]), fewest: Number(match[3]) } }));
    }
    save.parade = count(Number(/"parade"\s*:\s*(\d+)/.exec(raw)?.[1]));
    save.open = openFrom(Number(/"open"\s*:\s*(\d+)/.exec(raw)?.[1]), save.levels);
    return loaded;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return loaded;
  const record = data as Record<string, unknown>;
  save.levels = levelRecords(record.levels);
  save.open = openFrom(record.open, save.levels);
  save.tricks = Array.isArray(record.tricks) ? TRICKS.filter((trick) => (record.tricks as unknown[]).includes(trick)) : [];
  save.parade = count(record.parade);
  const settings = (record.settings ?? {}) as Record<string, unknown>;
  save.settings = {
    muted: flag(settings.muted, false),
    music: flag(settings.music, true),
    reducedMotion: typeof settings.reducedMotion === 'boolean' ? settings.reducedMotion : null,
    longAim: flag(settings.longAim, false),
  };
  save.hints.flung = flag((record.hints as Record<string, unknown> | null)?.flung, false);
  const known = new Set([...Object.keys(save), 'v']);
  return {
    save,
    extras: Object.fromEntries(Object.entries(record).filter(([key]) => !known.has(key))),
    version: typeof record.v === 'number' && record.v > SAVE_VERSION ? record.v : SAVE_VERSION,
  };
}

export const serializeSave = (loaded: Loaded) => JSON.stringify({ ...loaded.extras, ...loaded.save, v: loaded.version });

function storage(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadSave(store: Store | null = storage()): Loaded {
  try {
    return parseSave(store?.getItem(SAVE_KEY) ?? null);
  } catch {
    return parseSave(null);
  }
}

export function writeSave(loaded: Loaded, store: Store | null = storage()): void {
  try {
    store?.setItem(SAVE_KEY, serializeSave(loaded));
  } catch {
    // Quota or a sandbox: the game plays on without remembering.
  }
}

/** A finished level keeps its best stars and fewest flings, opens the next, and joins the parade. */
export function recordFinish(save: Save, level: number, stars: number, flings: number, balloons: number): void {
  const before = save.levels[level];
  save.levels[level] = { stars: Math.max(stars, before?.stars ?? 0), fewest: Math.min(flings, before?.fewest ?? Infinity) };
  save.open = openFrom(save.open, save.levels);
  save.parade += balloons;
}

/** ⏭ opens the next level and leaves this one unstarred, with no mark against it (§5). */
export function recordSkip(save: Save, level: number): void {
  save.open = Math.min(LEVEL_COUNT, Math.max(save.open, level + 1));
}

/** §3: later visits open on the map with the next unfinished level focused. */
export const nextLevel = (save: Save) => Array.from({ length: save.open }, (_, index) => index + 1).find((level) => !save.levels[level]) ?? save.open;
