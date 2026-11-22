// Flingdom: the loop and the glue between sim, renderer, sound and menus. The sim steps at a
// fixed 60 Hz from an accumulator, at most four steps a frame, so a slow device runs slower,
// never coarser (§12); the renderer interpolates whatever the display rate is.

import './ui/style.css';
import { ISLE_POMS, LEVELS, LEVELS_PER_ISLE } from './data/levels.js';
import { CANCEL_POWER, FULL_PULL_PIXELS, LONG_PREVIEW_SECONDS, MAX_ANGLE, MIN_ANGLE, STEP_SECONDS } from './sim/constants.js';
import { canSkip, freshVisit, looksStuck, previewSeconds, recordFling, recordRestart, starsFor } from './sim/rules.js';
import { FlingSim, clampAngle, clampPower, previewFlight, type SimEvent } from './sim/sim.js';
import type { LevelData, Point } from './sim/types.js';
import { Renderer } from './render/renderer.js';
import { Sound } from './audio/sound.js';
import { Ui, type Toggle } from './ui/ui.js';
import { detectLanguage, getLanguage, setBlank, setLanguage } from './i18n/index.js';
import { loadSave, nextLevel, recordFinish, recordSkip, writeSave } from './save/save.js';

type Phase = 'play' | 'paused' | 'results' | 'map';

const parameters = new URLSearchParams(location.search);
setLanguage(detectLanguage());
if (parameters.get('blank') === '1') setBlank(true);
document.documentElement.lang = { no: 'nb', zh: 'zh-Hans' }[getLanguage() as string] ?? getLanguage();

const loaded = loadSave();
const save = loaded.save;
const settings = save.settings;
const persist = () => writeSave(loaded);
const sound = new Sound();
sound.setMuted(settings.muted);
sound.setMusic(settings.music);

const systemMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const reducedMotion = () => settings.reducedMotion ?? systemMotion?.matches ?? false;

const app = document.getElementById('app')!;
const canvas = document.getElementById('field') as HTMLCanvasElement;
const renderer = new Renderer(canvas);

let level: LevelData = LEVELS[0]!;
let sim = new FlingSim(level);
let visit = freshVisit();
let phase: Phase = 'play';
/** Where Esc from the map or pause goes back to. */
let phaseUnderMenu: Phase = 'play';
/** §10: the keyboard aim persists across flings and restarts. */
const keyboardAim = { angle: 30, power: 0.6 };
let keyboardActive = false;
let drag: { id: number; startX: number; startY: number; angle: number; power: number } | null = null;
let anyInput = false;
let completeSeconds = -1;
let fanfarePlayed = false;
let holdSeconds = 0;
let seconds = 0;
let tapRing: Point | null = null;
let accumulator = 0;
let last = performance.now();
let pixelRatio = Math.min(2, window.devicePixelRatio || 1);
let slowFrames = 0;
let preview: { key: string; dots: Point[] } = { key: '', dots: [] };

const ui = new Ui(
  app,
  {
    pause: () => pause(),
    resume: () => resume(),
    restart: () => restart(),
    skip: () => skip(),
    toggle: (setting) => toggle(setting),
    openMap: () => openMap(),
    play: (id) => start(id),
  },
  () => ({ save, reducedMotion: reducedMotion(), canSkip: canSkip(visit) }),
);
ui.setMuted(settings.muted);
app.classList.toggle('reduced', reducedMotion());
systemMotion?.addEventListener?.('change', () => app.classList.toggle('reduced', reducedMotion()));

function resize(): void {
  renderer.resize(app.clientWidth, app.clientHeight, pixelRatio);
}
window.addEventListener('resize', resize);

// Focus the game so keys reach it, but not inside a frame: there the host page focuses us
// (the site's /play does), and a frame may not take focus without a gesture.
let framed = true;
try {
  framed = window.self !== window.top;
} catch {
  framed = true;
}

// ---- levels and phases ----------------------------------------------------------------

/** §7a: the first time a kid meets a trick, a ring where the solution taps. Once. */
function tapRingFor(data: LevelData): Point | null {
  const trick = ISLE_POMS[data.isle]!;
  const shot = data.solution.find((candidate) => candidate.tap !== undefined);
  if ((data.id - 1) % LEVELS_PER_ISLE !== 0 || trick === 'pom' || save.tricks.includes(trick) || !shot) return null;
  return previewFlight(trick, shot.angle, shot.power, shot.tap! * STEP_SECONDS).at(-1) ?? null;
}

