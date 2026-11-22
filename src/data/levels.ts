// The twenty authored levels on four isles (§5, §B). A tower's fun is its one weak point,
// which is design, so nothing here is generated. Each row carries its proven solution: the
// shots that free every balloon, held to the four gates in levels.test.ts.

import { REST_GAP } from '../sim/constants.js';
import { Tower } from './build.js';
import type { IslandData, LevelData, PomKind, Shot } from '../sim/types.js';

export const LEVELS_PER_ISLE = 5;
/** Each isle brings one new pom (§7a); its first level makes the trick the obvious answer. */
export const ISLE_POMS: PomKind[] = ['pom', 'puff', 'zip', 'thud'];

function level(id: number, basket: PomKind[], islands: IslandData[], build: (tower: Tower) => void, solution: Shot[]): LevelData {
  const tower = new Tower();
  build(tower);
  return { id, isle: Math.floor((id - 1) / LEVELS_PER_ISLE), basket, islands, blocks: tower.blocks, balloons: tower.balloons, solution };
}

/** A row of wooden columns with a bay at the back, all under one long roof: the Zip's deep stack. */
function deepStack(tower: Tower, front: number, bottom: number, columns: number): void {
  let top = bottom;
  for (let index = 0; index < columns; index++) top = tower.column(front + index * 0.6, bottom, 2.4);
  const back = front + columns * 0.6 + 1.2;
  tower.column(back, bottom, 2.4);
  tower.plank((front + back) / 2, top, back - front + 0.5);
  tower.balloonUnder(back - 0.9, top + REST_GAP);
}

