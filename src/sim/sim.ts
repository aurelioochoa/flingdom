// The simulation (§12). Pure: no DOM, no Math.random, no clock. A fresh world is built from
// level data on every restart and advanced only by step(), so the same shots at the same steps
// replay the same tower, bit for bit, within one JavaScript engine.

import { Box, Circle, Settings, Vec2, World, type Body, type Contact, type Fixture } from 'planck';
import {
  BALLOON,
  BOING,
  CLOUD_LINE,
  CRYSTAL_BREAK_IMPULSE,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  GRAVITY,
  HOLD_IMPULSE,
  HOME_ISLAND,
  KNOCK_IMPULSE,
  LAUNCH,
  LINEAR_SLOP,
  MATERIALS,
  MAX_ANGLE,
  MAX_SPEED,
  MIN_ANGLE,
  POM_MAX_STEPS,
  POM_REST_STEPS,
  POMS,
  POSITION_ITERATIONS,
  PUFF_FAN_DEGREES,
  RELOAD_STEPS,
  RISE_SPEED,
  THROUGH_CRYSTAL,
  SMALL_PUFF,
  STEP_SECONDS,
  THUD_FACTOR,
  TRAIL_EVERY,
  VELOCITY_ITERATIONS,
  ZIP_FACTOR,
} from './constants.js';
import type { BlockData, IslandData, LevelData, Material, Point, PomKind } from './types.js';

Settings.linearSlop = LINEAR_SLOP;

/** Poms never collide with each other: a Puff's three halves start on the same spot. */
const POM_GROUP = -1;
const DEGREES = Math.PI / 180;

export interface Pose {
  x: number;
  y: number;
  angle: number;
}

export interface BlockBody {
  /** Index into the level's blocks: what the renderer keys its baked bitmap on. */
  readonly index: number;
  readonly data: BlockData;
  readonly body: Body;
  /** Pose before the latest step, for render interpolation. */
  previous: Pose;
  lastKnock: number;
}

export interface PomBody {
  readonly kind: PomKind;
  readonly small: boolean;
  readonly radius: number;
  readonly body: Body;
  /** Which fling it belongs to, counted from 1. */
  readonly fling: number;
  age: number;
  restSteps: number;
  /** Touched anything yet: a trick is a mid-flight tap, before the first contact (§7a). */
  touched: boolean;
  heavy: boolean;
  previous: Pose;
  /** The step it last boinged off each balloon, so one meeting is one boing. */
  boings: Map<number, number>;
}

export interface BalloonState {
  readonly index: number;
  /** Null once freed: a freed balloon leaves the physics and rises on its own. */
  body: Body | null;
  x: number;
  y: number;
  previous: Pose;
  freed: boolean;
  /** Its place in the order freed (0 = first), for the five-note tune. */
  order: number;
  rise: number;
  /** The strongest push on it lately, 0–1, for the squash in the renderer. */
  squash: number;
}

type Tag =
  | { type: 'island'; index: number }
  | { type: 'block'; block: BlockBody }
  | { type: 'pom'; pom: PomBody }
  | { type: 'balloon'; balloon: BalloonState };

export type SimEvent =
  | { type: 'launch'; kind: PomKind; power: number }
  | { type: 'trick'; kind: PomKind; x: number; y: number }
  | { type: 'knock'; material: Material; size: number; strength: number; x: number; y: number }
  | { type: 'shatter'; x: number; y: number; width: number; height: number; angle: number }
  | { type: 'boing'; x: number; y: number }
  | { type: 'free'; order: number; total: number; x: number; y: number; index: number }
  | { type: 'miss'; x: number }
  | { type: 'fade'; x: number; y: number; kind: PomKind }
  | { type: 'splash'; x: number; material: Material }
  | { type: 'land'; island: number }
  | { type: 'hold' }
  | { type: 'ready'; kind: PomKind }
  | { type: 'complete' };

export type Phase = 'ready' | 'flight' | 'reload' | 'done';

export const clampAngle = (degrees: number) => Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, degrees));
export const clampPower = (power: number) => Math.max(0, Math.min(1, power));

