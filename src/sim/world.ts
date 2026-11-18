// The simulation (§12). Pure: no DOM, no Math.random, no clock. A fresh world is built from
// level data on every restart and advanced only by step(), so the same shots at the same
// steps replay the same tower, bit for bit, within one JavaScript engine.

import { Box, Circle, Settings, Vec2, World, type Body, type Contact, type Fixture } from 'planck';
import {
  BALLOON,
  BOING,
  CLOUD_LINE,
  CRYSTAL_CRUSH,
  CRYSTAL_TOUCH,
  GRAVITY,
  HOLD_IMPULSE,
  HOME_ISLAND,
  KNOCK_IMPULSE,
  LAUNCH,
  LINEAR_SLOP,
  LONG_PREVIEW_CAP,
  MATERIALS,
  MAX_ANGLE,
  MAX_SPEED,
  MIN_ANGLE,
  POM_MAX_AGE,
  POM_REST_STEPS,
  POMS,
  POSITION_ITERATIONS,
  PUFF_FAN_DEG,
  RELOAD_STEPS,
  SETTLE_CAP,
  SMALL_PUFF,
  STEP,
  THUD_FACTOR,
  TRAIL_EVERY,
  VELOCITY_ITERATIONS,
  ZIP_FACTOR,
} from './constants.js';
import type { BlockDef, IslandDef, LevelDef, Material, PomKind, Pt } from './types.js';

Settings.linearSlop = LINEAR_SLOP;

/** Poms never collide with each other: a Puff's three halves start on the same spot. */
const POM_GROUP = -1;

type Tag =
  | { type: 'island'; index: number }
  | { type: 'block'; block: BlockBody }
  | { type: 'pom'; pom: PomBody }
  | { type: 'balloon'; balloon: BalloonState };

interface Pose {
  x: number;
  y: number;
  a: number;
}

export interface BlockBody {
  /** Index into the level's blocks: what the renderer keys its baked bitmap on. */
  readonly index: number;
  readonly def: BlockDef;
  readonly body: Body;
  /** Pose before the latest step, for render interpolation. */
  prev: Pose;
}

export interface PomBody {
  readonly kind: PomKind;
  readonly small: boolean;
  readonly radius: number;
  readonly body: Body;
  /** Which fling it belongs to (1-based). */
  readonly fling: number;
  age: number;
  rest: number;
  /** Touched anything yet. A trick is a mid-flight tap: before the first contact (§7a). */
  touched: boolean;
  heavy: boolean;
  prev: Pose;
  /** Last step it boinged off each balloon, so one meeting is one boing. */
  boings: Map<number, number>;
}

export interface BalloonState {
  readonly index: number;
  readonly color: number;
  /** Null once freed: a freed balloon leaves the physics and rises on its own. */
  body: Body | null;
  x: number;
  y: number;
  prev: Pose;
  freed: boolean;
  /** Step it was freed on, and its place in the order (0 = first), for the five-note tune. */
  freedStep: number;
  order: number;
  /** Rise speed once free. */
  rise: number;
  /** Strongest push on it this step, 0–1, for the squash in the renderer. */
  squash: number;
}

export type SimEvent =
  | { type: 'launch'; kind: PomKind; speed: number }
  | { type: 'trick'; kind: PomKind; x: number; y: number }
  | { type: 'knock'; material: Material; size: number; strength: number; x: number; y: number }
  | { type: 'shatter'; x: number; y: number; w: number; h: number; angle: number }
  | { type: 'boing'; x: number; y: number }
  | { type: 'free'; order: number; total: number; x: number; y: number; color: number }
  | { type: 'miss'; x: number; y: number }
  | { type: 'fade'; x: number; y: number; kind: PomKind }
  | { type: 'splash'; x: number; y: number; material: Material }
  | { type: 'land'; island: number; strength: number }
  | { type: 'hold' }
  | { type: 'ready'; kind: PomKind }
  | { type: 'complete' };

export type Phase = 'ready' | 'flight' | 'reload' | 'done';

const DEG = Math.PI / 180;

export function clampAngle(deg: number): number {
  return Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, deg));
}

export function clampPower(p: number): number {
  return Math.max(0, Math.min(1, p));
}

