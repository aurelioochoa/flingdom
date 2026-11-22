// The four gates of §B, run per level in the real engine, headless. Split across one test
// file per isle so Vitest runs the isles in parallel.

import { describe, expect, it } from 'vitest';
import { BALLOON, FIELD_HEIGHT, FIELD_WIDTH, HOME_ISLAND } from '../sim/constants.js';
import { playShots } from '../sim/replay.js';
import { FlingSim } from '../sim/sim.js';
import type { LevelData, Shot } from '../sim/types.js';
import { ISLE_POMS, LEVELS, LEVELS_PER_ISLE } from './levels.js';

const MAX_BODIES = 60;
const sameOrMore = (freed: number[], baseline: number[]) => baseline.every((index) => freed.includes(index));

function gates(level: LevelData): void {
  it('is well-formed: inside the field, no overlaps, at most 60 bodies, no pom before its isle', () => {
    expect(level.blocks.length + level.balloons.length).toBeLessThanOrEqual(MAX_BODIES);
    for (const island of [HOME_ISLAND, ...level.islands]) expect(island.left >= 0 && island.right <= FIELD_WIDTH && island.top > 0).toBe(true);
    for (const block of level.blocks) {
      expect(block.x - block.width / 2).toBeGreaterThan(0);
      expect(block.x + block.width / 2).toBeLessThan(FIELD_WIDTH);
      expect(block.y + block.height / 2).toBeLessThan(FIELD_HEIGHT);
    }
    // Boxes may touch at Box2D's resting gap but never overlap; balloons sit clear of every box.
    level.blocks.forEach((first, index) => {
      for (const second of level.blocks.slice(index + 1)) {
        const overlapX = (first.width + second.width) / 2 - Math.abs(first.x - second.x);
        const overlapY = (first.height + second.height) / 2 - Math.abs(first.y - second.y);
        expect(Math.min(overlapX, overlapY), `blocks ${index} and ${level.blocks.indexOf(second)}`).toBeLessThan(0);
      }
      for (const balloon of level.balloons) {
        const outsideX = Math.max(0, Math.abs(balloon.x - first.x) - first.width / 2);
        const outsideY = Math.max(0, Math.abs(balloon.y - first.y) - first.height / 2);
        expect(Math.hypot(outsideX, outsideY)).toBeGreaterThan(BALLOON.radius - 0.002);
      }
    });
    const isleOfPom = (kind: string) => ISLE_POMS.indexOf(kind as never);
    for (const kind of level.basket) expect(isleOfPom(kind)).toBeLessThanOrEqual(level.isle);
    if ((level.id - 1) % LEVELS_PER_ISLE === 0) expect(level.basket).toContain(ISLE_POMS[level.isle]);
    for (const [index, shot] of level.solution.entries()) if (shot.tap !== undefined) expect(level.basket[index % level.basket.length]).not.toBe('pom');
  });

  it('stays at rest: ten seconds with no shot free nothing, move nothing over 1 cm, and sleep by 4 s', () => {
    const sim = new FlingSim(level);
    const start = sim.blocks.map((block) => ({ x: block.data.x, y: block.data.y }));
    let asleepAt = -1;
    for (let step = 1; step <= 600; step++) {
      sim.step();
      if (asleepAt < 0 && sim.towerAsleep()) asleepAt = step;
    }
    expect(sim.freed).toBe(0);
    expect(sim.blocks.length).toBe(level.blocks.length);
    const drift = Math.max(...sim.blocks.map((block, index) => Math.hypot(block.body.getPosition().x - start[index]!.x, block.body.getPosition().y - start[index]!.y)));
    expect(drift).toBeLessThan(0.01);
    expect(asleepAt).toBeGreaterThan(0);
    expect(asleepAt).toBeLessThanOrEqual(240);
    expect(sim.towerAsleep()).toBe(true);
  });

  it('is solvable: the solution frees every balloon within par flings', () => {
    expect(level.solution.length).toBeGreaterThan(0);
    const replay = playShots(level, level.solution);
    expect(replay.complete).toBe(true);
    expect(replay.sim.flings).toBeLessThanOrEqual(level.solution.length);
  });

  it('is robust: each solution shot has 5 of 8 neighbours, and a trick 1 of 2 tap neighbours, that free the same', () => {
    const baseline = playShots(level, level.solution).freedAfter;
    level.solution.forEach((shot, index) => {
      const freedWith = (changed: Shot) => playShots(level, [...level.solution.slice(0, index), changed]).freedAfter[index] ?? [];
      let same = 0;
      for (const angle of [-1, 0, 1]) {
        for (const power of [-0.02, 0, 0.02]) {
          if (angle === 0 && power === 0) continue;
          if (sameOrMore(freedWith({ ...shot, angle: shot.angle + angle, power: shot.power + power }), baseline[index]!)) same++;
        }
      }
      expect(same, `shot ${index + 1} ${JSON.stringify(shot)}`).toBeGreaterThanOrEqual(5);
      if (shot.tap !== undefined) {
        const taps = [-3, 3].filter((change) => sameOrMore(freedWith({ ...shot, tap: shot.tap! + change }), baseline[index]!)).length;
        expect(taps, `shot ${index + 1} tap neighbours`).toBeGreaterThanOrEqual(1);
      }
    });
  });
}

export function isleGates(isle: number): void {
  for (const level of LEVELS.filter((candidate) => candidate.isle === isle)) describe(`level ${level.id}`, () => gates(level));
}