/** Launch velocity: speed is linear in the pull, so "a bit less" is a bit less. */
export function launchVelocity(angle: number, power: number): Point {
  const radians = clampAngle(angle) * DEGREES;
  const speed = MAX_SPEED * clampPower(power);
  return { x: Math.cos(radians) * speed, y: Math.sin(radians) * speed };
}

const tagOf = (fixture: Fixture) => fixture.getBody().getUserData() as Tag | undefined;

function poseOf(body: Body): Pose {
  const position = body.getPosition();
  return { x: position.x, y: position.y, angle: body.getAngle() };
}

/** Planck creates a pom the same way in the game and in the preview, so the preview is exact. */
function createPomBody(world: World, kind: PomKind, small: boolean, position: Point, velocity: Point): Body {
  const spec = small ? SMALL_PUFF : POMS[kind];
  const body = world.createDynamicBody({ position: Vec2(position.x, position.y), linearVelocity: Vec2(velocity.x, velocity.y), bullet: true, angularDamping: 0.4 });
  body.createFixture(Circle(spec.radius), { density: spec.density, restitution: spec.restitution, friction: 0.5, filterGroupIndex: POM_GROUP });
  return body;
}

export class FlingSim {
  readonly world = new World({ gravity: Vec2(0, GRAVITY) });
  readonly islands: IslandData[];
  readonly blocks: BlockBody[] = [];
  readonly poms: PomBody[] = [];
  readonly balloons: BalloonState[];
  events: SimEvent[] = [];
  phase: Phase = 'ready';
  stepCount = 0;
  flings = 0;
  stepsSinceLaunch = 0;
  /** Balloons freed when the latest fling launched: what "freed nothing" is measured from. */
  freedAtLaunch = 0;
  /** The flying pom's path, sampled every TRAIL_EVERY steps, and the previous fling's. */
  trail: Point[] = [];
  lastTrail: Point[] = [];

  private tricked = false;
  private reload = 0;
  private freedCount = 0;
  private trailPom: PomBody | null = null;
  private held = false;
  private readonly doomed = new Set<Body>();
  /** Poms that broke a pane this step: they carry on, a little slower. */
  private readonly slowed = new Set<PomBody>();
  private readonly boingQueue: { pom: PomBody; balloon: BalloonState }[] = [];
  private readonly islandBoxes: { body: Body; halfWidth: number; halfHeight: number }[] = [];

  constructor(readonly level: LevelData) {
    this.islands = [{ ...HOME_ISLAND }, ...level.islands];
    this.islands.forEach((island, index) => {
      const body = this.world.createBody({ position: Vec2((island.left + island.right) / 2, island.top - 0.5) });
      body.createFixture(Box((island.right - island.left) / 2, 0.5), { friction: 0.8 });
      body.setUserData({ type: 'island', index });
      this.islandBoxes.push({ body, halfWidth: (island.right - island.left) / 2, halfHeight: 0.5 });
    });
    level.blocks.forEach((data, index) => {
      const material = MATERIALS[data.material];
      const body = this.world.createDynamicBody({ position: Vec2(data.x, data.y), linearDamping: 0.05, angularDamping: 0.1 });
      body.createFixture(Box(data.width / 2, data.height / 2), material);
      const block: BlockBody = { index, data, body, previous: { x: data.x, y: data.y, angle: 0 }, lastKnock: -99 };
      body.setUserData({ type: 'block', block });
      this.blocks.push(block);
    });
    this.balloons = level.balloons.map((point, index) => {
      const body = this.world.createDynamicBody({ position: Vec2(point.x, point.y), gravityScale: BALLOON.gravityScale, linearDamping: BALLOON.linearDamping, angularDamping: BALLOON.angularDamping });
      body.createFixture(Circle(BALLOON.radius), { density: BALLOON.density, friction: BALLOON.friction, restitution: BALLOON.restitution });
      const balloon: BalloonState = { index, body, x: point.x, y: point.y, previous: { ...point, angle: 0 }, freed: false, order: -1, rise: 0, squash: 0 };
      body.setUserData({ type: 'balloon', balloon });
      return balloon;
    });
    this.world.on('pre-solve', (contact) => this.preSolve(contact));
  }

