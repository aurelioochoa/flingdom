// The shapes the level data and the simulation agree on. Pure data: no planck, no DOM.

/** The four poms, one new per isle (§7a). */
export type PomKind = 'pom' | 'puff' | 'zip' | 'thud';

/** Wood topples, marble barely moves, crystal breaks, and nothing else ever breaks (§7a). */
export type Material = 'wood' | 'crystal' | 'marble';

export interface Point {
  x: number;
  y: number;
}

/** One block, centred at x, y in metres. `motif` picks the painted star, dot or moon on wood (§9). */
export interface BlockData {
  x: number;
  y: number;
  width: number;
  height: number;
  material: Material;
  motif: number;
}

/** A floating island: a flat grassy top between left and right. */
export interface IslandData {
  left: number;
  right: number;
  top: number;
}

/**
 * One fling: degrees above the horizontal, power 0–1 of the full pull, and for a trick pom
 * the 60 Hz step (counted from launch) at which the tap happens.
 */
export interface Shot {
  angle: number;
  power: number;
  tap?: number;
}

export interface LevelData {
  /** 1–20. */
  id: number;
  /** 0–3: the Dawn, Midday, Afternoon and Sunset isles. */
  isle: number;
  /** The poms in the order they come; the basket refills when it empties (§5). */
  basket: PomKind[];
  balloons: Point[];
  islands: IslandData[];
  blocks: BlockData[];
  /** The proven solution (§B). Its length is the level's par. */
  solution: Shot[];
}