function start(id: number): void {
  const fresh = id !== level.id;
  level = LEVELS[id - 1]!;
  if (fresh) visit = freshVisit();
  else recordRestart(visit);
  sim = new FlingSim(level);
  renderer.setLevel(level);
  tapRing = tapRingFor(level);
  completeSeconds = -1;
  fanfarePlayed = false;
  holdSeconds = 0;
  drag = null;
  accumulator = 0;
  phase = 'play';
  if (ui.overlay) ui.close();
  sound.resume();
}

function restart(): void {
  if (phase === 'paused' || phase === 'play') start(level.id);
}

function skip(): void {
  recordSkip(save, level.id);
  persist();
  if (level.id < LEVELS.length) start(level.id + 1);
  else openMap();
}

function pause(): void {
  if (phase !== 'play') return;
  phaseUnderMenu = 'play';
  phase = 'paused';
  cancelDrag();
  sound.suspend();
  ui.openPause();
}

function openMap(): void {
  if (phase !== 'map') phaseUnderMenu = phase === 'paused' ? 'play' : phase;
  phase = 'map';
  cancelDrag();
  ui.openMap(sim.complete ? Math.min(LEVELS.length, level.id + 1) : level.id);
}

/** Back from pause or the map to whatever was under them. */
function resume(): void {
  sound.resume();
  last = performance.now();
  phase = phaseUnderMenu;
  if (phase === 'results') showResults();
  else ui.close();
}

function showResults(): void {
  phase = 'results';
  ui.openResults(level.id, starsFor(sim.flings, level.solution.length), sim.flings);
}

function toggle(setting: Toggle): void {
  sound.unlock();
  if (setting === 'sound') {
    settings.muted = !settings.muted;
    sound.setMuted(settings.muted);
    ui.setMuted(settings.muted);
  } else if (setting === 'music') {
    settings.music = !settings.music;
    sound.setMusic(settings.music);
  } else if (setting === 'motion') {
    settings.reducedMotion = !reducedMotion();
    app.classList.toggle('reduced', reducedMotion());
  } else settings.longAim = !settings.longAim;
  persist();
}

// ---- events from the sim ----------------------------------------------------------------

function onEvents(events: SimEvent[]): void {
  for (const event of events) {
    if (event.type === 'launch') {
      sound.thwip(event.power);
      if (!save.hints.flung) {
        save.hints.flung = true;
        persist();
      }
    } else if (event.type === 'trick') {
      sound.whoosh();
      if (tapRing && !save.tricks.includes(event.kind)) {
        save.tricks.push(event.kind);
        persist();
      }
      tapRing = null;
    } else if (event.type === 'knock') sound.knock(event.material === 'marble' ? 'marble' : 'wood', event.material === 'crystal' ? 0.1 : event.size, event.strength);
    else if (event.type === 'shatter') sound.tinkle();
    else if (event.type === 'boing') sound.boing();
    else if (event.type === 'free') sound.whistle(event.order, event.total);
    else if (event.type === 'miss' || event.type === 'splash') sound.pff();
    else if (event.type === 'hold' && !reducedMotion()) holdSeconds = 0.06;
    else if (event.type === 'ready') recordFling(visit, sim.freed > sim.freedAtLaunch);
    else if (event.type === 'complete') {
      recordFling(visit, true);
      recordFinish(save, level.id, starsFor(sim.flings, level.solution.length), sim.flings, level.balloons.length);
      persist();
      completeSeconds = 0;
    }
  }
  renderer.react(events, reducedMotion());
}

// ---- input --------------------------------------------------------------------------------

function markInput(): void {
  sound.unlock();
  if (!anyInput) {
    anyInput = true;
    sound.startMusic();
  }
}

function fling(angle: number, power: number): void {
  if (phase === 'play' && power >= CANCEL_POWER) sim.fire(angle, power);
}

function trick(): void {
  if (phase === 'play') sim.trick();
}

function cancelDrag(): void {
  drag = null;
  sound.stopRibbon();
}