  get freed(): number {
    return this.freedCount;
  }

  get complete(): boolean {
    return this.freedCount === this.balloons.length;
  }

  /** The pom in the ribbon now: the basket in order, refilled when it empties (§5). */
  get kind(): PomKind {
    return this.level.basket[this.flings % this.level.basket.length]!;
  }

  towerAsleep(): boolean {
    return this.blocks.every((block) => !block.body.isAwake()) && this.balloons.every((balloon) => !balloon.body?.isAwake());
  }

  /** Nothing in flight, nothing moving: the state a replay fires from (§B gate 3). */
  settled(): boolean {
    return this.phase !== 'flight' && this.poms.length === 0 && this.towerAsleep();
  }

  private flyingPom(): PomBody | undefined {
    return this.poms.find((pom) => pom.fling === this.flings && !pom.small);
  }

  /** A trick can be used now: this fling's trick pom is still in mid-flight (§7a). */
  canTrick(): boolean {
    const pom = this.flyingPom();
    return !this.tricked && this.phase === 'flight' && !!pom && pom.kind !== 'pom' && !pom.touched;
  }

  /** Fling the pom in the ribbon. False when none is ready. */
  fire(angle: number, power: number): boolean {
    if (this.phase !== 'ready') return false;
    const kind = this.kind;
    this.flings++;
    const pom = this.addPom(kind, false, LAUNCH, launchVelocity(angle, power));
    this.phase = 'flight';
    this.stepsSinceLaunch = 0;
    this.tricked = false;
    this.held = false;
    this.freedAtLaunch = this.freedCount;
    this.lastTrail = this.trail;
    this.trail = [{ ...LAUNCH }];
    this.trailPom = pom;
    this.events.push({ type: 'launch', kind, power: clampPower(power) });
    return true;
  }

  /** The mid-flight tap: split, zip or thud. Once per fling; Pom has none (§7a). */
  trick(): boolean {
    if (!this.canTrick()) return false;
    const pom = this.flyingPom()!;
    const position = pom.body.getPosition();
    const velocity = pom.body.getLinearVelocity();
    this.tricked = true;
    if (pom.kind === 'puff') {
      const speed = Math.hypot(velocity.x, velocity.y);
      const heading = Math.atan2(velocity.y, velocity.x);
      for (const fan of [-PUFF_FAN_DEGREES, 0, PUFF_FAN_DEGREES]) {
        const direction = heading + fan * DEGREES;
        const half = this.addPom('puff', true, { x: position.x, y: position.y }, { x: Math.cos(direction) * speed, y: Math.sin(direction) * speed });
        if (fan === 0) this.trailPom = half;
      }
      this.doomed.add(pom.body);
    } else if (pom.kind === 'zip') {
      pom.body.setLinearVelocity(Vec2(velocity.x * ZIP_FACTOR, velocity.y * ZIP_FACTOR));
    } else {
      pom.body.setLinearVelocity(Vec2(0, Math.min(velocity.y, 0)));
      pom.body.setAngularVelocity(0);
      const fixture = pom.body.getFixtureList()!;
      fixture.setDensity(POMS.thud.density * THUD_FACTOR);
      fixture.setRestitution(0.02);
      pom.body.resetMassData();
      pom.heavy = true;
    }
    this.events.push({ type: 'trick', kind: pom.kind, x: position.x, y: position.y });
    return true;
  }

