// Headless replays in the real engine (§B): the level's gates, `npm run solve` and the
// determinism tests all play shots through this one function, so what the tests prove is
// what the solver searched.

import { SHOT_CAP } from './constants.js';
import type { LevelDef, Shot } from './types.js';
import { FlingSim } from './world.js';

export interface ShotOutcome {
  /** Indices of every balloon freed by the time this shot's world settled (cumulative). */
  freed: number[];
  /** Steps waited for the world to sleep before this shot could fire. */
  waited: number;
}

export interface Replay {
  sim: FlingSim;
  outcomes: ShotOutcome[];
  complete: boolean;
  flings: number;
}

function freedSet(sim: FlingSim): number[] {
  return sim.balloons.filter((b) => b.freed).map((b) => b.index);
}

/** Step until the world sleeps and the next pom is in the ribbon, at most SHOT_CAP steps. */
export function waitForReady(sim: FlingSim, cap = SHOT_CAP): number {
  let n = 0;
  while (n < cap && sim.phase !== 'done' && !(sim.phase === 'ready' && sim.settled())) {
    sim.step();
    n++;
  }
  // The cap passed with the tower still rocking: the pom must at least be in the ribbon.
  while (sim.phase !== 'ready' && sim.phase !== 'done' && n < cap * 2) {
    sim.step();
    n++;
  }
  return n;
}

/**
 * Play shots from a fresh world: each fires once the world sleeps (8 s cap), a trick taps at
 * its recorded step, and after the last shot the world gets the same chance to settle.
 * Stops early once every balloon is free.
 */
export function playShots(level: LevelDef, shots: readonly Shot[], sim = new FlingSim(level)): Replay {
  const outcomes: ShotOutcome[] = [];
  for (const shot of shots) {
    if (sim.complete) break;
    const waited = waitForReady(sim);
    if (sim.complete) break;
    if (!sim.fire(shot.angle, shot.power)) throw new Error('replay: no pom ready to fire');
    for (let n = 0; n < SHOT_CAP && sim.phase === 'flight'; n++) {
      if (shot.tap !== undefined && sim.sinceLaunch === shot.tap) sim.trick();
      sim.step();
    }
    let settle = 0;
    while (settle < SHOT_CAP && !sim.complete && !sim.settled()) {
      sim.step();
      settle++;
    }
    outcomes.push({ freed: freedSet(sim), waited });
  }
  return { sim, outcomes, complete: sim.complete, flings: sim.flings };
}