/** Launch velocity for a shot: speed is linear in the pull, so "a bit less" is a bit less. */
export function launchVelocity(angleDeg: number, power: number): Pt {
  const a = clampAngle(angleDeg) * DEG;
  const s = MAX_SPEED * clampPower(power);
  return { x: Math.cos(a) * s, y: Math.sin(a) * s };
}

function tagOf(f: Fixture): Tag | undefined {
  return f.getBody().getUserData() as Tag | undefined;
}

function poseOf(b: Body): Pose {
  const p = b.getPosition();
  return { x: p.x, y: p.y, a: b.getAngle() };
}

export interface SimOptions {
  /** Step the fresh world until it sleeps before the first shot (default true). */
  settle?: boolean;
}

export class FlingSim {
  readonly world: World;
  readonly blocks: BlockBody[] = [];
  readonly poms: PomBody[] = [];
  readonly balloons: BalloonState[];
  readonly islands: IslandDef[];
  events: SimEvent[] = [];
  phase: Phase = 'ready';
  /** Steps since the world was built (after the pre-settle). */
  stepCount = 0;
  /** Flings fired this attempt. */
  flings = 0;
  /** Steps since the latest launch. */
  sinceLaunch = 0;
  /** This fling's trick has been used (once per fling). */
  tricked = false;
  /** Balloons freed when the latest fling launched: what "freed nothing" is measured from. */
  freedAtLaunch = 0;
  /** The flying pom's path, sampled every TRAIL_EVERY steps, and the previous fling's. */
  trail: Pt[] = [];
  lastTrail: Pt[] = [];
  /** Steps the pre-settle took (≤ SETTLE_CAP), for the rest gate. */
  readonly settledIn: number;

  private reload = 0;
  private freedCount = 0;
  private trailPom: PomBody | null = null;
  private held = false;
  private readonly removeBodies = new Set<Body>();
  private readonly boingQueue: { pom: PomBody; balloon: BalloonState }[] = [];
  private previewWorld: World | null = null;

  constructor(
    readonly level: LevelDef,
    opts: SimOptions = {},
  ) {
    this.world = new World({ gravity: Vec2(0, GRAVITY) });
    this.islands = [{ ...HOME_ISLAND }, ...level.islands];
    this.islands.forEach((isl, i) => {
      const body = this.world.createBody({ position: Vec2((isl.x0 + isl.x1) / 2, isl.top - 0.5) });
      body.createFixture(Box((isl.x1 - isl.x0) / 2, 0.5), { friction: 0.8 });
      body.setUserData({ type: 'island', index: i });
    });
    level.blocks.forEach((def, index) => {
      const m = MATERIALS[def.material];
      const body = this.world.createDynamicBody({
        position: Vec2(def.x, def.y),
        linearDamping: 0.05,
        angularDamping: 0.1,
      });
      body.createFixture(Box(def.w / 2, def.h / 2), { density: m.density, friction: m.friction, restitution: m.restitution });
      const block: BlockBody = { index, def, body, prev: { x: def.x, y: def.y, a: 0 } };
      body.setUserData({ type: 'block', block });
      this.blocks.push(block);
    });
    this.balloons = level.balloons.map((p, index) => {
      const body = this.world.createDynamicBody({
        position: Vec2(p.x, p.y),
        gravityScale: BALLOON.gravityScale,
        linearDamping: BALLOON.linearDamping,
        angularDamping: BALLOON.angularDamping,
      });
      body.createFixture(Circle(BALLOON.radius), {
        density: BALLOON.density,
        friction: BALLOON.friction,
        restitution: BALLOON.restitution,
      });
      const balloon: BalloonState = {
        index,
        color: level.colors[index] ?? index,
        body,
        x: p.x,
        y: p.y,
        prev: { x: p.x, y: p.y, a: 0 },
        freed: false,
        freedStep: -1,
        order: -1,
        rise: 0,
        squash: 0,
      };
      body.setUserData({ type: 'balloon', balloon });
      return balloon;
    });

    this.world.on('pre-solve', (c) => this.preSolve(c));
    this.world.on('post-solve', (c, impulse) => {
      const n = c.getManifold().pointCount;
      let total = 0;
      for (let i = 0; i < n; i++) total += impulse.normalImpulses[i] ?? 0;
      this.postSolve(c, total);
    });

    let settled = 0;
    if (opts.settle !== false) {
      while (settled < SETTLE_CAP && !this.towerAsleep()) {
        this.step();
        settled++;
      }
      this.events.length = 0;
      this.stepCount = 0;
    }
    this.settledIn = settled;
  }