  step(): void {
    for (const block of this.blocks) block.previous = poseOf(block.body);
    for (const pom of this.poms) pom.previous = poseOf(pom.body);
    for (const balloon of this.balloons) {
      balloon.previous = { x: balloon.x, y: balloon.y, angle: 0 };
      balloon.squash *= 0.85;
    }
    this.world.step(STEP_SECONDS, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    this.stepCount++;
    if (this.phase === 'flight') this.stepsSinceLaunch++;
    this.applyBoings();
    this.removeDoomed();
    this.tidy();
    this.removeDoomed();
    this.updateBalloons();
    if (this.phase === 'flight' && !this.poms.some((pom) => pom.fling === this.flings)) {
      this.phase = 'reload';
      this.reload = RELOAD_STEPS;
      this.trailPom = null;
    } else if (this.phase === 'reload' && --this.reload <= 0) {
      this.phase = 'ready';
      this.events.push({ type: 'ready', kind: this.kind });
    }
  }

  /** Drain the events since the last call: the game turns them into sound and sparkle. */
  takeEvents(): SimEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  /**
   * Whether a pom of `radius` at `point` touches anything solid in the world as it stands: an
   * oriented-box test per block and island, a circle test per pinned balloon. The Long aim
   * line stops here (§D).
   */
  touches(point: Point, radius: number): boolean {
    const boxes = [
      ...this.blocks.map((block) => ({ body: block.body, halfWidth: block.data.width / 2, halfHeight: block.data.height / 2 })),
      ...this.islandBoxes,
    ];
    for (const { body, halfWidth, halfHeight } of boxes) {
      const local = body.getLocalPoint(Vec2(point.x, point.y));
      const outsideX = Math.max(0, Math.abs(local.x) - halfWidth);
      const outsideY = Math.max(0, Math.abs(local.y) - halfHeight);
      if (Math.hypot(outsideX, outsideY) < radius) return true;
    }
    return this.balloons.some((balloon) => !balloon.freed && Math.hypot(balloon.x - point.x, balloon.y - point.y) < radius + BALLOON.radius);
  }

  private addPom(kind: PomKind, small: boolean, position: Point, velocity: Point): PomBody {
    const body = createPomBody(this.world, kind, small, position, velocity);
    const pom: PomBody = { kind, small, radius: (small ? SMALL_PUFF : POMS[kind]).radius, body, fling: this.flings, age: 0, restSteps: 0, touched: false, heavy: false, previous: { ...position, angle: 0 }, boings: new Map() };
    body.setUserData({ type: 'pom', pom });
    this.poms.push(pom);
    return pom;
  }

  private preSolve(contact: Contact): void {
    const first = tagOf(contact.getFixtureA());
    const second = tagOf(contact.getFixtureB());
    if (!first || !second) return;
    const pomTag = first.type === 'pom' ? first : second.type === 'pom' ? second : null;
    const balloonTag = first.type === 'balloon' ? first : second.type === 'balloon' ? second : null;
    // Balloons never pop and are never shoved by a pom: it boings off instead (§7a).
    if (pomTag && balloonTag) {
      contact.setEnabled(false);
      const last = pomTag.pom.boings.get(balloonTag.balloon.index) ?? -99;
      if (this.stepCount - last > 6) {
        pomTag.pom.boings.set(balloonTag.balloon.index, this.stepCount);
        this.boingQueue.push({ pom: pomTag.pom, balloon: balloonTag.balloon });
      }
      return;
    }
    if (pomTag) pomTag.pom.touched = true;
    // Impacts are measured by how hard two bodies arrive, never by the load a resting stack
    // carries, so a heavy block sitting still makes no sound.
    const impulse = this.approachImpulse(contact);
    const tags = [first, second];
    for (const tag of tags) {
      if (tag.type === 'balloon') tag.balloon.squash = Math.max(tag.balloon.squash, Math.min(1, impulse * 2));
      if (tag.type !== 'block') continue;
      // A firm touch breaks crystal before the solver can bounce anything off it, so a pom
      // carries on through a row of panes, a little slower (§7a).
      if (tag.block.data.material === 'crystal' && (this.doomed.has(tag.block.body) || impulse > CRYSTAL_BREAK_IMPULSE)) {
        contact.setEnabled(false);
        this.shatter(tag.block);
        if (pomTag) this.slowed.add(pomTag.pom);
      } else if (impulse > KNOCK_IMPULSE && this.stepCount - tag.block.lastKnock > 8) {
        tag.block.lastKnock = this.stepCount;
        const point = contact.getWorldManifold(null)?.points[0] ?? tag.block.body.getPosition();
        this.events.push({ type: 'knock', material: tag.block.data.material, size: tag.block.data.width * tag.block.data.height, strength: impulse, x: point.x, y: point.y });
      }
    }
    const island = tags.find((tag) => tag.type === 'island');
    if (island?.type === 'island' && tags.some((tag) => tag.type === 'block') && impulse > KNOCK_IMPULSE * 3) this.events.push({ type: 'land', island: island.index });
    if (pomTag && !this.held && this.phase === 'flight' && impulse > HOLD_IMPULSE && tags.some((tag) => tag.type === 'block')) {
      this.held = true;
      this.events.push({ type: 'hold' });
    }
  }

  /** Closing speed along the contact normal, times the pair's effective mass. */
  private approachImpulse(contact: Contact): number {
    const manifold = contact.getWorldManifold(null);
    if (!manifold || manifold.pointCount === 0) return 0;
    const bodyA = contact.getFixtureA().getBody();
    const bodyB = contact.getFixtureB().getBody();
    let closing = 0;
    for (let index = 0; index < manifold.pointCount; index++) {
      const point = manifold.points[index]!;
      const velocityA = bodyA.getLinearVelocityFromWorldPoint(point);
      const velocityB = bodyB.getLinearVelocityFromWorldPoint(point);
      closing = Math.max(closing, -((velocityB.x - velocityA.x) * manifold.normal.x + (velocityB.y - velocityA.y) * manifold.normal.y));
    }
    const inverseMass = (bodyA.isDynamic() ? 1 / bodyA.getMass() : 0) + (bodyB.isDynamic() ? 1 / bodyB.getMass() : 0);
    return inverseMass > 0 ? closing / inverseMass : 0;
  }

  private shatter(block: BlockBody): void {
    if (this.doomed.has(block.body)) return;
    this.doomed.add(block.body);
    const position = block.body.getPosition();
    this.events.push({ type: 'shatter', x: position.x, y: position.y, width: block.data.width, height: block.data.height, angle: block.body.getAngle() });
  }

  private applyBoings(): void {
    for (const { pom, balloon } of this.boingQueue) {
      if (!balloon.body || this.doomed.has(pom.body)) continue;
      const pomPosition = pom.body.getPosition();
      const balloonPosition = balloon.body.getPosition();
      const distance = Math.hypot(pomPosition.x - balloonPosition.x, pomPosition.y - balloonPosition.y) || 1;
      const normalX = (pomPosition.x - balloonPosition.x) / distance;
      const normalY = (pomPosition.y - balloonPosition.y) / distance;
      const velocity = pom.body.getLinearVelocity();
      const along = velocity.x * normalX + velocity.y * normalY;
      if (along < 0) pom.body.setLinearVelocity(Vec2(velocity.x - (1 + BOING) * along * normalX, velocity.y - (1 + BOING) * along * normalY));
      pom.touched = true;
      balloon.squash = 1;
      this.events.push({ type: 'boing', x: balloonPosition.x + normalX * BALLOON.radius, y: balloonPosition.y + normalY * BALLOON.radius });
    }
    this.boingQueue.length = 0;
  }

  private removeDoomed(): void {
    for (const pom of this.slowed) pom.body.setLinearVelocity(Vec2.mul(pom.body.getLinearVelocity(), THROUGH_CRYSTAL));
    this.slowed.clear();
    for (const body of this.doomed) {
      const blockIndex = this.blocks.findIndex((block) => block.body === body);
      if (blockIndex >= 0) this.blocks.splice(blockIndex, 1);
      const pomIndex = this.poms.findIndex((pom) => pom.body === body);
      if (pomIndex >= 0) {
        if (this.trailPom === this.poms[pomIndex]) this.trailPom = null;
        this.poms.splice(pomIndex, 1);
      }
      // Whatever rested on a broken pane must notice that it is gone.
      for (let edge = body.getContactList(); edge; edge = edge.next ?? null) edge.other?.setAwake(true);
      this.world.destroyBody(body);
    }
    this.doomed.clear();
  }

  /** Blocks and poms that left the field, and poms that came to rest or flew too long. */
  private tidy(): void {
    const outside = (position: Point) => position.y < CLOUD_LINE || position.x < -4 || position.x > FIELD_WIDTH + 4;
    for (const block of this.blocks) {
      const position = block.body.getPosition();
      if (!outside(position)) continue;
      this.doomed.add(block.body);
      this.events.push({ type: 'splash', x: position.x, material: block.data.material });
    }
    for (const pom of this.poms) {
      pom.age++;
      const position = pom.body.getPosition();
      if (pom === this.trailPom && pom.age % TRAIL_EVERY === 0 && this.trail.length < 400) this.trail.push({ x: position.x, y: position.y });
      const velocity = pom.body.getLinearVelocity();
      pom.restSteps = Math.hypot(velocity.x, velocity.y) < 0.25 ? pom.restSteps + 1 : 0;
      if (outside(position)) {
        this.doomed.add(pom.body);
        this.events.push({ type: 'miss', x: Math.max(0, Math.min(FIELD_WIDTH, position.x)) });
      } else if (pom.restSteps > POM_REST_STEPS || pom.age > POM_MAX_STEPS) {
        this.doomed.add(pom.body);
        this.events.push({ type: 'fade', x: position.x, y: position.y, kind: pom.kind });
      }
    }
  }

  private updateBalloons(): void {
    for (const balloon of this.balloons) {
      if (balloon.freed) {
        balloon.rise = Math.min(RISE_SPEED, balloon.rise + 0.05);
        balloon.y += balloon.rise * STEP_SECONDS;
        continue;
      }
      const position = balloon.body!.getPosition();
      balloon.x = position.x;
      balloon.y = position.y;
      if ((balloon.body!.getLinearVelocity().y > 0.3 && this.clearAbove(position.x, position.y)) || position.y > FIELD_HEIGHT) this.free(balloon);
    }
  }

  /** Nothing but sky above a balloon: three rays up a corridor a little narrower than it. */
  private clearAbove(x: number, y: number): boolean {
    let blocked = false;
    for (const offset of [-0.35, 0, 0.35]) {
      this.world.rayCast(Vec2(x + offset, y + BALLOON.radius * 0.8), Vec2(x + offset, FIELD_HEIGHT + 20), (fixture) => {
        const tag = tagOf(fixture);
        if (tag?.type !== 'block' && tag?.type !== 'island') return -1;
        blocked = true;
        return 0;
      });
      if (blocked) return false;
    }
    return true;
  }

  private free(balloon: BalloonState): void {
    balloon.freed = true;
    balloon.order = this.freedCount++;
    balloon.rise = Math.max(0.5, balloon.body!.getLinearVelocity().y);
    this.world.destroyBody(balloon.body!);
    balloon.body = null;
    this.events.push({ type: 'free', order: balloon.order, total: this.balloons.length, x: balloon.x, y: balloon.y, index: balloon.index });
    if (this.complete) {
      this.phase = 'done';
      this.events.push({ type: 'complete' });
    }
  }
}

/**
 * The aim dots (§7c, §12): the engine's own step applied to a lone pom in a world of its own,
 * one dot every TRAIL_EVERY steps. Until its first contact this is exactly the real flight; a
 * test holds it to that. With `until` set it runs to the first point `until` says touches.
 */
export function previewFlight(kind: PomKind, angle: number, power: number, seconds: number, until?: (point: Point, radius: number) => boolean): Point[] {
  const world = new World({ gravity: Vec2(0, GRAVITY) });
  const body = createPomBody(world, kind, false, LAUNCH, launchVelocity(angle, power));
  const dots: Point[] = [];
  const steps = Math.round(seconds / STEP_SECONDS);
  for (let stepIndex = 1; stepIndex <= steps; stepIndex++) {
    world.step(STEP_SECONDS, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    const position = body.getPosition();
    const point = { x: position.x, y: position.y };
    if (until && (until(point, POMS[kind].radius) || point.y < CLOUD_LINE || point.x > FIELD_WIDTH + 4)) {
      dots.push(point);
      break;
    }
    if (stepIndex % TRAIL_EVERY === 0) dots.push(point);
  }
  return dots;
}
