import { describe, expect, it } from 'vitest';
import { Tower } from '../data/build.js';
import { LEVELS } from '../data/levels.js';
import { MAX_SPEED, POM_REST_STEPS, PUFF_FAN_DEGREES, RELOAD_STEPS, THUD_FACTOR, ZIP_FACTOR } from './constants.js';
import { playShots, waitForShot } from './replay.js';
import { FlingSim, launchVelocity, previewFlight } from './sim.js';
import type { LevelData, PomKind } from './types.js';

/** An open field: by default one empty island far away, so a pom flies untouched for long. */
function openField(basket: PomKind[], build: (tower: Tower) => void = () => {}, islands = [{ left: 30, right: 31.5, top: 1 }]): LevelData {
  const tower = new Tower();
  build(tower);
  return { id: 99, isle: 3, basket, islands, blocks: tower.blocks, balloons: tower.balloons, solution: [] };
}

const flyFor = (sim: FlingSim, steps: number) => {
  for (let step = 0; step < steps; step++) sim.step();
};

describe('the fling', () => {
  it('launches at a speed linear in the pull, full power at the full 120 px pull', () => {
    const full = launchVelocity(0, 1);
    const half = launchVelocity(0, 0.5);
    expect(full.x).toBeCloseTo(MAX_SPEED);
    expect(half.x).toBeCloseTo(MAX_SPEED / 2);
    expect(launchVelocity(90, 1).y).toBeCloseTo(launchVelocity(80, 1).y);
  });

  it('replays bit for bit: the same shots give the same tower (§12)', () => {
    const level = LEVELS[4]!;
    const first = playShots(level, level.solution).sim;
    const second = playShots(level, level.solution).sim;
    const poses = (sim: FlingSim) => sim.blocks.map((block) => [block.body.getPosition().x, block.body.getPosition().y, block.body.getAngle()]);
    expect(poses(second)).toEqual(poses(first));
    expect(second.stepCount).toBe(first.stepCount);
  });

  it.each(['pom', 'puff', 'zip', 'thud'] as PomKind[])('previews the %s exactly as it flies until its first contact (§12)', (kind) => {
    const sim = new FlingSim(openField([kind]));
    const dots = previewFlight(kind, 35, 0.7, 0.9);
    sim.fire(35, 0.7);
    flyFor(sim, 54);
    // Dots fall every third step from launch, exactly like the trail.
    expect(dots).toEqual(sim.trail.slice(1, dots.length + 1));
  });

  it('runs the Long aim line to the first contact and no further (§D)', () => {
    const level = LEVELS[0]!;
    const sim = new FlingSim(level);
    const dots = previewFlight('pom', 22, 0.74, 4, (point, radius) => sim.touches(point, radius));
    const end = dots.at(-1)!;
    expect(sim.touches(end, 0.36)).toBe(true);
    expect(dots.slice(0, -1).every((dot) => !sim.touches(dot, 0.36))).toBe(true);
    expect(end.x).toBeGreaterThan(19);
  });

  it('takes the basket in order and refills it when it empties (§5)', () => {
    const sim = new FlingSim(openField(['pom', 'puff', 'zip']));
    const kinds: PomKind[] = [];
    for (let fling = 0; fling < 4; fling++) {
      waitForShot(sim);
      kinds.push(sim.kind);
      sim.fire(-10, 0.3);
    }
    expect(kinds).toEqual(['pom', 'puff', 'zip', 'pom']);
  });

  it('brings the next pom a second after a miss drops into the clouds (§3)', () => {
    const sim = new FlingSim(openField(['pom']));
    sim.fire(-20, 0.2);
    let missedAt = -1;
    while (sim.phase !== 'ready') {
      sim.step();
      if (missedAt < 0 && sim.takeEvents().some((event) => event.type === 'miss')) missedAt = sim.stepCount;
    }
    expect(missedAt).toBeGreaterThan(0);
    expect(sim.stepCount - missedAt).toBe(RELOAD_STEPS);
  });

  it('puffs a pom away after two seconds at rest (§8)', () => {
    const sim = new FlingSim(openField(['pom']));
    sim.fire(80, 0.16);
    let lastMoving = 0;
    let fadedAt = -1;
    for (let step = 0; step < 900 && fadedAt < 0; step++) {
      const speed = sim.poms[0] ? sim.poms[0].body.getLinearVelocity().length() : 0;
      if (speed >= 0.25) lastMoving = sim.stepCount;
      sim.step();
      if (sim.takeEvents().some((event) => event.type === 'fade')) fadedAt = sim.stepCount;
    }
    expect(fadedAt - lastMoving).toBeGreaterThanOrEqual(POM_REST_STEPS);
    expect(fadedAt - lastMoving).toBeLessThanOrEqual(POM_REST_STEPS + 2);
  });

  it('makes no sound from a tower at rest, however heavy', () => {
    const level = LEVELS.find((candidate) => candidate.blocks.some((block) => block.material === 'marble'))!;
    const sim = new FlingSim(level);
    for (let step = 0; step < 300; step++) sim.step();
    expect(sim.takeEvents()).toEqual([]);
  });
});