  // ---- queries ------------------------------------------------------------------------

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

  /** Every block and pinned balloon asleep. */
  towerAsleep(): boolean {
    for (const b of this.blocks) if (b.body.isAwake()) return false;
    for (const b of this.balloons) if (b.body && b.body.isAwake()) return false;
    return true;
  }

  /** Nothing in flight, nothing moving: the state replays fire from (§B gate 3). */
  settled(): boolean {
    return this.phase !== 'flight' && this.poms.length === 0 && this.towerAsleep();
  }

  /** A trick can be used now: a trick pom of this fling still in mid-flight (§7a). */
  canTrick(): boolean {
    if (this.tricked || this.phase !== 'flight') return false;
    const p = this.poms.find((q) => q.fling === this.flings && !q.small);
    return !!p && p.kind !== 'pom' && !p.touched;
  }

  // ---- actions ------------------------------------------------------------------------

  /** Fling the pom in the ribbon. Returns false when there is none ready. */
  fire(angleDeg: number, power: number): boolean {
    if (this.phase !== 'ready') return false;
    const kind = this.kind;
    const v = launchVelocity(angleDeg, power);
    const pom = this.spawnPom(kind, false, LAUNCH.x, LAUNCH.y, v.x, v.y, this.flings + 1);
    this.flings++;
    this.phase = 'flight';
    this.sinceLaunch = 0;
    this.tricked = false;
    this.held = false;
    this.freedAtLaunch = this.freedCount;
    this.lastTrail = this.trail;
    this.trail = [{ x: LAUNCH.x, y: LAUNCH.y }];
    this.trailPom = pom;
    this.events.push({ type: 'launch', kind, speed: Math.hypot(v.x, v.y) });
    return true;
  }

  /** The mid-flight tap: split, zip or thud. Once per fling; Pom has none (§7a). */
  trick(): boolean {
    if (!this.canTrick()) return false;
    const p = this.poms.find((q) => q.fling === this.flings && !q.small)!;
    const pos = p.body.getPosition();
    const v = p.body.getLinearVelocity();
    this.tricked = true;
    if (p.kind === 'puff') {
      const speed = Math.hypot(v.x, v.y);
      const heading = Math.atan2(v.y, v.x);
      let middle: PomBody | null = null;
      for (const d of [-PUFF_FAN_DEG, 0, PUFF_FAN_DEG]) {
        const a = heading + d * DEG;
        const q = this.spawnPom('puff', true, pos.x, pos.y, Math.cos(a) * speed, Math.sin(a) * speed, p.fling);
        if (d === 0) middle = q;
      }
      this.removePom(p);
      this.trailPom = middle;
    } else if (p.kind === 'zip') {
      p.body.setLinearVelocity(Vec2(v.x * ZIP_FACTOR, v.y * ZIP_FACTOR));
    } else if (p.kind === 'thud') {
      p.body.setLinearVelocity(Vec2(0, Math.min(v.y, 0)));
      p.body.setAngularVelocity(0);
      const f = p.body.getFixtureList()!;
      f.setDensity(POMS.thud.density * THUD_FACTOR);
      f.setRestitution(0.02);
      p.body.resetMassData();
      p.heavy = true;
    }
    this.events.push({ type: 'trick', kind: p.kind, x: pos.x, y: pos.y });
    return true;
  }

  // ---- stepping -----------------------------------------------------------------------

