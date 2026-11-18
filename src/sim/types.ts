// The shapes the level data and the simulation agree on. Pure data: no planck, no DOM.

/** The four poms, one new per isle (design §7a). */
export type PomKind = 'pom' | 'puff' | 'zip' | 'thud';
export const POM_KINDS: readonly PomKind[] = ['pom', 'puff', 'zip', 'thud'];

/** Wood topples, marble barely moves, crystal breaks — and nothing else ever breaks (§7a). */
export type Material = 'wood' | 'crystal' | 'marble';

export interface Pt {
  x: number;
  y: number;
}

/** One block, in metres, y up. `motif` picks the painted star / dot / moon on wood (§9). */
export interface BlockDef {
  x: number;
  y: number;
  w: number;
  h: number;
  material: Material;
  motif: number;
}

/** A floating island: a flat grassy top between x0 and x1. */
export interface IslandDef {
  x0: number;
  x1: number;
  top: number;
}

/**
 * One fling: angle in degrees above the horizontal, power 0–1 of full pull, and for a
 * trick pom the fixed step (60 Hz, counted from launch) at which the tap happens.
 */
export interface Shot {
  angle: number;
  power: number;
  tap?: number;
}

export interface LevelDef {
  id: number;
  /** 0–3: Dawn, Midday, Afternoon, Sunset isles. */
  isle: number;
  /** The poms in the order they come; the basket refills when it empties (§5). */
  basket: PomKind[];
  balloons: Pt[];
  islands: IslandDef[];
  blocks: BlockDef[];
  /** The proven solution (§B). Its length is the level's par. */
  solution: Shot[];
  /** Balloon colours, one index per balloon into the art palette. */
  colors: number[];
}