describe('the tricks (§7a)', () => {
  it('gives the plain Pom no trick, so a stray tap cannot muddle the first isle', () => {
    const sim = new FlingSim(openField(['pom']));
    sim.fire(40, 0.8);
    flyFor(sim, 10);
    expect(sim.canTrick()).toBe(false);
    expect(sim.trick()).toBe(false);
  });

  it('splits a Puff into three small puffs fanned ±12°, once per fling', () => {
    const sim = new FlingSim(openField(['puff']));
    sim.fire(40, 0.8);
    flyFor(sim, 10);
    expect(sim.trick()).toBe(true);
    expect(sim.trick()).toBe(false);
    sim.step();
    const headings = sim.poms.map((pom) => (Math.atan2(pom.body.getLinearVelocity().y, pom.body.getLinearVelocity().x) * 180) / Math.PI).sort((first, second) => first - second);
    expect(sim.poms.every((pom) => pom.small)).toBe(true);
    expect(headings).toHaveLength(3);
    expect(headings[1]! - headings[0]!).toBeCloseTo(PUFF_FAN_DEGREES, 0);
    expect(headings[2]! - headings[1]!).toBeCloseTo(PUFF_FAN_DEGREES, 0);
  });

  it('doubles a Zip along its line of flight', () => {
    const sim = new FlingSim(openField(['zip']));
    sim.fire(30, 0.7);
    flyFor(sim, 10);
    const before = sim.poms[0]!.body.getLinearVelocity().clone();
    sim.trick();
    const after = sim.poms[0]!.body.getLinearVelocity();
    expect(after.x).toBeCloseTo(before.x * ZIP_FACTOR);
    expect(after.y).toBeCloseTo(before.y * ZIP_FACTOR);
  });

  it('stops a Thud going forward and drops it straight down, four times heavier', () => {
    const sim = new FlingSim(openField(['thud']));
    sim.fire(50, 0.8);
    flyFor(sim, 10);
    const pom = sim.poms[0]!;
    const mass = pom.body.getMass();
    sim.trick();
    expect(pom.body.getLinearVelocity().x).toBe(0);
    expect(pom.body.getMass()).toBeCloseTo(mass * THUD_FACTOR);
    flyFor(sim, 30);
    expect(pom.body.getLinearVelocity().x).toBeCloseTo(0, 6);
    expect(pom.body.getLinearVelocity().y).toBeLessThan(0);
  });

  it('allows no trick once the pom has touched anything', () => {
    const level = LEVELS[10]!;
    const sim = new FlingSim(level);
    sim.fire(level.solution[0]!.angle, level.solution[0]!.power);
    while (sim.phase === 'flight' && !sim.poms[0]?.touched) sim.step();
    expect(sim.canTrick()).toBe(false);
  });
});

describe('materials and balloons (§7a)', () => {
  /** One upright block on a small island right in a flat full-power shot's path. */
  const struck = (material: 'wood' | 'crystal' | 'marble', width: number) => {
    const sim = new FlingSim(openField(['pom'], (tower) => tower.column(8, 3, 3, material, width), [{ left: 7, right: 9, top: 3 }]));
    sim.fire(0, 1);
    const events = [];
    for (let step = 0; step < 240; step++) {
      sim.step();
      events.push(...sim.takeEvents());
    }
    return { sim, shattered: events.filter((event) => event.type === 'shatter').length };
  };

  it('topples wood from one good hit, barely moves marble, and breaks only crystal', () => {
    const wood = struck('wood', 0.5);
    expect(wood.shattered).toBe(0);
    const woodBlock = wood.sim.blocks[0];
    expect(!woodBlock || Math.abs(woodBlock.body.getAngle()) > 1).toBe(true);
    const marble = struck('marble', 1);
    expect(marble.shattered).toBe(0);
    expect(Math.abs(marble.sim.blocks[0]!.body.getPosition().x - 8)).toBeLessThan(0.1);
    expect(Math.abs(marble.sim.blocks[0]!.body.getAngle())).toBeLessThan(0.05);
    const crystal = struck('crystal', 0.3);
    expect(crystal.shattered).toBe(1);
    expect(crystal.sim.blocks).toHaveLength(0);
  });

  it('never lets a pom shove a balloon: the pom boings off and the balloon stays put', () => {
    // A balloon floating up against the underside of an island overhead, open in front.
    const sim = new FlingSim(openField(['pom'], (tower) => tower.balloonUnder(10, 7), [{ left: 9, right: 11, top: 8 }]));
    const balloon = sim.balloons[0]!;
    sim.fire(13.8, 1);
    const events = [];
    for (let step = 0; step < 40; step++) {
      sim.step();
      events.push(...sim.takeEvents());
    }
    expect(events.some((event) => event.type === 'boing')).toBe(true);
    expect(sim.poms[0]?.body.getLinearVelocity().x ?? -1).toBeLessThan(0);
    expect(balloon.freed).toBe(false);
    expect(Math.abs(balloon.x - 10)).toBeLessThan(0.02);
  });

  it('frees a balloon only when nothing is left above it, and it rises', () => {
    const level = LEVELS[0]!;
    const replay = playShots(level, level.solution);
    const balloon = replay.sim.balloons[0]!;
    expect(balloon.freed).toBe(true);
    const height = balloon.y;
    flyFor(replay.sim, 30);
    expect(balloon.y).toBeGreaterThan(height);
  });
});