  step(): void {
    for (const b of this.blocks) b.prev = poseOf(b.body);
    for (const p of this.poms) p.prev = poseOf(p.body);
    for (const b of this.balloons) b.prev = { x: b.x, y: b.y, a: 0 };
    for (const b of this.balloons) b.squash *= 0.8;

    this.world.step(STEP, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    this.stepCount++;
    if (this.phase === 'flight') this.sinceLaunch++;

    this.applyBoings();
    this.flushRemovals();
    this.tidyBlocks();
    this.tidyPoms();
    this.flushRemovals();
    this.updateBalloons();
    this.advancePhase();
  }

  /** Step n times (tests and tools). */
  run(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  // ---- preview ------------------------------------------------------------------------

  /**
   * The aiming dots (§7c, §12): the engine's own step applied to a lone pom, one dot per
   * TRAIL_EVERY steps. Until the first contact this is exactly the real flight — a test holds
   * it to that. `long` runs to the first contact instead (the Long aim line setting, §D).
   */
  preview(angleDeg: number, power: number, seconds: number, long = false): Pt[] {
    const kind = this.phase === 'ready' ? this.kind : this.level.basket[this.flings % this.level.basket.length]!;
    const spec = POMS[kind];
    if (!this.previewWorld) this.previewWorld = new World({ gravity: Vec2(0, GRAVITY) });
    const w = this.previewWorld;
    const v = launchVelocity(angleDeg, power);
    const body = w.createDynamicBody({ position: Vec2(LAUNCH.x, LAUNCH.y), linearVelocity: Vec2(v.x, v.y), bullet: true, angularDamping: 0.4 });
    body.createFixture(Circle(spec.radius), { density: spec.density, restitution: spec.restitution, friction: 0.5 });
    const steps = Math.round((long ? LONG_PREVIEW_CAP : seconds) * 60);
    const dots: Pt[] = [];
    let px: number = LAUNCH.x;
    let py: number = LAUNCH.y;
    for (let i = 1; i <= steps; i++) {
      w.step(STEP, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
      const p = body.getPosition();
      if (long) {
        const hit = this.sweepHits(px, py, p.x, p.y, spec.radius);
        if (hit) {
          dots.push(hit);
          break;
        }
        if (p.y < CLOUD_LINE || p.x > 40 || p.x < -6) break;
      }
      px = p.x;
      py = p.y;
      if (i % TRAIL_EVERY === 0) dots.push({ x: p.x, y: p.y });
    }
    w.destroyBody(body);
    return dots;
  }

  /** First point where a pom of radius r moving a→b would touch anything solid, or null. */
  private sweepHits(ax: number, ay: number, bx: number, by: number, r: number): Pt | null {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return null;
    const nx = -dy / len;
    const ny = dx / len;
    let best = 2;
    let at: Pt | null = null;
    for (const o of [-r, 0, r]) {
      const s = Vec2(ax + nx * o, ay + ny * o);
      const e = Vec2(bx + nx * o + (dx / len) * r, by + ny * o + (dy / len) * r);
      this.world.rayCast(s, e, (f, _p, _n, fraction) => {
        const tag = tagOf(f);
        if (!tag || tag.type === 'pom') return -1;
        if (fraction < best) {
          best = fraction;
          at = { x: ax + dx * Math.min(1, fraction), y: ay + dy * Math.min(1, fraction) };
        }
        return fraction;
      });
    }
    return at;
  }

  // ---- internals ----------------------------------------------------------------------

  private spawnPom(kind: PomKind, small: boolean, x: number, y: number, vx: number, vy: number, fling: number): PomBody {
    const spec = small ? SMALL_PUFF : POMS[kind];
    const body = this.world.createDynamicBody({
      position: Vec2(x, y),
      linearVelocity: Vec2(vx, vy),
      bullet: true,
      angularDamping: 0.4,
    });
    body.createFixture(Circle(spec.radius), {
      density: spec.density,
      restitution: spec.restitution,
      friction: 0.5,
      filterGroupIndex: POM_GROUP,
    });
    const pom: PomBody = {
      kind,
      small,
      radius: spec.radius,
      body,
      fling,
      age: 0,
      rest: 0,
      touched: false,
      heavy: false,
      prev: { x, y, a: 0 },
      boings: new Map(),
    };
    body.setUserData({ type: 'pom', pom });
    this.poms.push(pom);
    return pom;
  }

  private preSolve(c: Contact): void {
    const a = tagOf(c.getFixtureA());
    const b = tagOf(c.getFixtureB());
    if (!a || !b) return;
    // Balloons never pop and are never pushed by a pom: it boings off instead (§7a).
    if ((a.type === 'pom' && b.type === 'balloon') || (a.type === 'balloon' && b.type === 'pom')) {
      c.setEnabled(false);
      const pom = a.type === 'pom' ? a.pom : (b as { pom: PomBody }).pom;
      const balloon = a.type === 'balloon' ? a.balloon : (b as { balloon: BalloonState }).balloon;
      const last = pom.boings.get(balloon.index) ?? -99;
      if (this.stepCount - last > 6) {
        pom.boings.set(balloon.index, this.stepCount);
        this.boingQueue.push({ pom, balloon });
      }
      return;
    }
    if (a.type === 'pom') a.pom.touched = true;
    if (b.type === 'pom') b.pom.touched = true;

    // Closing speed along the normal at the contact, times the pair's effective mass.
    const wm = c.getWorldManifold(null);
    if (!wm || wm.pointCount === 0) return;
    const bodyA = c.getFixtureA().getBody();
    const bodyB = c.getFixtureB().getBody();
    let closing = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < wm.pointCount; i++) {
      const p = wm.points[i]!;
      const va = bodyA.getLinearVelocityFromWorldPoint(p);
      const vb = bodyB.getLinearVelocityFromWorldPoint(p);
      const vn = (vb.x - va.x) * wm.normal.x + (vb.y - va.y) * wm.normal.y;
      closing = Math.max(closing, -vn);
      cx += p.x / wm.pointCount;
      cy += p.y / wm.pointCount;
    }
    if (closing <= 0) return;
    const ia = bodyA.isDynamic() ? 1 / bodyA.getMass() : 0;
    const ib = bodyB.isDynamic() ? 1 / bodyB.getMass() : 0;
    if (ia + ib === 0) return;
    const impulse = closing / (ia + ib);

    for (const t of [a, b]) {
      if (t.type === 'block' && t.block.def.material === 'crystal' && impulse > CRYSTAL_TOUCH) this.shatter(t.block);
    }
    if (impulse > KNOCK_IMPULSE) {
      for (const t of [a, b]) {
        if (t.type === 'block' && !this.removeBodies.has(t.block.body)) {
          const d = t.block.def;
          this.events.push({ type: 'knock', material: d.material, size: d.w * d.h, strength: impulse, x: cx, y: cy });
        }
        if (t.type === 'island' && (a.type === 'block' || b.type === 'block')) {
          this.events.push({ type: 'land', island: t.index, strength: impulse });
        }
      }
    }
    if (!this.held && this.phase === 'flight' && impulse > HOLD_IMPULSE && (a.type === 'pom' || b.type === 'pom') && (a.type === 'block' || b.type === 'block')) {
      this.held = true;
      this.events.push({ type: 'hold' });
    }
  }

  private postSolve(c: Contact, normalImpulse: number): void {
    if (normalImpulse <= CRYSTAL_CRUSH) return;
    for (const f of [c.getFixtureA(), c.getFixtureB()]) {
      const t = tagOf(f);
      if (t?.type === 'block' && t.block.def.material === 'crystal') this.shatter(t.block);
    }
  }

  private shatter(block: BlockBody): void {
    if (this.removeBodies.has(block.body)) return;
    this.removeBodies.add(block.body);
    const p = block.body.getPosition();
    this.events.push({ type: 'shatter', x: p.x, y: p.y, w: block.def.w, h: block.def.h, angle: block.body.getAngle() });
  }

  private applyBoings(): void {
    for (const { pom, balloon } of this.boingQueue) {
      if (!balloon.body || this.removeBodies.has(pom.body)) continue;
      const pp = pom.body.getPosition();
      const bp = balloon.body.getPosition();
      let nx = pp.x - bp.x;
      let ny = pp.y - bp.y;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      const v = pom.body.getLinearVelocity();
      const vn = v.x * nx + v.y * ny;
      if (vn < 0) pom.body.setLinearVelocity(Vec2(v.x - (1 + BOING) * vn * nx, v.y - (1 + BOING) * vn * ny));
      pom.touched = true;
      balloon.squash = 1;
      this.events.push({ type: 'boing', x: bp.x + nx * BALLOON.radius, y: bp.y + ny * BALLOON.radius });
    }
    this.boingQueue.length = 0;
  }

  private flushRemovals(): void {
    if (this.removeBodies.size === 0) return;
    for (const body of this.removeBodies) {
      const bi = this.blocks.findIndex((b) => b.body === body);
      if (bi >= 0) this.blocks.splice(bi, 1);
      const pi = this.poms.findIndex((p) => p.body === body);
      if (pi >= 0) {
        if (this.trailPom === this.poms[pi]) this.trailPom = null;
        this.poms.splice(pi, 1);
      }
      // Whatever rested on a broken pane must notice it is gone.
      for (let ce = body.getContactList(); ce; ce = ce.next ?? null) ce.other?.setAwake(true);
      this.world.destroyBody(body);
    }
    this.removeBodies.clear();
  }

  private removePom(p: PomBody): void {
    this.removeBodies.add(p.body);
  }

  private tidyBlocks(): void {
    for (const b of this.blocks) {
      const p = b.body.getPosition();
      if (p.y < CLOUD_LINE - 1 || p.x < -6 || p.x > 38) {
        this.removeBodies.add(b.body);
        this.events.push({ type: 'splash', x: p.x, y: Math.max(p.y, CLOUD_LINE), material: b.def.material });
      }
    }
  }

  private tidyPoms(): void {
    for (const p of this.poms) {
      p.age++;
      const pos = p.body.getPosition();
      if (p === this.trailPom && p.age % TRAIL_EVERY === 0 && this.trail.length < 400) this.trail.push({ x: pos.x, y: pos.y });
      const v = p.body.getLinearVelocity();
      p.rest = Math.hypot(v.x, v.y) < 0.25 ? p.rest + 1 : 0;
      if (pos.y < CLOUD_LINE || pos.x < -4 || pos.x > 37) {
        this.removePom(p);
        this.events.push({ type: 'miss', x: Math.max(0, Math.min(32, pos.x)), y: Math.max(pos.y, CLOUD_LINE) });
      } else if (p.rest > POM_REST_STEPS || p.age > POM_MAX_AGE) {
        this.removePom(p);
        this.events.push({ type: 'fade', x: pos.x, y: pos.y, kind: p.kind });
      }
    }
  }

  private updateBalloons(): void {
    for (const b of this.balloons) {
      if (b.freed) {
        b.rise = Math.min(4, b.rise + 0.05);
        b.y += b.rise * STEP;
        continue;
      }
      const body = b.body!;
      const p = body.getPosition();
      b.x = p.x;
      b.y = p.y;
      const v = body.getLinearVelocity();
      // Squash shows the push of whatever presses on it from above (§7a).
      for (let ce = body.getContactList(); ce; ce = ce.next ?? null) {
        if (ce.contact.isTouching() && ce.other && ce.other.getUserData()?.type === 'block') {
          const ov = ce.other.getLinearVelocity();
          b.squash = Math.max(b.squash, Math.min(1, Math.hypot(ov.x, ov.y) / 3));
        }
      }
      if (v.y > 0.3 && this.clearAbove(p.x, p.y)) this.free(b, v.y);
    }
  }

  /** Nothing but sky above a balloon: three rays up a corridor narrower than the balloon. */
  private clearAbove(x: number, y: number): boolean {
    let blocked = false;
    for (const dx of [-0.35, 0, 0.35]) {
      this.world.rayCast(Vec2(x + dx, y + BALLOON.radius * 0.8), Vec2(x + dx, 40), (f) => {
        const t = tagOf(f);
        if (t && (t.type === 'block' || t.type === 'island')) {
          blocked = true;
          return 0;
        }
        return -1;
      });
      if (blocked) return false;
    }
    return true;
  }

  private free(b: BalloonState, vy: number): void {
    b.freed = true;
    b.freedStep = this.stepCount;
    b.order = this.freedCount;
    b.rise = Math.max(0.5, vy);
    this.freedCount++;
    this.world.destroyBody(b.body!);
    b.body = null;
    this.events.push({ type: 'free', order: b.order, total: this.balloons.length, x: b.x, y: b.y, color: b.color });
    if (this.complete) {
      this.phase = 'done';
      this.events.push({ type: 'complete' });
    }
  }

  private advancePhase(): void {
    if (this.phase === 'flight' && !this.poms.some((p) => p.fling === this.flings)) {
      this.phase = 'reload';
      this.reload = RELOAD_STEPS;
      this.trailPom = null;
    } else if (this.phase === 'reload' && --this.reload <= 0) {
      this.phase = 'ready';
      this.events.push({ type: 'ready', kind: this.kind });
    }
  }

  /** Drain the events since the last call (the game turns them into sound and sparkle). */
  takeEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