/** ↑ ↓ aim a degree a press, ← → pull further or let in 2 % a press (§10); held, faster. */
const AIM_KEYS: Record<string, { angle: number; power: number }> = {
  ArrowUp: { angle: 1, power: 0 },
  ArrowDown: { angle: -1, power: 0 },
  ArrowLeft: { angle: 0, power: 0.02 },
  ArrowRight: { angle: 0, power: -0.02 },
};
const heldAimKeys = new Map<string, number>();
let lastClick = 0;

function nudgeAim(change: { angle: number; power: number }): void {
  const angle = Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, keyboardAim.angle + change.angle));
  const power = Math.max(0.16, Math.min(1, Math.round((keyboardAim.power + change.power) * 1000) / 1000));
  if (angle === keyboardAim.angle && power === keyboardAim.power) return;
  keyboardAim.angle = angle;
  keyboardAim.power = power;
  if (performance.now() - lastClick > 50) {
    lastClick = performance.now();
    sound.click(power);
  }
}

window.addEventListener('keydown', (event) => {
  // The open card already acted on this key (Esc closing it must not pause again).
  if (event.defaultPrevented) return;
  markInput();
  if (event.code === 'KeyM') {
    toggle('sound');
    if (ui.overlay === 'pause') ui.openPause();
    return;
  }
  if (ui.overlay) {
    // Keys on the card act natively; focus that wandered off the card is brought back.
    if ((event.target as HTMLElement).closest?.('.scrim')) return;
    event.preventDefault();
    if (event.key === 'Escape') ui.back();
    else if (ui.overlay === 'pause' && event.code === 'KeyP') resume();
    ui.focusCard();
    return;
  }
  const change = AIM_KEYS[event.code];
  if (change) {
    event.preventDefault();
    keyboardActive = true;
    if (!event.repeat) {
      nudgeAim(change);
      heldAimKeys.set(event.code, performance.now());
    }
  } else if (event.code === 'Space' || event.code === 'Enter') {
    event.preventDefault();
    if (event.repeat) return;
    if (sim.phase === 'flight') trick();
    else {
      keyboardActive = true;
      fling(keyboardAim.angle, keyboardAim.power);
    }
  } else if (event.code === 'KeyR') {
    event.preventDefault();
    restart();
  } else if (event.code === 'KeyP' || event.key === 'Escape') {
    event.preventDefault();
    pause();
  }
});
window.addEventListener('keyup', (event) => heldAimKeys.delete(event.code));

/** §10: press anywhere that isn't a button and drag; the pom moves by the drag. */
ui.touch.addEventListener('pointerdown', (event) => {
  markInput();
  if (phase !== 'play' || drag) return;
  if (sim.phase === 'flight') {
    trick();
    return;
  }
  drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, angle: keyboardAim.angle, power: 0 };
  keyboardActive = false;
  ui.dragEndedAt = Infinity;
  try {
    ui.touch.setPointerCapture(event.pointerId);
  } catch {
    // Not every pointer can be captured; its moves still arrive.
  }
});
ui.touch.addEventListener('pointermove', (event) => {
  if (!drag || drag.id !== event.pointerId) return;
  const across = event.clientX - drag.startX;
  const down = event.clientY - drag.startY;
  drag.power = clampPower(Math.hypot(across, down) / FULL_PULL_PIXELS);
  // Pull back to aim forward: the fling goes opposite to the drag.
  if (Math.hypot(across, down) > 4) drag.angle = Math.round(clampAngle((Math.atan2(down, -across) * 180) / Math.PI) * 10) / 10;
  sound.pull(drag.power);
});
const endDrag = (event: PointerEvent) => {
  if (!drag || drag.id !== event.pointerId) return;
  const { angle, power } = drag;
  cancelDrag();
  ui.dragEndedAt = performance.now();
  // A release near the start cancels (§7a); a cancelled touch never flings.
  if (event.type === 'pointerup') fling(angle, power);
};
ui.touch.addEventListener('pointerup', endDrag);
ui.touch.addEventListener('pointercancel', endDrag);
ui.touch.addEventListener('contextmenu', (event) => event.preventDefault());

// §8: a hidden tab or a lost focus pauses.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    sound.suspend();
  }
});
window.addEventListener('blur', () => {
  heldAimKeys.clear();
  pause();
});

// ---- the loop -------------------------------------------------------------------------------

function currentAim(): { angle: number; power: number } | null {
  if (drag) return drag.power > 0 ? drag : null;
  return keyboardActive && sim.phase === 'ready' ? keyboardAim : null;
}

