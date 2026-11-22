// Headless replays in the real engine (§B): the level gates, `npm run solve` and the
// determinism tests all play shots through this one function, so what the tests prove is what
// the solver searched.

import { SHOT_WAIT_STEPS } from './constants.js';
import { FlingSim } from './sim.js';
import type { LevelData, Shot } from './types.js';

export interface Replay {
  sim: FlingSim;
  /** The balloons freed by the time each shot's world settled (cumulative, sorted). */
  freedAfter: number[][];
  complete: boolean;
}

const freedIndices = (sim: FlingSim) => sim.balloons.filter((balloon) => balloon.freed).map((balloon) => balloon.index);

/** Step until the world sleeps with a pom in the ribbon, waiting at most SHOT_WAIT_STEPS. */
export function waitForShot(sim: FlingSim): void {
  for (let waited = 0; sim.phase !== 'done' && (sim.phase !== 'ready' || (!sim.settled() && waited < SHOT_WAIT_STEPS)); waited++) sim.step();
}

/**
 * Play shots from a fresh world: each fires once the world sleeps (8 s cap), a trick taps at
 * its recorded step, and after the last shot the world gets the same chance to settle. Stops
 * as soon as every balloon is free.
 */
export function playShots(level: LevelData, shots: readonly Shot[]): Replay {
  const sim = new FlingSim(level);
  const freedAfter: number[][] = [];
  for (const shot of shots) {
    waitForShot(sim);
    if (sim.complete) break;
    sim.fire(shot.angle, shot.power);
    for (let waited = 0; waited < SHOT_WAIT_STEPS && sim.phase === 'flight'; waited++) {
      if (shot.tap === sim.stepsSinceLaunch) sim.trick();
      sim.step();
    }
    for (let waited = 0; waited < SHOT_WAIT_STEPS && !sim.complete && !sim.settled(); waited++) sim.step();
    freedAfter.push(freedIndices(sim));
  }
  return { sim, freedAfter, complete: sim.complete };
}
