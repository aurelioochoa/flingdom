// The Canvas2D field (§9, §12). The sky, clouds, islands and the Flinger's poles are baked
// into one bitmap per isle and size, and every block, balloon and pom is a bitmap baked once
// per size, so a frame is one blit plus ~80 drawImage calls with no per-frame gradients or
// filters. Sparkles are render-side and may use Math.random: they never touch the sim.

import { BALLOON, FIELD_HEIGHT, FIELD_WIDTH, HOME_ISLAND, LAUNCH, POMS, SMALL_PUFF } from '../sim/constants.js';
import type { FlingSim, Pose, SimEvent } from '../sim/sim.js';
import type { BlockData, IslandData, LevelData, Point, PomKind } from '../sim/types.js';
import { BALLOON_COLOURS, CLIFF, GRASS, GRASS_LIGHT, ISLE_COLOURS, POM_COLOURS, TERRACOTTA } from './palette.js';

/** How far back the pom sits in the ribbon at full pull, in metres. */
const PULL_METRES = 1.5;
const POLE_OFFSET = 0.55;
const MAX_PARTICLES = 150;

export interface FrameState {
  sim: FlingSim;
  alpha: number;
  seconds: number;
  /** The current pull, from a drag or the keyboard, or null when nothing is aimed. */
  aim: { angle: number; power: number } | null;
  preview: Point[];
  /** 0–1 through the ghost hand's pull loop, or null when it is not shown. */
  ghost: number | null;
  tapRing: Point | null;
  keyboard: boolean;
  reducedMotion: boolean;
}

interface Particle {
  kind: 'puff' | 'sparkle' | 'shard' | 'confetti';
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  life: number;
  maxLife: number;
  size: number;
  colour: string;
  spin: number;
}

type Context = CanvasRenderingContext2D;

function bitmap(width: number, height: number, draw: (context: Context) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  draw(canvas.getContext('2d')!);
  return canvas;
}

function roundedRectangle(context: Context, left: number, top: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.roundRect(left, top, width, height, Math.min(radius, width / 2, height / 2));
}

function star(context: Context, centerX: number, centerY: number, outer: number, inner = outer * 0.45, points = 5): void {
  context.beginPath();
  for (let index = 0; index < points * 2; index++) {
    const radius = index % 2 ? inner : outer;
    const angle = (index * Math.PI) / points - Math.PI / 2;
    context.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
  }
  context.closePath();
}

/** A soft heap of cloud: overlapping circles in a row, deterministic for a given seed. */
function cloudHeap(context: Context, left: number, baseline: number, width: number, height: number, seed: number): void {
  const puffs = Math.max(3, Math.round(width / height));
  for (let index = 0; index < puffs; index++) {
    const wobble = Math.sin(seed * 12.9898 + index * 78.233) * 0.5 + 0.5;
    const radius = height * (0.55 + 0.45 * wobble);
    context.moveTo(left + (index + 0.5) * (width / puffs) + radius, baseline);
    context.arc(left + (index + 0.5) * (width / puffs), baseline, radius, 0, Math.PI * 2);
  }
}

