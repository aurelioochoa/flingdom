import { describe, expect, it } from 'vitest';
import { PREVIEW_SECONDS } from './constants.js';
import { canSkip, freshVisit, looksStuck, previewSeconds, recordFling, recordRestart, starsFor } from './rules.js';

describe('stars (§5)', () => {
  it('gives three at par, two up to par + 2, one for finishing', () => {
    expect([1, 2, 3, 4, 5, 6, 12].map((flings) => starsFor(flings, 2))).toEqual([3, 3, 2, 2, 1, 1, 1]);
  });
});

describe('the ⏭ (§5)', () => {
  it('appears after three restarts or twelve flings, and not before', () => {
    const visit = freshVisit();
    recordRestart(visit);
    recordRestart(visit);
    expect(canSkip(visit)).toBe(false);
    recordRestart(visit);
    expect(canSkip(visit)).toBe(true);
    const flinger = freshVisit();
    for (let fling = 0; fling < 11; fling++) recordFling(flinger, fling % 2 === 0);
    expect(canSkip(flinger)).toBe(false);
    recordFling(flinger, true);
    expect(canSkip(flinger)).toBe(true);
  });
});

describe('the silent valve (§8)', () => {
  it('lengthens the preview a step after every three empty flings in a row, up to 0.9 s', () => {
    const visit = freshVisit();
    const seen = [previewSeconds(visit)];
    for (let fling = 0; fling < 12; fling++) {
      recordFling(visit, false);
      seen.push(previewSeconds(visit));
    }
    expect(seen).toEqual([0.45, 0.45, 0.45, 0.6, 0.6, 0.6, 0.75, 0.75, 0.75, 0.9, 0.9, 0.9, 0.9]);
    expect(PREVIEW_SECONDS.at(-1)).toBe(0.9);
  });

  it('counts only empty flings in a row, and stays lengthened through a restart', () => {
    const visit = freshVisit();
    recordFling(visit, false);
    recordFling(visit, false);
    recordFling(visit, true);
    recordFling(visit, false);
    recordFling(visit, false);
    expect(previewSeconds(visit)).toBe(0.45);
    recordFling(visit, false);
    expect(previewSeconds(visit)).toBe(0.6);
    recordRestart(visit);
    expect(previewSeconds(visit)).toBe(0.6);
    expect(freshVisit().valve).toBe(0);
  });
});

describe('the stuck pulse (§8)', () => {
  it('pulses ↺ only after four empty flings with the world at rest', () => {
    const visit = freshVisit();
    for (let fling = 0; fling < 3; fling++) recordFling(visit, false);
    expect(looksStuck(visit, true)).toBe(false);
    recordFling(visit, false);
    expect(looksStuck(visit, false)).toBe(false);
    expect(looksStuck(visit, true)).toBe(true);
    recordRestart(visit);
    expect(looksStuck(visit, true)).toBe(false);
  });
});