/** The aim dots come from the engine's own step, recomputed only when the aim changes (§12). */
function previewDots(aim: { angle: number; power: number } | null): Point[] {
  if (!aim || sim.phase !== 'ready' || phase !== 'play' || aim.power < CANCEL_POWER) return [];
  const key = `${aim.angle}:${aim.power}:${sim.kind}:${visit.valve}:${settings.longAim}:${sim.stepCount}`;
  if (preview.key !== key) {
    preview = { key, dots: settings.longAim ? previewFlight(sim.kind, aim.angle, aim.power, LONG_PREVIEW_SECONDS, (point, radius) => sim.touches(point, radius)) : previewFlight(sim.kind, aim.angle, aim.power, previewSeconds(visit)) };
  }
  return preview.dots;
}

function frame(now: number): void {
  const delta = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  seconds += delta;
  // Pixel ratio ≤ 2, dropped to 1 if frames average over 22 ms (§12).
  slowFrames = delta > 0.022 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
  if (slowFrames > 90 && pixelRatio > 1) {
    pixelRatio = 1;
    resize();
  }
  for (const [code, pressedAt] of heldAimKeys) {
    if (now - pressedAt < 300 || phase !== 'play') continue;
    const change = AIM_KEYS[code]!;
    nudgeAim({ angle: change.angle * 40 * delta, power: change.power * 25 * delta });
  }
  // Between presses the aim rests on whole degrees and 2 % steps, the grid the solutions use.
  if (heldAimKeys.size === 0) {
    keyboardAim.angle = Math.round(keyboardAim.angle);
    keyboardAim.power = Math.round(keyboardAim.power * 50) / 50;
  }
  const events: SimEvent[] = [];
  if (phase === 'play' || phase === 'results') {
    if (holdSeconds > 0) holdSeconds -= delta;
    else {
      accumulator = Math.min(accumulator + delta, STEP_SECONDS * 4);
      while (accumulator >= STEP_SECONDS) {
        accumulator -= STEP_SECONDS;
        sim.step();
        events.push(...sim.takeEvents());
      }
    }
  }
  if (events.length) onEvents(events);
  if (completeSeconds >= 0 && phase === 'play') {
    completeSeconds += delta;
    if (completeSeconds > 0.5 && !fanfarePlayed) {
      fanfarePlayed = true;
      sound.fanfare();
    }
    if (completeSeconds > 1.8) showResults();
  }
  ui.setBasket(level.basket, sim.flings % level.basket.length);
  ui.setStuck(!sim.complete && looksStuck(visit, sim.settled()));
  const aim = currentAim();
  renderer.draw(
    {
      sim,
      alpha: accumulator / STEP_SECONDS,
      seconds,
      aim,
      preview: previewDots(aim),
      ghost: !save.hints.flung && !anyInput && phase === 'play' && sim.phase === 'ready' ? (seconds % 2.4) / 2.4 : null,
      tapRing: tapRing && sim.kind === ISLE_POMS[level.isle] && (sim.phase === 'ready' || sim.canTrick()) ? tapRing : null,
      keyboard: keyboardActive,
      reducedMotion: reducedMotion(),
    },
    delta,
  );
  requestAnimationFrame(frame);
}

// §3: a first visit goes straight into level 1; later visits open on the map, next level focused.
start(save.hints.flung ? nextLevel(save) : 1);
resize();
if (save.hints.flung) openMap();
if (!framed && !ui.overlay) ui.touch.focus({ preventScroll: true });
requestAnimationFrame(frame);

// For the headless smoke harness: read-only state, no hooks into the rules.
(window as unknown as { __flingdom: unknown }).__flingdom = {
  get phase() {
    return phase;
  },
  get overlay() {
    return ui.overlay;
  },
  get level() {
    return level.id;
  },
  get solution() {
    return level.solution;
  },
  get aim() {
    return { keyboard: { ...keyboardAim }, drag: drag && { angle: drag.angle, power: drag.power } };
  },
  get sim() {
    return { phase: sim.phase, flings: sim.flings, freed: sim.freed, total: sim.balloons.length, kind: sim.kind, canTrick: sim.canTrick(), stepsSinceLaunch: sim.stepsSinceLaunch, previewDots: preview.dots.length };
  },
  get pixelRatio() {
    return pixelRatio;
  },
};
