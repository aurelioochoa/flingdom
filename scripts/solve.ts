// `npm run solve -- <level> [angle:power[:tap] ...]` sweeps the next shot headlessly in the
// real engine, after the given shots, and prints the candidates that free the most balloons
// with how many of their eight neighbours (±1°, ±2 % power) free the same, plus the one-shot
// hit rate that orders levels within an isle (§B). A trick pom also sweeps its tap step.

import { LEVELS } from '../src/data/levels.js';
import { playShots } from '../src/sim/replay.js';
import type { Shot } from '../src/sim/types.js';

const [levelArgument, ...prefixArguments] = process.argv.slice(2);
const level = LEVELS.find((candidate) => candidate.id === Number(levelArgument));
if (!level) throw new Error(`usage: npm run solve -- <1-${LEVELS.length}> [angle:power[:tap] ...]`);
const prefix: Shot[] = prefixArguments.map((text) => {
  const [angle, power, tap] = text.split(':').map(Number);
  return { angle: angle!, power: power!, ...(tap === undefined ? {} : { tap }) };
});
const before = playShots(level, prefix).freedAfter.at(-1)?.length ?? 0;
const kind = level.basket[prefix.length % level.basket.length]!;
const taps: (number | undefined)[] = kind === 'pom' ? [undefined] : [undefined, ...Array.from({ length: 14 }, (_, index) => 8 + index * 6)];
const gained = (shot: Shot) => (playShots(level, [...prefix, shot]).freedAfter.at(-1)?.length ?? 0) - before;

const results: { shot: Shot; gain: number }[] = [];
for (let angle = -10; angle <= 74; angle += 2) {
  for (let power = 0.4; power <= 1.0001; power += 0.04) {
    for (const tap of taps) {
      const shot = { angle, power: Math.round(power * 100) / 100, ...(tap === undefined ? {} : { tap }) };
      results.push({ shot, gain: gained(shot) });
    }
  }
}
const best = Math.max(...results.map((result) => result.gain));
const hitRate = results.filter((result) => result.gain > 0).length / results.length;
const robustness = (shot: Shot, gain: number) => {
  let same = 0;
  for (const angleChange of [-1, 0, 1]) {
    for (const powerChange of [-0.02, 0, 0.02]) {
      if (angleChange === 0 && powerChange === 0) continue;
      if (gained({ ...shot, angle: shot.angle + angleChange, power: shot.power + powerChange }) >= gain) same++;
    }
  }
  const tapSame = shot.tap === undefined ? 2 : [-3, 3].filter((change) => gained({ ...shot, tap: shot.tap! + change }) >= gain).length;
  return { same, tapSame };
};
const candidates = results
  .filter((result) => result.gain === best && best > 0)
  .slice(0, 400)
  .map((result) => ({ ...result, ...robustness(result.shot, result.gain) }))
  .sort((first, second) => second.same - first.same || second.tapSame - first.tapSame)
  .slice(0, 12);
console.log(`level ${level.id} (${kind}), ${before} of ${level.balloons.length} freed before this shot; ${results.length} shots swept`);
console.log(`one-shot hit rate ${(hitRate * 100).toFixed(1)} %, best gain ${best}`);
for (const candidate of candidates) console.log(`  ${JSON.stringify(candidate.shot)}  frees +${candidate.gain}, neighbours ${candidate.same}/8, taps ${candidate.tapSame}/2`);