export class Renderer {
  /** CSS pixels per metre, and where the field's origin lands on screen. */
  scale = 40;
  private originX = 0;
  private originY = 0;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private level: LevelData | null = null;
  private background: HTMLCanvasElement | null = null;
  private cloudFront: HTMLCanvasElement | null = null;
  private readonly sprites = new Map<string, HTMLCanvasElement>();
  private readonly particles: Particle[] = [];
  /** How hard each island's bunting is flapping, 0–1. */
  private flaps: number[] = [];
  /** 1 when the next pom has just hopped into the ribbon, falling to 0 (§3). */
  private hop = 0;
  private readonly context: Context;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d')!;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.canvas.width = Math.round(width * pixelRatio);
    this.canvas.height = Math.round(height * pixelRatio);
    // §10: the 16:9 field letterboxed with more sky and cloud, never bars. Portrait plays at
    // full width under a taller sky, so the spare height goes mostly above the field.
    this.scale = Math.min(width / FIELD_WIDTH, height / FIELD_HEIGHT);
    this.originX = (width - FIELD_WIDTH * this.scale) / 2;
    this.originY = height - (height - FIELD_HEIGHT * this.scale) * 0.15;
    this.sprites.clear();
    this.bake();
  }

  setLevel(level: LevelData): void {
    this.level = level;
    this.flaps = new Array(level.islands.length + 1).fill(0);
    this.particles.length = 0;
    this.sprites.clear();
    this.bake();
  }

  screenX(worldX: number): number {
    return this.originX + worldX * this.scale;
  }

  screenY(worldY: number): number {
    return this.originY - worldY * this.scale;
  }

  /** Where the pom sits in the ribbon for a pull: back along the aim, by the pull's power. */
  static pulledPom(aim: { angle: number; power: number } | null): Point {
    if (!aim) return { ...LAUNCH };
    const radians = (aim.angle * Math.PI) / 180;
    return { x: LAUNCH.x - Math.cos(radians) * aim.power * PULL_METRES, y: LAUNCH.y - Math.sin(radians) * aim.power * PULL_METRES };
  }

  private islands(): IslandData[] {
    return [HOME_ISLAND, ...(this.level?.islands ?? [])];
  }

  private colours() {
    return ISLE_COLOURS[this.level?.isle ?? 0]!;
  }

  // ---- baking ---------------------------------------------------------------------------

  private bake(): void {
    if (!this.level) return;
    const colours = this.colours();
    const ratio = this.pixelRatio;
    this.background = bitmap(this.canvas.width, this.canvas.height, (context) => {
      context.scale(ratio, ratio);
      const sky = context.createLinearGradient(0, 0, 0, this.height);
      sky.addColorStop(0, colours.skyTop);
      sky.addColorStop(1, colours.skyBottom);
      context.fillStyle = sky;
      context.fillRect(0, 0, this.width, this.height);
      const sunX = this.screenX(26);
      const sunY = this.screenY(14.5);
      const glow = context.createRadialGradient(sunX, sunY, 0, sunX, sunY, this.scale * 6);
      glow.addColorStop(0, colours.sun);
      glow.addColorStop(0.25, colours.sun);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = glow;
      context.fillRect(0, 0, this.width, this.height);
      // Distant clouds, faint, spread over however much sky the screen shows, at fixed places
      // so a restart never reshuffles them.
      const skyTop = this.originY / this.scale;
      const left = -this.originX / this.scale;
      const across = this.width / this.scale;
      context.globalAlpha = 0.55;
      context.fillStyle = colours.cloud;
      const clouds = Math.max(7, Math.round((skyTop - 7) / 2.2));
      for (let index = 0; index < clouds; index++) {
        context.beginPath();
        // The R2 sequence: evenly scattered, with no lines or clumps.
        cloudHeap(context, this.screenX(left - 3 + ((0.5 + index * 0.7548777) % 1) * (across + 2)), this.screenY(8.5 + ((0.5 + index * 0.5698403) % 1) * (skyTop - 9)), this.scale * 4.5, this.scale * 0.7, index + 1);
        context.fill();
      }
      context.globalAlpha = 1;
      this.drawCloudSea(context, 1.4, colours.cloudShade, 0.9);
      this.drawCloudSea(context, 0.7, colours.cloud, 0.75);
      for (const island of this.islands()) this.drawIsland(context, island);
      this.drawPoles(context);
    });
    this.cloudFront = bitmap(this.canvas.width, this.canvas.height, (context) => {
      context.scale(ratio, ratio);
      this.drawCloudSea(context, -0.2, colours.cloud, 0.6);
    });
  }

  /** A band of cloud whose puffy top edge sits at world height `top`, filled to the bottom. */
  private drawCloudSea(context: Context, top: number, colour: string, puffSize: number): void {
    const edge = this.screenY(top);
    context.fillStyle = colour;
    context.beginPath();
    cloudHeap(context, -this.scale, edge, this.width + this.scale * 2, this.scale * puffSize, top * 7);
    context.rect(-this.scale, edge, this.width + this.scale * 2, this.height - edge + this.scale);
    context.fill();
  }

  private drawIsland(context: Context, island: IslandData): void {
    const left = this.screenX(island.left);
    const right = this.screenX(island.right);
    const top = this.screenY(island.top);
    const depth = this.scale * (1.2 + (island.right - island.left) * 0.28);
    const middle = (left + right) / 2;
    context.fillStyle = TERRACOTTA;
    context.beginPath();
    context.moveTo(left, top);
    context.quadraticCurveTo(left + (right - left) * 0.1, top + depth * 0.7, middle, top + depth);
    context.quadraticCurveTo(right - (right - left) * 0.1, top + depth * 0.7, right, top);
    context.fill();
    context.fillStyle = CLIFF;
    context.beginPath();
    context.moveTo(left, top);
    context.quadraticCurveTo(left + (right - left) * 0.12, top + depth * 0.45, middle, top + depth * 0.55);
    context.quadraticCurveTo(right - (right - left) * 0.12, top + depth * 0.45, right, top);
    context.fill();
    roundedRectangle(context, left - this.scale * 0.15, top - this.scale * 0.12, right - left + this.scale * 0.3, this.scale * 0.5, this.scale * 0.25);
    context.fillStyle = GRASS;
    context.fill();
    context.fillStyle = GRASS_LIGHT;
    context.fillRect(left, top - this.scale * 0.08, right - left, this.scale * 0.1);
  }

  /** The Flinger: two candy-striped poles, deliberately not a forked slingshot (§9). */
  private drawPoles(context: Context): void {
    const width = this.scale * 0.22;
    const bottom = this.screenY(HOME_ISLAND.top);
    const top = this.screenY(LAUNCH.y + 0.35);
    for (const offset of [-POLE_OFFSET, POLE_OFFSET]) {
      const poleLeft = this.screenX(LAUNCH.x + offset) - width / 2;
      context.save();
      roundedRectangle(context, poleLeft, top, width, bottom - top, width / 2);
      context.fillStyle = '#ffffff';
      context.fill();
      context.clip();
      context.fillStyle = '#ff5d7a';
      for (let stripe = top - width * 2; stripe < bottom; stripe += width * 1.6) {
        context.beginPath();
        context.moveTo(poleLeft, stripe);
        context.lineTo(poleLeft + width, stripe - width * 0.6);
        context.lineTo(poleLeft + width, stripe + width * 0.2);
        context.lineTo(poleLeft, stripe + width * 0.8);
        context.fill();
      }
      context.restore();
      context.fillStyle = '#ffd23f';
      context.beginPath();
      context.arc(poleLeft + width / 2, top, width * 0.75, 0, Math.PI * 2);
      context.fill();
    }
  }

  private sprite(key: string, width: number, height: number, draw: (context: Context, width: number, height: number) => void): HTMLCanvasElement {
    let cached = this.sprites.get(key);
    if (!cached) {
      const ratio = this.pixelRatio;
      cached = bitmap(width * ratio, height * ratio, (context) => {
        context.scale(ratio, ratio);
        draw(context, width, height);
      });
      this.sprites.set(key, cached);
    }
    return cached;
  }

  private blockSprite(block: BlockData): HTMLCanvasElement {
    const width = block.width * this.scale;
    const height = block.height * this.scale;
    const colours = this.colours();
    return this.sprite(`block:${block.material}:${block.width}:${block.height}:${block.motif}`, width, height, (context) => {
      const line = Math.max(1, this.scale * 0.05);
      if (block.material === 'wood') {
        roundedRectangle(context, line / 2, line / 2, width - line, height - line, Math.min(width, height) * 0.22);
        context.fillStyle = colours.wood[block.motif]!;
        context.fill();
        context.strokeStyle = 'rgba(70,40,20,0.45)';
        context.lineWidth = line;
        context.stroke();
        // Grain along the long side, then the painted motif: star, dot or moon (§9).
        context.strokeStyle = 'rgba(255,255,255,0.28)';
        context.lineWidth = line * 0.7;
        const along = width > height;
        for (const fraction of [0.3, 0.68]) {
          context.beginPath();
          if (along) {
            context.moveTo(width * 0.12, height * fraction);
            context.lineTo(width * 0.88, height * fraction);
          } else {
            context.moveTo(width * fraction, height * 0.1);
            context.lineTo(width * fraction, height * 0.9);
          }
          context.stroke();
        }
        const size = Math.min(width, height) * 0.3;
        context.fillStyle = 'rgba(255,248,230,0.92)';
        if (block.motif === 0) star(context, width / 2, height / 2, size);
        else if (block.motif === 1) {
          context.beginPath();
          context.arc(width / 2, height / 2, size * 0.6, 0, Math.PI * 2);
        } else {
          context.beginPath();
          context.arc(width / 2, height / 2, size * 0.75, Math.PI * 0.3, Math.PI * 1.7);
          context.arc(width / 2 + size * 0.35, height / 2, size * 0.6, Math.PI * 1.55, Math.PI * 0.45, true);
        }
        context.fill();
      } else if (block.material === 'marble') {
        roundedRectangle(context, line / 2, line / 2, width - line, height - line, Math.min(width, height) * 0.1);
        context.fillStyle = '#c7bedb';
        context.fill();
        context.strokeStyle = '#857ba3';
        context.lineWidth = line * 1.3;
        context.stroke();
        context.save();
        context.clip();
        context.strokeStyle = 'rgba(255,255,255,0.6)';
        context.lineWidth = line;
        for (let vein = 0; vein < 3; vein++) {
          context.beginPath();
          context.moveTo(-2, height * (0.2 + vein * 0.3));
          context.bezierCurveTo(width * 0.3, height * (0.5 - vein * 0.15), width * 0.6, height * (vein * 0.4), width + 2, height * (0.3 + vein * 0.25));
          context.stroke();
        }
        context.strokeStyle = 'rgba(110,98,150,0.35)';
        context.beginPath();
        context.moveTo(width * 0.1, height);
        context.bezierCurveTo(width * 0.4, height * 0.4, width * 0.5, height * 0.9, width * 0.9, 0);
        context.stroke();
        context.restore();
      } else {
        roundedRectangle(context, line, line, width - line * 2, height - line * 2, line * 2);
        context.fillStyle = 'rgba(205,240,255,0.55)';
        context.fill();
        const rainbow = context.createLinearGradient(0, 0, width, height);
        ['#ff6b8b', '#ffb84d', '#fff35c', '#6be38a', '#5cc8ff', '#b28bff'].forEach((colour, index, all) => rainbow.addColorStop(index / (all.length - 1), colour));
        context.strokeStyle = rainbow;
        context.lineWidth = line * 1.6;
        context.stroke();
        // Facets: lines from each corner to an inner rectangle, and one bright glint.
        context.strokeStyle = 'rgba(255,255,255,0.8)';
        context.lineWidth = line * 0.6;
        const inset = Math.min(width, height) * 0.28;
        context.beginPath();
        context.rect(inset, inset, width - inset * 2, height - inset * 2);
        for (const [cornerX, cornerY, innerX, innerY] of [[0, 0, inset, inset], [width, 0, width - inset, inset], [0, height, inset, height - inset], [width, height, width - inset, height - inset]] as const) {
          context.moveTo(cornerX, cornerY);
          context.lineTo(innerX, innerY);
        }
        context.stroke();
      }
    });
  }

  private balloonSprite(colour: string): HTMLCanvasElement {
    const radius = BALLOON.radius * this.scale;
    return this.sprite(`balloon:${colour}`, radius * 2.2, radius * 2.5, (context) => {
      const centerX = radius * 1.1;
      const centerY = radius * 1.1;
      context.fillStyle = colour;
      context.beginPath();
      context.moveTo(centerX - radius * 0.18, centerY + radius * 1.2);
      context.lineTo(centerX + radius * 0.18, centerY + radius * 1.2);
      context.lineTo(centerX, centerY + radius * 0.95);
      context.fill();
      context.beginPath();
      context.ellipse(centerX, centerY, radius * 0.95, radius, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(0,0,0,0.18)';
      context.lineWidth = Math.max(1, radius * 0.08);
      context.stroke();
      // The gloss is the balloon's: a hard specular and a painted star (§9).
      context.fillStyle = 'rgba(255,255,255,0.9)';
      context.beginPath();
      context.ellipse(centerX - radius * 0.38, centerY - radius * 0.42, radius * 0.22, radius * 0.32, -0.6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.55)';
      star(context, centerX + radius * 0.15, centerY + radius * 0.2, radius * 0.3);
      context.fill();
    });
  }

  private pomSprite(kind: PomKind, small: boolean): HTMLCanvasElement {
    const radius = (small ? SMALL_PUFF : POMS[kind]).radius * this.scale;
    return this.sprite(`pom:${kind}:${small}`, radius * 2.6, radius * 2.6, (context) => {
      const center = radius * 1.3;
      const colour = POM_COLOURS[kind];
      context.lineCap = 'round';
      if (kind === 'puff') {
        // Scalloped edge: a ring of bumps around a cream core.
        context.fillStyle = colour;
        context.strokeStyle = '#d9c7a0';
        context.lineWidth = Math.max(1, radius * 0.08);
        context.beginPath();
        for (let bump = 0; bump < 8; bump++) {
          const angle = (bump / 8) * Math.PI * 2;
          context.moveTo(center + Math.cos(angle) * radius * 0.72 + radius * 0.34, center + Math.sin(angle) * radius * 0.72);
          context.arc(center + Math.cos(angle) * radius * 0.72, center + Math.sin(angle) * radius * 0.72, radius * 0.34, 0, Math.PI * 2);
        }
        context.stroke();
        context.fill();
        context.beginPath();
        context.arc(center, center, radius * 0.8, 0, Math.PI * 2);
        context.fill();
        return;
      }
      context.fillStyle = colour;
      context.beginPath();
      context.arc(center, center, radius * 0.92, 0, Math.PI * 2);
      context.fill();
      if (kind === 'thud') {
        // A tightly wound yarn ball: crossing arcs.
        context.strokeStyle = '#c98a10';
        context.lineWidth = Math.max(1, radius * 0.1);
        for (let turn = 0; turn < 4; turn++) {
          context.beginPath();
          context.ellipse(center, center, radius * 0.85, radius * (0.25 + turn * 0.15), turn * 0.8, 0, Math.PI * 2);
          context.stroke();
        }
        return;
      }
      // Pom and Zip are fuzzy: short strands all round the edge.
      context.strokeStyle = colour;
      context.lineWidth = Math.max(1, radius * 0.16);
      for (let strand = 0; strand < 22; strand++) {
        const angle = (strand / 22) * Math.PI * 2;
        context.beginPath();
        context.moveTo(center + Math.cos(angle) * radius * 0.8, center + Math.sin(angle) * radius * 0.8);
        context.lineTo(center + Math.cos(angle) * radius * 1.2, center + Math.sin(angle) * radius * 1.2);
        context.stroke();
      }
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.beginPath();
      context.arc(center - radius * 0.3, center - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
      context.fill();
    });
  }

  // ---- events -> particles --------------------------------------------------------------

  private emit(count: number, make: () => Omit<Particle, 'life'>): void {
    for (let index = 0; index < count && this.particles.length < MAX_PARTICLES; index++) {
      const particle = make();
      this.particles.push({ ...particle, life: particle.maxLife });
    }
  }

  react(events: SimEvent[], reducedMotion: boolean): void {
    const share = reducedMotion ? 0.5 : 1;
    const spread = (amount: number) => (Math.random() - 0.5) * amount;
    for (const event of events) {
      if (event.type === 'shatter') {
        this.emit(Math.round(16 * share), () => ({ kind: Math.random() < 0.6 ? 'sparkle' : 'shard', x: event.x + spread(event.width), y: event.y + spread(event.height), velocityX: spread(6), velocityY: Math.random() * 4, maxLife: 0.9, size: 0.12 + Math.random() * 0.12, colour: ['#ff6b8b', '#ffd34d', '#6be38a', '#5cc8ff', '#b28bff'][Math.floor(Math.random() * 5)]!, spin: spread(10) }));
      } else if (event.type === 'knock' && event.strength > 2) {
        this.emit(Math.round(3 * share), () => ({ kind: 'puff', x: event.x, y: event.y, velocityX: spread(2), velocityY: Math.random(), maxLife: 0.5, size: 0.18, colour: event.material === 'marble' ? '#e4def0' : '#fff3df', spin: 0 }));
      } else if (event.type === 'miss' || event.type === 'splash') {
        this.emit(Math.round(6 * share), () => ({ kind: 'puff', x: event.x + spread(1.2), y: 0.6, velocityX: spread(1.5), velocityY: 1 + Math.random(), maxLife: 0.9, size: 0.45, colour: '#ffffff', spin: 0 }));
      } else if (event.type === 'fade') {
        this.emit(Math.round(6 * share), () => ({ kind: 'puff', x: event.x + spread(0.4), y: event.y + spread(0.4), velocityX: spread(1.5), velocityY: Math.random(), maxLife: 0.6, size: 0.25, colour: POM_COLOURS[event.kind], spin: 0 }));
      } else if (event.type === 'free') {
        this.emit(Math.round(8 * share), () => ({ kind: 'sparkle', x: event.x + spread(1), y: event.y + spread(1), velocityX: spread(2), velocityY: 1 + Math.random() * 2, maxLife: 0.8, size: 0.14, colour: '#fff7b0', spin: spread(6) }));
      } else if (event.type === 'boing') {
        this.emit(Math.round(4 * share), () => ({ kind: 'sparkle', x: event.x, y: event.y, velocityX: spread(4), velocityY: spread(4), maxLife: 0.4, size: 0.1, colour: '#ffffff', spin: 0 }));
      } else if (event.type === 'trick') {
        this.emit(Math.round(8 * share), () => ({ kind: 'sparkle', x: event.x, y: event.y, velocityX: spread(5), velocityY: spread(5), maxLife: 0.5, size: 0.12, colour: POM_COLOURS[event.kind], spin: spread(8) }));
      } else if (event.type === 'ready') {
        this.hop = 1;
      } else if (event.type === 'land') {
        this.flaps[event.island] = 1;
      } else if (event.type === 'complete') {
        this.flaps = this.flaps.map(() => 1);
        this.emit(Math.round(40 * share), () => ({ kind: 'confetti', x: 14 + Math.random() * 16, y: FIELD_HEIGHT + Math.random() * 2, velocityX: spread(2), velocityY: -1 - Math.random() * 2, maxLife: 3, size: 0.16, colour: BALLOON_COLOURS[Math.floor(Math.random() * 5)]!, spin: spread(8) }));
      }
    }
  }

  // ---- the frame ------------------------------------------------------------------------

  draw(frame: FrameState, delta: number): void {
    const context = this.context;
    const { sim, alpha } = frame;
    context.setTransform(1, 0, 0, 1, 0, 0);
    if (this.background) context.drawImage(this.background, 0, 0);
    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    const lerp = (previous: Pose, x: number, y: number, angle: number): Pose => ({ x: previous.x + (x - previous.x) * alpha, y: previous.y + (y - previous.y) * alpha, angle: previous.angle + (angle - previous.angle) * alpha });

    // The last trail stays as faint dots while the kid aims the next (§8).
    this.dots(sim.phase === 'flight' ? sim.lastTrail : sim.trail, 0.09, 'rgba(255,255,255,0.55)');
    this.drawBunting(frame.seconds, delta);
    for (const block of sim.blocks) {
      const position = block.body.getPosition();
      this.place(this.blockSprite(block.data), lerp(block.previous, position.x, position.y, block.body.getAngle()), block.data.width * this.scale, block.data.height * this.scale);
    }
    this.drawBalloons(frame, false);
    this.drawFlinger(frame);
    for (const pom of sim.poms) {
      const position = pom.body.getPosition();
      const pose = lerp(pom.previous, position.x, position.y, pom.body.getAngle());
      if (pom.kind === 'zip') this.zipTail(pose, pom.body.getLinearVelocity(), pom.radius);
      const size = pom.radius * 2.6 * this.scale;
      this.place(this.pomSprite(pom.kind, pom.small), pose, size, size);
    }
    this.dots(frame.preview, 0.12, '#ffffff', true);
    this.drawParticles(delta);
    this.drawBalloons(frame, true);
    context.setTransform(1, 0, 0, 1, 0, 0);
    if (this.cloudFront) context.drawImage(this.cloudFront, 0, 0);
    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    if (frame.tapRing) this.drawTapRing(frame.tapRing, frame.seconds, frame.keyboard);
    if (frame.ghost !== null) this.drawGhost(frame.ghost);
  }

  private place(sprite: HTMLCanvasElement, pose: Pose, width: number, height: number): void {
    const context = this.context;
    context.save();
    context.translate(this.screenX(pose.x), this.screenY(pose.y));
    context.rotate(-pose.angle);
    context.drawImage(sprite, -width / 2, -height / 2, width, height);
    context.restore();
  }

  private dots(points: Point[], radius: number, colour: string, outlined = false): void {
    const context = this.context;
    context.fillStyle = colour;
    context.strokeStyle = 'rgba(40,70,90,0.45)';
    context.lineWidth = Math.max(1, this.scale * 0.04);
    points.forEach((point, index) => {
      context.beginPath();
      context.arc(this.screenX(point.x), this.screenY(point.y), Math.max(1.5, radius * this.scale * (outlined ? 1 - index / (points.length * 1.6) : 1)), 0, Math.PI * 2);
      context.fill();
      if (outlined) context.stroke();
    });
  }

  private drawBalloons(frame: FrameState, freed: boolean): void {
    const context = this.context;
    const level = frame.sim.level;
    for (const balloon of frame.sim.balloons) {
      if (balloon.freed !== freed) continue;
      const worldX = balloon.previous.x + (balloon.x - balloon.previous.x) * frame.alpha;
      const worldY = balloon.previous.y + (balloon.y - balloon.previous.y) * frame.alpha;
      if (this.screenY(worldY) < -this.scale * 3) continue;
      // Pinned balloons bob by squashing in place; free ones sway as they rise (§7a).
      const bob = frame.reducedMotion ? 0 : Math.sin(frame.seconds * 3 + balloon.index * 1.7) * 0.04;
      const squash = Math.min(0.3, balloon.squash * 0.3) + (freed ? 0 : bob);
      const sway = freed && !frame.reducedMotion ? Math.sin(frame.seconds * 2 + balloon.index) * 0.15 : 0;
      const radius = BALLOON.radius * this.scale;
      const screenX = this.screenX(worldX + sway);
      const screenY = this.screenY(worldY);
      context.strokeStyle = 'rgba(80,80,90,0.6)';
      context.lineWidth = Math.max(1, this.scale * 0.03);
      context.beginPath();
      context.moveTo(screenX, screenY + radius * 1.15);
      context.quadraticCurveTo(screenX + radius * 0.3 * Math.sin(frame.seconds * 4 + balloon.index), screenY + radius * 1.6, screenX, screenY + radius * 2);
      context.stroke();
      const width = radius * 2.2 * (1 + squash * 0.7);
      const height = radius * 2.5 * (1 - squash);
      context.drawImage(this.balloonSprite(BALLOON_COLOURS[(level.id + balloon.index) % BALLOON_COLOURS.length]!), screenX - width / 2, screenY - radius * 1.1 * (1 - squash), width, height);
    }
  }

  /** The woven ribbon between the pole tops, stretched to the pom and thinning as it does (§7a). */
  private drawFlinger(frame: FrameState): void {
    const context = this.context;
    const sim = frame.sim;
    const pulled = frame.aim ?? (frame.ghost !== null ? { angle: 30, power: Math.sin(frame.ghost * Math.PI) * 0.8 } : null);
    const pom = Renderer.pulledPom(sim.phase === 'ready' ? pulled : null);
    const power = sim.phase === 'ready' ? (pulled?.power ?? 0) : 0;
    context.strokeStyle = '#ff9fb5';
    context.lineCap = 'round';
    context.lineWidth = this.scale * (0.26 - power * 0.14);
    context.beginPath();
    context.moveTo(this.screenX(LAUNCH.x - POLE_OFFSET), this.screenY(LAUNCH.y + 0.3));
    context.lineTo(this.screenX(pom.x), this.screenY(pom.y));
    context.lineTo(this.screenX(LAUNCH.x + POLE_OFFSET), this.screenY(LAUNCH.y + 0.3));
    context.stroke();
    context.strokeStyle = 'rgba(255,255,255,0.7)';
    context.lineWidth *= 0.3;
    context.stroke();
    if (sim.phase === 'ready') {
      this.hop = Math.max(0, this.hop - 0.05);
      pom.y += Math.sin(this.hop * Math.PI) * 0.6;
      const kind = sim.kind;
      const size = POMS[kind].radius * 2.6 * this.scale;
      // The pom squashes into the ribbon as it is pulled.
      const squash = 1 - power * 0.18;
      context.drawImage(this.pomSprite(kind, false), this.screenX(pom.x) - (size / 2) * (2 - squash), this.screenY(pom.y) - (size / 2) * squash, size * (2 - squash), size * squash);
    }
  }

  private zipTail(pose: Pose, velocity: Point, radius: number): void {
    const context = this.context;
    const speed = Math.hypot(velocity.x, velocity.y) || 1;
    const length = Math.min(1.6, 0.4 + speed * 0.05);
    context.strokeStyle = '#8fd0ff';
    context.lineWidth = radius * this.scale * 0.5;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(this.screenX(pose.x), this.screenY(pose.y));
    const tailX = pose.x - (velocity.x / speed) * length;
    const tailY = pose.y - (velocity.y / speed) * length;
    context.quadraticCurveTo(this.screenX((pose.x + tailX) / 2 + (velocity.y / speed) * 0.2), this.screenY((pose.y + tailY) / 2 - (velocity.x / speed) * 0.2), this.screenX(tailX), this.screenY(tailY));
    context.stroke();
  }

  /** Bunting along each island's front edge: the crowd, flapping when blocks fall (§9). */
  private drawBunting(seconds: number, delta: number): void {
    const context = this.context;
    const islands = this.islands();
    islands.forEach((island, index) => {
      this.flaps[index] = Math.max(0, (this.flaps[index] ?? 0) - delta * 0.6);
      const flap = this.flaps[index]!;
      const left = this.screenX(island.left + 0.2);
      const right = this.screenX(island.right - 0.2);
      const stringY = this.screenY(island.top) + this.scale * 0.42;
      const flags = Math.max(3, Math.floor((island.right - island.left) / 0.7));
      context.strokeStyle = 'rgba(120,80,60,0.6)';
      context.lineWidth = Math.max(1, this.scale * 0.03);
      context.beginPath();
      context.moveTo(left, stringY);
      context.quadraticCurveTo((left + right) / 2, stringY + this.scale * 0.35, right, stringY);
      context.stroke();
      for (let flag = 0; flag < flags; flag++) {
        const fraction = (flag + 0.5) / flags;
        const flagX = left + (right - left) * fraction;
        const sag = stringY + this.scale * 0.35 * 2 * fraction * (1 - fraction) * 2 * 0.5;
        const swing = Math.sin(seconds * 9 + flag) * flap * 0.6 + Math.sin(seconds * 1.5 + flag) * 0.05;
        context.save();
        context.translate(flagX, sag);
        context.rotate(swing);
        context.fillStyle = BALLOON_COLOURS[flag % BALLOON_COLOURS.length]!;
        context.beginPath();
        context.moveTo(-this.scale * 0.16, 0);
        context.lineTo(this.scale * 0.16, 0);
        context.lineTo(0, this.scale * 0.34);
        context.fill();
        context.restore();
      }
    });
  }

  private drawParticles(delta: number): void {
    const context = this.context;
    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index]!;
      particle.life -= delta;
      if (particle.life <= 0) {
        this.particles.splice(index, 1);
        continue;
      }
      particle.x += particle.velocityX * delta;
      particle.y += particle.velocityY * delta;
      if (particle.kind === 'shard' || particle.kind === 'confetti') particle.velocityY -= (particle.kind === 'shard' ? 9 : 1) * delta;
      const fade = particle.life / particle.maxLife;
      const particleX = this.screenX(particle.x);
      const particleY = this.screenY(particle.y);
      const size = particle.size * this.scale;
      context.globalAlpha = Math.min(1, fade * 1.5);
      context.fillStyle = particle.colour;
      if (particle.kind === 'puff') {
        context.beginPath();
        context.arc(particleX, particleY, size * (1.6 - fade * 0.6), 0, Math.PI * 2);
        context.fill();
      } else if (particle.kind === 'sparkle') {
        star(context, particleX, particleY, size * 1.4, size * 0.4, 4);
        context.fill();
      } else {
        context.save();
        context.translate(particleX, particleY);
        context.rotate(particle.spin * (particle.maxLife - particle.life));
        context.fillRect(-size / 2, -size / 3, size, size * (particle.kind === 'shard' ? 0.6 : 0.5));
        context.restore();
      }
    }
    context.globalAlpha = 1;
  }

  /** §7a: the first time a trick appears, a pulsing ring (a Space keycap) where the solution taps. */
  private drawTapRing(point: Point, seconds: number, keyboard: boolean): void {
    const context = this.context;
    const ringX = this.screenX(point.x);
    const ringY = this.screenY(point.y);
    const pulse = (seconds * 1.4) % 1;
    context.strokeStyle = `rgba(255,255,255,${1 - pulse})`;
    context.lineWidth = Math.max(2, this.scale * 0.08);
    context.beginPath();
    context.arc(ringX, ringY, this.scale * (0.5 + pulse * 0.9), 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = '#ffffff';
    context.beginPath();
    context.arc(ringX, ringY, this.scale * 0.5, 0, Math.PI * 2);
    context.stroke();
    if (!keyboard) return;
    const width = this.scale * 1.6;
    const height = this.scale * 0.55;
    roundedRectangle(context, ringX - width / 2, ringY + this.scale * 0.8, width, height, height * 0.3);
    context.fillStyle = 'rgba(255,255,255,0.92)';
    context.fill();
    context.strokeStyle = '#7f93a6';
    context.lineWidth = Math.max(1, this.scale * 0.04);
    context.stroke();
    context.beginPath();
    context.moveTo(ringX - width * 0.3, ringY + this.scale * 0.8 + height * 0.62);
    context.lineTo(ringX + width * 0.3, ringY + this.scale * 0.8 + height * 0.62);
    context.stroke();
  }

  /** §3: a ghost hand pulls the pom back and lets go, looping until the first input. */
  private drawGhost(phase: number): void {
    const context = this.context;
    const pom = Renderer.pulledPom({ angle: 30, power: Math.sin(phase * Math.PI) * 0.8 });
    const handX = this.screenX(pom.x) - this.scale * 0.1;
    const handY = this.screenY(pom.y) + this.scale * 0.2;
    const unit = this.scale * 0.32;
    context.globalAlpha = phase < 0.9 ? 0.85 : (1 - phase) * 8;
    context.fillStyle = '#ffe0c2';
    context.strokeStyle = '#9a6a4a';
    context.lineWidth = Math.max(1, this.scale * 0.04);
    roundedRectangle(context, handX - unit * 0.6, handY, unit * 1.6, unit * 2, unit * 0.6);
    context.fill();
    context.stroke();
    roundedRectangle(context, handX - unit * 0.25, handY - unit * 1.3, unit * 0.55, unit * 1.6, unit * 0.27);
    context.fill();
    context.stroke();
    context.globalAlpha = 1;
  }
}
