// Every number the rules hang on, in one place. Metres, seconds, kilograms; y points up.

import type { Material, PomKind } from './types.js';

/** Fixed step (§12): world.step(1/60, 8, 3), never coarser. */
export const STEP = 1 / 60;
export const VELOCITY_ITERATIONS = 8;
export const POSITION_ITERATIONS = 3;
export const GRAVITY = -10;

/** The field (§10): 32 × 18 m, drawn at 40 px/m on a 1280 × 720 reference screen. */
export const FIELD_W = 32;
export const FIELD_H = 18;
export const PX_PER_M = 40;

/** The Flinger's own island and the point between its two poles where every pom starts. */
export const HOME_ISLAND = { x0: 1.4, x1: 7.0, top: 3.4 } as const;
export const LAUNCH = { x: 4.2, y: 5.5 } as const;

/** Full power: the speed of a pom pulled the whole 120 CSS px (§7a). */
export const MAX_SPEED = 22;
/** A release closer than ~16 px to the start cancels (§7a): 16 / 120 of full pull. */
export const CANCEL_POWER = 16 / 120;
export const MIN_ANGLE = -25;
export const MAX_ANGLE = 85;

export interface PomSpec {
  radius: number;
  density: number;
  restitution: number;
}

export const POMS: Record<PomKind, PomSpec> = {
  pom: { radius: 0.36, density: 3.5, restitution: 0.25 },
  puff: { radius: 0.46, density: 1.7, restitution: 0.2 },
  zip: { radius: 0.32, density: 4.2, restitution: 0.2 },
  thud: { radius: 0.36, density: 4.0, restitution: 0.1 },
};
/** The three small puffs a Puff splits into, fanned ±12° (§7a). */
export const SMALL_PUFF = { radius: 0.25, density: 3.2, restitution: 0.25 } as const;
export const PUFF_FAN_DEG = 12;
/** Zip doubles its speed; Thud drops straight down four times heavier (§7a). */
export const ZIP_FACTOR = 2;
export const THUD_FACTOR = 4;

export interface MaterialSpec {
  density: number;
  friction: number;
  restitution: number;
}

export const MATERIALS: Record<Material, MaterialSpec> = {
  wood: { density: 1.0, friction: 0.65, restitution: 0.05 },
  crystal: { density: 1.3, friction: 0.45, restitution: 0.05 },
  marble: { density: 8.0, friction: 0.85, restitution: 0.0 },
};

/**
 * Crystal is the only thing that breaks, and it breaks at a firm touch (§7a). Two ways to be
 * "firm": an approach impulse (effective mass × closing speed) or a crushing load through the
 * solver, well above anything an authored tower rests with (the rest gate proves that).
 */
export const CRYSTAL_TOUCH = 1.1;
export const CRYSTAL_CRUSH = 6.0;
/** Smallest approach impulse that knocks (a sound + dust); the first big one holds the world. */
export const KNOCK_IMPULSE = 0.7;
export const HOLD_IMPULSE = 5.0;

/** Balloons float: negative gravity, damped, never popping (§7a, §14). */
export const BALLOON = {
  radius: 0.5,
  density: 0.3,
  gravityScale: -1.2,
  linearDamping: 1.5,
  angularDamping: 3,
  friction: 0.02,
  restitution: 0.1,
} as const;
/** A pom that meets a balloon boings off with this much of its closing speed. */
export const BOING = 0.7;

/** Timings in 60 Hz steps. */
export const RELOAD_STEPS = 60; // the next pom hops in a second after the last one is gone
export const POM_REST_STEPS = 120; // a pom at rest puffs away after two seconds
export const POM_MAX_AGE = 900;
export const SETTLE_CAP = 240; // a tower must be asleep by 4 s (§B gate 2)
export const SHOT_CAP = 480; // replays fire once the world sleeps, at most 8 s (§B gate 3)
export const TRAIL_EVERY = 3;
/** Preview dots: one per three steps, so 0.45 s of flight is nine dots (§7c). */
export const PREVIEW_BASE = 0.45;
export const PREVIEW_STEP = 0.15;
export const PREVIEW_MAX = 0.9;
export const LONG_PREVIEW_CAP = 4;

/**
 * Box2D contact slop. 1 mm instead of 5 mm keeps a resting tower within millimetres of where
 * it was authored. Polygons carry a skin of 2 × slop, so two boxes rest with their edges
 * 3 × slop apart and a circle rests 1 × slop off a box: the level builder places blocks at
 * exactly those gaps, so a tower starts where it would come to rest (§B gate 2).
 */
export const LINEAR_SLOP = 0.001;
export const REST_GAP = 3 * LINEAR_SLOP;
export const BALLOON_GAP = LINEAR_SLOP;

/** Below this line a pom or block has dropped into the cloud sea. */
export const CLOUD_LINE = -1.6;
