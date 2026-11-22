// The rules around a level, pure and small: stars against par (§5), the ⏭ that appears after
// three restarts or twelve flings (§5), the silent valve that lengthens the aim dots after
// three empty flings in a row (§8), and the gentle "stuck" pulse on ↺ (§8).

import { PREVIEW_SECONDS } from './constants.js';

/** Three stars at par, two up to par + 2, one for finishing. Nothing else is scored (§5). */
export function starsFor(flings: number, par: number): 1 | 2 | 3 {
  return flings <= par ? 3 : flings <= par + 2 ? 2 : 1;
}

/** One visit to a level: restarts keep it, leaving the level ends it. */
export interface Visit {
  restarts: number;
  flings: number;
  /** Flings in a row that freed nothing, since the last restart. */
  emptyStreak: number;
  /** How many steps the valve has lengthened the preview. Never announced. */
  valve: number;
}

export const freshVisit = (): Visit => ({ restarts: 0, flings: 0, emptyStreak: 0, valve: 0 });

/** A fling has played out. Every third empty one in a row lengthens the preview a step. */
export function recordFling(visit: Visit, freedAny: boolean): void {
  visit.flings++;
  visit.emptyStreak = freedAny ? 0 : visit.emptyStreak + 1;
  if (visit.emptyStreak > 0 && visit.emptyStreak % 3 === 0) visit.valve = Math.min(PREVIEW_SECONDS.length - 1, visit.valve + 1);
}

export function recordRestart(visit: Visit): void {
  visit.restarts++;
  visit.emptyStreak = 0;
}

export const previewSeconds = (visit: Visit) => PREVIEW_SECONDS[visit.valve]!;
export const canSkip = (visit: Visit) => visit.restarts >= 3 || visit.flings >= 12;
/** Four empty flings and a world at rest with balloons left: ↺ pulses, gently. */
export const looksStuck = (visit: Visit, settled: boolean) => settled && visit.emptyStreak >= 4;
