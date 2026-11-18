// Grid helpers for authoring towers (§B): every block is placed by its bottom edge on the
// top edge of what it stands on, so a tower starts exactly touching — no overlaps for the
// solver to push apart, no gaps for a block to drop into.

import { BALLOON, BALLOON_GAP, REST_GAP } from '../sim/constants.js';
import type { BlockDef, Material, Pt } from '../sim/types.js';

export const COL = 0.5; // column thickness
export const SLAB = 0.5; // plank thickness
export const PANE = 0.3; // crystal pane thickness

export class Tower {
  readonly blocks: BlockDef[] = [];
  readonly balloons: Pt[] = [];
  private motif = 0;

  /**
   * A block centred on cx standing on a surface at `bottom` (at Box2D's resting gap above
   * it). Returns its top edge, the surface the next block stands on.
   */
  box(material: Material, cx: number, bottom: number, w: number, h: number): number {
    const y0 = bottom + REST_GAP;
    this.blocks.push({ x: cx, y: y0 + h / 2, w, h, material, motif: this.motif++ % 3 });
    return y0 + h;
  }

  /** An upright column. */
  col(cx: number, bottom: number, h: number, material: Material = 'wood', w = COL): number {
    return this.box(material, cx, bottom, w, h);
  }

  /** A flat plank or lid. */
  plank(cx: number, bottom: number, w: number, material: Material = 'wood', h = SLAB): number {
    return this.box(material, cx, bottom, w, h);
  }

  /**
   * Two columns `span` apart (centre to centre) under a roof `roof` wide. Returns the top of
   * the roof and the underside a balloon presses against.
   */
  arch(
    cx: number,
    bottom: number,
    o: { span: number; height: number; roof: number; col?: Material; top?: Material; colW?: number; roofH?: number },
  ): { top: number; under: number } {
    const colW = o.colW ?? COL;
    this.col(cx - o.span / 2, bottom, o.height, o.col ?? 'wood', colW);
    this.col(cx + o.span / 2, bottom, o.height, o.col ?? 'wood', colW);
    const under = bottom + o.height;
    const top = this.plank(cx, under, o.roof, o.top ?? 'wood', o.roofH ?? SLAB);
    return { top, under };
  }

  /** A balloon pressed up against an underside at height `under`, exactly touching. */
  balloonUnder(x: number, under: number): void {
    this.balloons.push({ x, y: under - BALLOON.radius - BALLOON_GAP });
  }

  /** A balloon resting on a floor at height `floor` (for bays where it is held sideways). */
  balloonAt(x: number, y: number): void {
    this.balloons.push({ x, y });
  }
}
