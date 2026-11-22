// Every number the rules hang on, in one place. Metres, seconds, kilograms; y points up.

import type { Material, PomKind } from './types.js';

/** Fixed step (§12): world.step(1/60, 8, 3), never coarser. */
export const STEP_SECONDS = 1 / 60;
export const VELOCITY_ITERATIONS = 8;
export const POSITION_ITERATIONS = 3;
export const GRAVITY = -10;

/** The field (§10): 32 × 18 m, drawn at 40 px/m on a 1280 × 720 reference screen. */
export const FIELD_WIDTH = 32;
export const FIELD_HEIGHT = 18;

/** The Flinger's own island, and the point between its two poles where every pom starts. */
export const HOME_ISLAND = { left: 1.4, right: 7.0, top: 3.4 } as const;
export const LAUNCH = { x: 4.2, y: 5.6 } as const;

/** Full power: the speed of a pom pulled the whole 120 CSS px (§7a). */
export const MAX_SPEED = 18;
export const FULL_PULL_PIXELS = 120;
/** A release closer than 16 px to the start cancels (§7a). */
export const CANCEL_POWER = 16 / FULL_PULL_PIXELS;
export const MIN_ANGLE = -20;
export const MAX_ANGLE = 80;

interface PomSpec {
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
export const SMALL_PUFF: PomSpec = { radius: 0.25, density: 3.2, restitution: 0.25 };
export const PUFF_FAN_DEGREES = 12;
/** Zip doubles its speed; Thud drops straight down, four times heavier (§7a). */
export const ZIP_FACTOR = 2;
export const THUD_FACTOR = 4;

export const MATERIALS: Record<Material, { density: number; friction: number; restitution: number }> = {
  wood: { density: 1.0, friction: 0.65, restitution: 0.05 },
  crystal: { density: 1.3, friction: 0.45, restitution: 0.05 },
  marble: { density: 16, friction: 0.85, restitution: 0.0 },
};

/**
 * Contact impulses (N·s summed over a contact's points, after the solver). A resting block
 * presses with mass × g × step, a fraction of one; a pom arriving at speed is tens.
 * Crystal breaks at a firm touch and is the only thing that ever breaks (§7a).
 */
export const CRYSTAL_BREAK_IMPULSE = 2.4;
export const KNOCK_IMPULSE = 0.8;
/** The first impact this big in a fling holds the world for 60 ms (§7a). */
export const HOLD_IMPULSE = 6;

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
/** A pom keeps this much of its speed through each pane it breaks. */
export const THROUGH_CRYSTAL = 0.75;
/** A freed balloon's rise: its speed grows to this, gently (§7a). */
export const RISE_SPEED = 4;

/** Timings in 60 Hz steps. */
export const RELOAD_STEPS = 60; // the next pom hops in a second after the last one is gone
export const POM_REST_STEPS = 120; // a pom at rest puffs away after two seconds
export const POM_MAX_STEPS = 900;
export const TRAIL_EVERY = 3;
/** A replay fires each shot once the world sleeps, waiting at most 8 s (§B gate 3). */
export const SHOT_WAIT_STEPS = 480;

/** The aim dots show the flight's first 0.45 s, lengthened by the silent valve (§8). */
export const PREVIEW_SECONDS = [0.45, 0.6, 0.75, 0.9] as const;
/** The Long aim line runs to the first contact, at most this long (§D). */
export const LONG_PREVIEW_SECONDS = 4;

/**
 * Box2D contact slop. 1 mm instead of 5 mm keeps a resting tower within millimetres of where
 * it was authored. Polygons carry a skin of 2 × slop, so two boxes rest with their cores
 * 3 × slop apart and a circle rests 1 × slop off a box's core: the level builder places blocks
 * at exactly those gaps, so a tower starts where it would come to rest (§B gate 2).
 */
export const LINEAR_SLOP = 0.001;
export const REST_GAP = 3 * LINEAR_SLOP;
export const BALLOON_GAP = LINEAR_SLOP;

/** Below this line a pom or a block has dropped into the cloud sea. */
export const CLOUD_LINE = -1.0;
