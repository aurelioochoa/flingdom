import { describe, expect, it } from 'vitest';
import { playShots } from '../sim/replay.js';
import { FlingSim, previewFlight } from '../sim/sim.js';
import { LEVELS } from './levels.js';
import { isleGates } from './levels.testing.js';

isleGates(0);

describe('level 1 (§3)', () => {
  it('forgives nine in ten of the shots that reach the tower', () => {
    const level = LEVELS[0]!;
    const sim = new FlingSim(level);
    let reach = 0;
    let freed = 0;
    for (let angle = -10; angle <= 74; angle += 2) {
      for (let power = 0.3; power <= 1.0001; power += 0.04) {
        // Where the Long aim line ends is where this shot first touches anything.
        const end = previewFlight('pom', angle, power, 4, (point, radius) => sim.touches(point, radius)).at(-1)!;
        const onTower = sim.touches(end, 0.36) && end.y > level.islands[0]!.top + 0.05 && sim.blocks.some((block) => Math.abs(end.x - block.data.x) < block.data.width / 2 + 0.5);
        if (!onTower) continue;
        reach++;
        if (playShots(level, [{ angle, power }]).complete) freed++;
      }
    }
    expect(reach).toBeGreaterThan(100);
    expect(freed / reach).toBeGreaterThanOrEqual(0.9);
  });
});