export const LEVELS: LevelData[] = [
  // ---- Dawn isle: the Pom alone teaches the arc ------------------------------------------
  // §3: level 1 forgives any shot that reaches the tower: tall slim posts under a light lid.
  level(1, ['pom'], [{ left: 17, right: 25, top: 4 }], (tower) => {
    tower.column(20.15, 4, 3.2, 'wood', 0.35);
    const top = tower.column(21.85, 4, 3.2, 'wood', 0.35);
    tower.plank(21, top, 2.6, 'wood', 0.3);
    tower.balloonUnder(21, top + REST_GAP);
  }, [{ angle: 18, power: 0.74 }]),
  level(2, ['pom'], [{ left: 17, right: 26, top: 4 }], (tower) => {
    tower.column(19.8, 4, 2.2);
    tower.column(21.5, 4, 2.2);
    const top = tower.column(23.2, 4, 2.2);
    tower.plank(21.5, top, 4.4);
    tower.balloonUnder(20.65, top + REST_GAP);
    tower.balloonUnder(22.35, top + REST_GAP);
  }, [{ angle: 28, power: 0.74 }]),
  level(3, ['pom'], [{ left: 18, right: 25, top: 4.5 }], (tower) => {
    tower.balloonUnder(21.5, tower.arch(21.5, 4.5, 2, 2.2, 2.8, 'crystal').under);
  }, [{ angle: 26, power: 0.74 }]),
  level(4, ['pom'], [{ left: 13, right: 18, top: 3 }, { left: 22, right: 29, top: 6 }], (tower) => {
    tower.balloonUnder(15.5, tower.arch(15.5, 3, 1.8, 2, 2.6).under);
    tower.balloonUnder(25.5, tower.arch(25.5, 6, 2, 2.2, 2.8, 'crystal').under);
  }, [{ angle: 2, power: 0.74 }, { angle: 46, power: 0.78 }]),
  level(5, ['pom'], [{ left: 13, right: 17.5, top: 2.5 }, { left: 19.5, right: 24, top: 5 }, { left: 26, right: 30.5, top: 7.5 }], (tower) => {
    tower.balloonUnder(15.2, tower.arch(15.2, 2.5, 1.8, 2, 2.4).under);
    const middle = tower.arch(21.7, 5, 1.8, 2, 2.4);
    tower.balloonUnder(21.7, middle.under);
    tower.balloonUnder(21.7, tower.arch(21.7, middle.top, 1.6, 1.7, 2.1, 'crystal').under);
    tower.balloonUnder(28.2, tower.arch(28.2, 7.5, 1.8, 2, 2.4, 'crystal').under);
  }, [{ angle: 34, power: 0.78 }, { angle: -2, power: 0.74 }, { angle: 40, power: 0.9 }]),

  // ---- Midday isle: the Puff splits, and cloud-marble arrives -----------------------------
  level(6, ['puff'], [{ left: 16, right: 29, top: 3.5 }], (tower) => {
    [1, 2.2, 3.4].forEach((height, index) => {
      const center = 19 + index * 3.3;
      const plinth = tower.column(center, 3.5, height, 'marble', 1.6);
      tower.balloonUnder(center, tower.arch(center, plinth, 1.6, 1.6, 2.1, 'crystal').under);
    });
  }, [{ angle: 30, power: 0.82, tap: 40 }]),
  level(7, ['pom', 'puff'], [{ left: 15, right: 20, top: 4 }, { left: 22, right: 30, top: 3.5 }], (tower) => {
    tower.balloonUnder(17.5, tower.arch(17.5, 4, 1.8, 2, 2.4).under);
    tower.column(23, 3.5, 4.2, 'marble', 1);
    for (const center of [25.4, 27.8]) tower.balloonUnder(center, tower.arch(center, 3.5, 1.6, 1.8, 2.1, 'crystal').under);
  }, [{ angle: 14, power: 0.74 }, { angle: 52, power: 0.82, tap: 56 }]),
  level(8, ['puff', 'pom'], [{ left: 14, right: 22, top: 3 }, { left: 25, right: 30, top: 7 }], (tower) => {
    const plinth = tower.plank(18, tower.column(18, 3, 1, 'marble', 2.4), 6.4, 'marble', 0.4);
    for (const center of [15.9, 18, 20.1]) tower.balloonUnder(center, tower.arch(center, plinth, 1.5, 1.6, 1.9, 'crystal').under);
    tower.balloonUnder(27.5, tower.arch(27.5, 7, 1.8, 2, 2.4).under);
  }, [{ angle: 20, power: 0.74, tap: 40 }, { angle: 44, power: 0.86 }]),
  level(9, ['pom', 'puff', 'pom'], [{ left: 14, right: 19, top: 6 }, { left: 21, right: 30, top: 3 }], (tower) => {
    tower.balloonUnder(16.5, tower.arch(16.5, 6, 1.8, 2, 2.6).under);
    tower.column(22.1, 3, 4.6, 'marble', 1);
    const far = tower.arch(26.5, 3, 2, 2.4, 2.8);
    tower.balloonUnder(26.5, far.under);
    tower.balloonUnder(26.5, tower.arch(26.5, far.top, 1.6, 1.6, 2.1, 'crystal').under);
  }, [{ angle: 58, power: 0.86 }, { angle: 14, power: 0.74, tap: 8 }]),
  level(10, ['puff', 'pom'], [{ left: 13, right: 17.5, top: 3 }, { left: 19, right: 26.5, top: 5 }], (tower) => {
    tower.balloonUnder(15.2, tower.arch(15.2, 3, 1.8, 2, 2.4).under);
    const plinth = tower.column(22.75, 5, 1.2, 'marble', 6.6);
    for (const center of [20.55, 22.75, 24.95]) tower.balloonUnder(center, tower.arch(center, plinth, 1.6, 1.6, 1.9, 'crystal').under);
  }, [{ angle: 48, power: 0.78, tap: 72 }, { angle: 0, power: 0.74 }]),

  // ---- Afternoon isle: the Zip doubles its speed -------------------------------------------
  level(11, ['zip'], [{ left: 15, right: 28, top: 4 }], (tower) => {
    deepStack(tower, 19, 4, 5);
  }, [{ angle: 10, power: 0.74, tap: 8 }]),
  level(12, ['zip', 'pom'], [{ left: 14, right: 23, top: 3.5 }, { left: 25, right: 30, top: 6.5 }], (tower) => {
    deepStack(tower, 16.5, 3.5, 5);
    tower.balloonUnder(27.5, tower.arch(27.5, 6.5, 1.8, 2, 2.4).under);
  }, [{ angle: 2, power: 0.7, tap: 8 }, { angle: 44, power: 0.86 }]),
  level(13, ['pom', 'zip', 'puff'], [{ left: 13, right: 18, top: 6 }, { left: 19, right: 30, top: 3 }], (tower) => {
    tower.balloonUnder(15.5, tower.arch(15.5, 6, 1.8, 2, 2.4).under);
    deepStack(tower, 20.5, 3, 4);
    for (const center of [26.3, 28.6]) tower.balloonUnder(center, tower.arch(center, 3, 1.6, 1.6, 2, 'crystal').under);
  }, [{ angle: 30, power: 0.82 }, { angle: 22, power: 0.74, tap: 40 }]),
  level(14, ['zip', 'puff', 'zip'], [{ left: 13, right: 23.5, top: 3 }, { left: 25, right: 30.5, top: 7 }], (tower) => {
    deepStack(tower, 15, 3, 6);
    for (const center of [26.5, 29]) tower.balloonUnder(center, tower.arch(center, 7, 1.6, 1.6, 2, 'crystal').under);
  }, [{ angle: 20, power: 0.7, tap: 8 }, { angle: 8, power: 0.74, tap: 8 }]),
  level(15, ['zip', 'pom', 'puff', 'zip'], [{ left: 13, right: 18, top: 5.5 }, { left: 19, right: 25.5, top: 3 }, { left: 27, right: 31, top: 7 }], (tower) => {
    const near = tower.arch(15.5, 5.5, 1.8, 2, 2.4);
    tower.balloonUnder(15.5, near.under);
    tower.balloonUnder(15.5, tower.arch(15.5, near.top, 1.6, 1.6, 2.1, 'crystal').under);
    deepStack(tower, 20, 3, 4);
    tower.balloonUnder(29, tower.arch(29, 7, 1.8, 2, 2.4, 'crystal').under);
  }, [{ angle: 10, power: 0.7, tap: 8 }, { angle: 42, power: 0.9 }]),

  // ---- Sunset isle: the Thud drops, heavy -------------------------------------------------
  level(16, ['thud'], [{ left: 17, right: 28, top: 4 }], (tower) => {
    tower.lever(22, 4);
  }, [{ angle: 34, power: 0.82, tap: 80 }]),
  level(17, ['thud', 'pom'], [{ left: 14, right: 21, top: 3.5 }, { left: 23.5, right: 30, top: 6 }], (tower) => {
    tower.lever(17.5, 3.5);
    tower.balloonUnder(27, tower.arch(27, 6, 1.8, 2.2, 2.6).under);
  }, [{ angle: 30, power: 0.74, tap: 64 }, { angle: 42, power: 0.82 }]),
  level(18, ['puff', 'zip', 'thud'], [{ left: 13, right: 18.5, top: 6 }, { left: 20, right: 30, top: 3 }], (tower) => {
    for (const center of [14.6, 16.9]) tower.balloonUnder(center, tower.arch(center, 6, 1.6, 1.6, 2, 'crystal').under);
    tower.lever(22.5, 3);
    deepStack(tower, 26, 3, 3);
  }, [{ angle: 22, power: 0.74, tap: 8 }, { angle: 32, power: 0.7, tap: 40 }, { angle: 30, power: 0.82, tap: 80 }]),
  level(19, ['zip', 'puff', 'thud'], [{ left: 13, right: 20, top: 3 }, { left: 22, right: 30.5, top: 5 }], (tower) => {
    deepStack(tower, 14.5, 3, 4);
    tower.lever(24, 5);
    tower.balloonUnder(29.3, tower.arch(29.3, 5, 1.6, 1.6, 2, 'crystal').under);
  }, [{ angle: 14, power: 0.7, tap: 8 }, { angle: 20, power: 0.86, tap: 16 }]),
  level(20, ['zip', 'pom', 'puff', 'thud'], [{ left: 13, right: 16.5, top: 7.5 }, { left: 17.5, right: 21.5, top: 4 }, { left: 22, right: 26, top: 2.5 }, { left: 26.5, right: 31, top: 6 }], (tower) => {
    tower.balloonUnder(14.75, tower.arch(14.75, 7.5, 1.8, 2, 2.4).under);
    deepStack(tower, 18, 4, 3);
    tower.balloonUnder(24, tower.arch(24, 2.5, 1.6, 1.8, 2.1, 'crystal').under);
    tower.lever(27.5, 6);
  }, [{ angle: 4, power: 0.74, tap: 8 }, { angle: 32, power: 0.74 }, { angle: 30, power: 0.74, tap: 24 }, { angle: 44, power: 0.92, tap: 111 }]),
];
