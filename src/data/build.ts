// Grid helpers for authoring towers (§B): every block is placed by its bottom edge on the top
// edge of what it stands on, at Box2D's resting gap, so a tower starts exactly touching: no
// overlaps for the solver to push apart, no gaps for a block to drop into.

import { BALLOON, BALLOON_GAP, REST_GAP } from '../sim/constants.js';
import type { BlockData, Material, Point } from '../sim/types.js';

const COLUMN = 0.5;
const SLAB = 0.5;
const PANE = 0.3;

export class Tower {
  readonly blocks: BlockData[] = [];
  readonly balloons: Point[] = [];

  /** A block centred on center standing on a surface at `bottom`. Returns its top: the next surface. */
  block(material: Material, center: number, bottom: number, width: number, height: number): number {
    const lowest = bottom + REST_GAP;
    this.blocks.push({ x: center, y: lowest + height / 2, width, height, material, motif: this.blocks.length % 3 });
    return lowest + height;
  }

  column(center: number, bottom: number, height: number, material: Material = 'wood', width = COLUMN): number {
    return this.block(material, center, bottom, width, height);
  }

  plank(center: number, bottom: number, width: number, material: Material = 'wood', height = SLAB): number {
    return this.block(material, center, bottom, width, height);
  }

  /**
   * Two columns `span` apart (centre to centre) under a roof. Returns the top of the roof and
   * the underside a balloon presses up against.
   */
  arch(center: number, bottom: number, span: number, height: number, roof: number, roofMaterial: Material = 'wood', columnMaterial: Material = 'wood'): { top: number; under: number } {
    this.column(center - span / 2, bottom, height, columnMaterial);
    this.column(center + span / 2, bottom, height, columnMaterial);
    const under = bottom + REST_GAP + height;
    // Crystal is a thin pane; wood and marble roofs are slabs.
    return { top: this.plank(center, under, roof, roofMaterial, roofMaterial === 'crystal' ? PANE : SLAB), under: under + REST_GAP };
  }

  /**
   * The Thud's lever (§7a): a marble lid on a wooden pedestal whose left edge is at `left`,
   * its weight just 0.3 m inside that edge and a balloon under its right overhang. Only a
   * heavy drop on the left end tips it over the edge.
   */
  lever(left: number, bottom: number): void {
    const top = this.column(left + 0.5, bottom, 2.2, 'wood', 1);
    this.plank(left + 0.3, top, 4, 'marble');
    this.balloonUnder(left + 1.65, top + REST_GAP);
  }

  /** A balloon floating up against an underside at `under`, exactly touching it. */
  balloonUnder(center: number, under: number): void {
    this.balloons.push({ x: center, y: under - BALLOON.radius - BALLOON_GAP });
  }
}
