// Does the built game work for a kid? Drives the production build (`vite preview` over dist/)
// in headless Chromium with real input (design §12):
//
//   1. desktop 1280×720, keyboard and mouse: a first visit opens straight on tower 1 with the
//      ghost hand; ↑ ↓ ← → aim and Space flings it in one; Enter on ▶ starts tower 2; a short
//      mouse drag cancels; a drag released over the pause button flings and presses nothing; a
//      mouse drag solves tower 2; pause, a switch, the map and M by keys; R restarts;
//   2. the Puff's first tower: its tap ring, then the split by Space in mid-flight;
//   3. phone 390×844 with touch: a tap flings nothing, a touch drag solves tower 1, the 56 px
//      buttons, pause and the map by tap; a landscape phone capture;
//   4. inside an iframe with the site's exact /play/[id] sandbox: keys reach the game, and a
//      drag released outside the frame still flings;
//   5. every string blanked (?blank=1), proving the wordless claim (§11).
//
// Fails on any console error, page error, failed or external request, or a canvas that is one
// flat colour. Every wait is a deadline with polling, never a fixed sleep for a condition.
// Screenshots go to /tmp/flingdom-shots (or $SHOTS), outside the zero-asset source tree.
//
//   npm run build && npm run smoke
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname;
const port = 4600 + (process.pid % 300);
const base = `http://localhost:${port}/`;
const shots = process.env.SHOTS ?? '/tmp/flingdom-shots/';
mkdirSync(shots, { recursive: true });

const failures = [];
const fail = (message) => {
  failures.push(message);
  console.error(`FAIL: ${message}`);
};
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Poll `check` until it returns something truthy or the deadline passes. */
async function until(check, milliseconds, label) {
  const deadline = Date.now() + milliseconds;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await check();
      if (last) return last;
    } catch (error) {
      last = error.message;
    }
    await wait(25);
  }
  throw new Error(`timed out waiting for ${label} (last: ${JSON.stringify(last)})`);
}

const server = spawn(process.execPath, [`${root}node_modules/vite/bin/vite.js`, 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

function watch(page, tag) {
  page.on('console', (message) => message.type() === 'error' && fail(`[${tag}] console error: ${message.text()}`));
  page.on('pageerror', (error) => fail(`[${tag}] page error: ${error.message}`));
  page.on('requestfailed', (request) => fail(`[${tag}] request failed: ${request.url()}`));
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('blob:')) fail(`[${tag}] external request: ${url}`);
  });
}

const state = (frame) =>
  frame.evaluate(() => {
    const game = window.__flingdom;
    return game && { ...game.sim, simPhase: game.sim.phase, phase: game.phase, overlay: game.overlay, level: game.level, solution: game.solution, aim: game.aim };
  });
const saved = (frame) => frame.evaluate(() => JSON.parse(localStorage.getItem('flingdom:save') ?? 'null'));

/** Standard deviation of a screenshot's luminance: 0 means one flat colour. */
async function spread(page) {
  const url = `data:image/png;base64,${(await page.screenshot()).toString('base64')}`;
  return page.evaluate(async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, 160, 90);
    const pixels = context.getImageData(0, 0, 160, 90).data;
    let sum = 0;
    let squares = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const luminance = 0.3 * pixels[index] + 0.59 * pixels[index + 1] + 0.11 * pixels[index + 2];
      sum += luminance;
      squares += luminance * luminance;
    }
    const count = pixels.length / 4;
    return Math.sqrt(squares / count - (sum / count) ** 2);
  }, url);
}

async function painted(page, frame, tag) {
  await until(() => state(frame), 15000, `${tag}: game state`);
  const value = await until(async () => {
    const deviation = await spread(page);
    return deviation > 8 ? deviation : 0;
  }, 15000, `${tag}: a painted canvas`);
  console.log(`[${tag}] canvas painted, luminance spread ${value.toFixed(1)}`);
}

/** Let CSS entrance animations finish so a screenshot shows the settled card. */
async function settled(page, selector) {
  await until(() => page.locator(selector).isVisible(), 5000, selector);
  await until(
    () => page.evaluate((query) => document.querySelector(query).getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity).length === 0, selector),
    4000,
    `${selector} settled`,
  );
}

/** Aim like a kid at the keyboard: ↑ ↓ a degree a press, ← → 2 % a press, until on target. */
async function aimByKeys(page, frame, target) {
  for (let presses = 0; presses < 200; presses++) {
    const { keyboard } = (await state(frame)).aim;
    const angleOff = Math.round(target.angle - keyboard.angle);
    const powerOff = Math.round((target.power - keyboard.power) * 50);
    if (!angleOff && !powerOff) return;
    await page.keyboard.press(angleOff > 0 ? 'ArrowUp' : angleOff < 0 ? 'ArrowDown' : powerOff > 0 ? 'ArrowLeft' : 'ArrowRight');
  }
  throw new Error(`could not aim at ${JSON.stringify(target)}`);
}

/** Pull back to aim forward: the drag vector for a shot, in CSS pixels (§10). */
const dragFor = (shot) => ({ across: -Math.cos((shot.angle * Math.PI) / 180) * shot.power * 120, down: Math.sin((shot.angle * Math.PI) / 180) * shot.power * 120 });

async function mouseDrag(page, from, to, steps = 8) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps);
    await wait(16);
  }
  await page.mouse.up();
}

const readyToFling = (frame) =>
  until(async () => {
    const current = await state(frame);
    return current.phase === 'play' && current.overlay === null && current.simPhase === 'ready';
  }, 8000, 'a pom in the ribbon');
const completeLevel = (frame, label) => until(async () => ((await state(frame)).overlay === 'results' ? state(frame) : null), 15000, label);

try {
  await until(async () => (await fetch(base)).ok, 20000, 'vite preview');

  // ---- 1. desktop, keyboard and mouse ----------------------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    watch(page, 'desktop');
    await page.goto(base);
    await painted(page, page, 'desktop');
    let current = await state(page);
    if (current.level !== 1 || current.overlay !== null) fail(`desktop: a first visit should open straight on tower 1, got ${JSON.stringify(current)}`);
    await page.screenshot({ path: `${shots}desktop-opening.png` });

    // Tower 1 by keys in one fling: three stars and the results card.
    await aimByKeys(page, page, current.solution[0]);
    await page.screenshot({ path: `${shots}desktop-aim.png` });
    if ((await state(page)).previewDots < 5) fail('desktop: keyboard aim should show the dots');
    await page.keyboard.press('Space');
    await until(async () => (await state(page)).flings === 1, 1000, 'Space flings');
    await wait(1100);
    await page.screenshot({ path: `${shots}desktop-tumble.png` });
    current = await completeLevel(page, 'tower 1 complete');
    await settled(page, '.card-results');
    await page.screenshot({ path: `${shots}desktop-results.png` });
    const stars = await page.locator('.result-stars .icon svg path[fill="#ffd23f"]').count();
    let save = await saved(page);
    if (stars !== 3 || save?.levels?.['1']?.stars !== 3 || save.open !== 2) fail(`desktop: one fling at par should be three stars and open tower 2, got ${stars} and ${JSON.stringify(save)}`);
    if (!(await page.evaluate(() => document.activeElement?.classList.contains('primary')))) fail('desktop: ▶ should have focus on the results card');
    console.log('[desktop] tower 1 by keys in one fling: three stars, saved');
    await wait(350);
    await page.keyboard.press('Enter');
    await until(async () => (await state(page)).level === 2 && (await state(page)).overlay === null, 2000, 'Enter on ▶ starts tower 2');

    // §7a: a release within 16 px of the start cancels.
    await readyToFling(page);
    await mouseDrag(page, { x: 700, y: 400 }, { x: 690, y: 405 });
    await wait(300);
    if ((await state(page)).flings !== 0) fail('desktop: a 11 px drag must cancel');
    // §10: a drag released over the pause button flings, and the button ignores the release.
    const pauseBox = await page.locator('.hud .round').nth(2).boundingBox();
    await mouseDrag(page, { x: pauseBox.x - 100, y: pauseBox.y + 160 }, { x: pauseBox.x + 28, y: pauseBox.y + 28 });
    await until(async () => (await state(page)).flings === 1, 1000, 'the drag over the button flings');
    await wait(400);
    if ((await state(page)).overlay !== null) fail('desktop: a release over the pause button must not press it');
    console.log('[desktop] a short drag cancelled; a drag ending on the pause button flung and pressed nothing');

    // R restarts; then tower 2 by a mouse drag at its solution.
    await page.keyboard.press('KeyR');
    await until(async () => (await state(page)).flings === 0, 1000, 'R restarts');
    await readyToFling(page);
    const pull = dragFor((await state(page)).solution[0]);
    await mouseDrag(page, { x: 640, y: 300 }, { x: 640 + pull.across, y: 300 + pull.down });
    const dragged = await completeLevel(page, 'tower 2 complete by a mouse drag');
    console.log(`[desktop] R restarted; a mouse drag solved tower 2 in ${dragged.flings} fling(s)`);
    await page.keyboard.press('Escape');
    await settled(page, '.card-map');

    // Back to play tower 3, then pause by keys: arrows move, Enter flips a switch, Esc resumes.
    await page.screenshot({ path: `${shots}desktop-map.png` });
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    if (!focused?.includes('3')) fail(`desktop: the map should focus tower 3, had "${focused}"`);
    await wait(350);
    await page.keyboard.press('Enter');
    await until(async () => (await state(page)).level === 3 && (await state(page)).overlay === null, 2000, 'Enter on the map starts tower 3');
    await page.keyboard.press('KeyP');
    await settled(page, '.card-pause');
    await page.screenshot({ path: `${shots}desktop-pause.png` });
    for (let step = 0; step < 6; step++) await page.keyboard.press('ArrowDown');
    const before = await page.evaluate(() => document.activeElement?.getAttribute('aria-pressed'));
    await page.keyboard.press('Enter');
    const after = await page.evaluate(() => document.activeElement?.getAttribute('aria-pressed'));
    if (before === null || before === after) fail(`desktop: Enter should flip the focused switch (${before} → ${after})`);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await until(async () => (await state(page)).phase === 'play', 1000, 'Esc resumes');
    await page.keyboard.press('KeyM');
    save = await saved(page);
    if (save?.settings?.muted !== true) fail(`desktop: M should save the mute, got ${JSON.stringify(save?.settings)}`);
    console.log('[desktop] the map by keys, pause → switch → Esc, and M, all saved');
    await context.close();
  }

  // ---- 2. the Puff's first tower: the tap ring, then the split by Space -------------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript(() => {
      if (!localStorage.getItem('flingdom:save')) localStorage.setItem('flingdom:save', JSON.stringify({ v: 1, open: 6, levels: { 1: { stars: 3, fewest: 1 }, 2: { stars: 3, fewest: 1 }, 3: { stars: 3, fewest: 1 }, 4: { stars: 3, fewest: 2 }, 5: { stars: 2, fewest: 4 } }, parade: 9, hints: { flung: true } }));
    });
    const page = await context.newPage();
    watch(page, 'puff');
    await page.goto(base);
    await painted(page, page, 'puff');
    await settled(page, '.card-map');
    await wait(350);
    await page.keyboard.press('Enter');
    await until(async () => (await state(page)).level === 6 && (await state(page)).overlay === null, 2000, 'the map opens tower 6');
    const shot = (await state(page)).solution[0];
    await aimByKeys(page, page, shot);
    await page.screenshot({ path: `${shots}desktop-tap-ring.png` });
    await page.keyboard.press('Space');
    await until(async () => (await state(page)).stepsSinceLaunch >= shot.tap - 1, 3000, 'the tap step');
    await page.keyboard.press('Space');
    await wait(120);
    await page.screenshot({ path: `${shots}desktop-puff-split.png` });
    const current = await completeLevel(page, 'tower 6 complete by a split Puff');
    const save = await saved(page);
    if (current.flings !== 1 || !save.tricks?.includes('puff')) fail(`puff: one split Puff should free all three and mark the trick seen, got ${current.flings} flings, ${JSON.stringify(save.tricks)}`);
    console.log('[puff] the tap ring showed; Space in mid-flight split the Puff and freed all three');
    await context.close();
  }

  // ---- 3. phone, touch -----------------------------------------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    watch(page, 'phone');
    await page.goto(base);
    await painted(page, page, 'phone');
    await page.screenshot({ path: `${shots}phone-opening.png` });
    const cdp = await context.newCDPSession(page);
    const touchDrag = async (from, across, down, steps = 8, hold = false) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
      for (let step = 1; step <= steps; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (across * step) / steps, y: from.y + (down * step) / steps }] });
        await wait(16);
      }
      if (hold) await page.screenshot({ path: `${shots}phone-aim.png` });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await page.touchscreen.tap(200, 500);
    await wait(300);
    if ((await state(page)).flings !== 0) fail('phone: a tap must fling nothing');
    const pull = dragFor((await state(page)).solution[0]);
    await touchDrag({ x: 250, y: 400 }, pull.across, pull.down, 8, true);
    const current = await completeLevel(page, 'tower 1 by touch');
    await settled(page, '.card-results');
    await page.screenshot({ path: `${shots}phone-results.png` });
    console.log(`[phone] a tap flung nothing; a touch drag solved tower 1 in ${current.flings} fling(s)`);
    await wait(350);
    // ▶ breathes forever, so tap its centre like a finger rather than wait for it to be still.
    const next = await page.locator('.card-results .primary').boundingBox();
    await page.touchscreen.tap(next.x + next.width / 2, next.y + next.height / 2);
    await until(async () => (await state(page)).level === 2 && (await state(page)).overlay === null, 2000, 'tap ▶');
    for (const [index, name] of [[0, 'restart'], [1, 'mute'], [2, 'pause']]) {
      const box = await page.locator('.hud .round').nth(index).boundingBox();
      if (!box || box.width < 48 || box.height < 48) fail(`phone: the ${name} button must be at least 48 px, got ${JSON.stringify(box)}`);
    }
    await page.locator('.hud .round').nth(2).tap();
    await settled(page, '.card-pause');
    await page.screenshot({ path: `${shots}phone-pause.png` });
    await page.locator('.card-pause .wide').nth(2).tap();
    await settled(page, '.card-map');
    await page.screenshot({ path: `${shots}phone-map.png` });
    await wait(350);
    await page.locator('.card-map .back').tap();
    await until(async () => (await state(page)).phase === 'play' && (await state(page)).overlay === null, 2000, 'back to play by tap');
    await context.close();

    const landscape = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const wide = await landscape.newPage();
    watch(wide, 'phone-landscape');
    await wide.goto(base);
    await painted(wide, wide, 'phone-landscape');
    await wide.screenshot({ path: `${shots}phone-landscape.png` });
    await landscape.close();
  }

  // ---- 4. inside the site's sandboxed iframe ---------------------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    watch(page, 'iframe');
    await page.route('**/__host.html', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><body style="margin:0;background:#222"><iframe id="game" src="${base}?framed=1" style="border:0;width:1280px;height:720px"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals" allow="fullscreen; autoplay; gamepad"></iframe></body>`,
      }),
    );
    await page.goto(`${base}__host.html`);
    const frame = await until(() => page.frame({ url: (url) => url.href.includes('framed=1') }), 10000, 'game frame');
    await painted(page, frame, 'iframe');
    await page.locator('#game').click({ position: { x: 640, y: 300 } });
    await page.keyboard.press('ArrowUp');
    await until(async () => (await state(frame)).aim.keyboard.angle === 31, 1000, 'keys reach the framed game');
    await page.keyboard.press('KeyM');
    const stored = await frame.evaluate(() => localStorage.getItem('flingdom:save'));
    if (!stored?.includes('"muted":true')) fail(`iframe: the mute should be saved, got ${stored}`);
    // §10: a drag released off the game (here, below the frame) still flings.
    await mouseDrag(page, { x: 600, y: 600 }, { x: 520, y: 760 });
    await until(async () => (await state(frame)).flings === 1, 2000, 'a drag released outside the frame flings');
    await page.screenshot({ path: `${shots}iframe.png` });
    console.log('[iframe] boots, aims, saves, and a drag released outside the frame flings, inside the /play sandbox');
    await context.close();
  }

  // ---- 5. every string blanked ----------------------------------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    watch(page, 'blank');
    await page.goto(`${base}?blank=1`);
    await painted(page, page, 'blank');
    await page.keyboard.press('Space');
    await until(async () => (await state(page)).flings === 1, 1000, 'blank: fling');
    const words = await page.evaluate(() => document.querySelector('.hud').textContent.replace(/[0-9\s]/g, ''));
    if (words) fail(`blank: the play screen should hold no words, found "${words}"`);
    for (const card of ['.card-pause', '.card-map']) {
      if (card === '.card-pause') await page.keyboard.press('KeyP');
      else await page.locator('.card-pause .wide').nth(2).click();
      await settled(page, card);
      const cardWords = await page.evaluate((query) => document.querySelector(query)?.textContent?.replace(/[0-9\s]/g, '') ?? '', card);
      if (cardWords) fail(`blank: ${card} should hold no words, found "${cardWords}"`);
      const iconless = await page.evaluate((query) => [...document.querySelectorAll(`${query} button`)].filter((button) => !button.querySelector('svg')).length, card);
      if (iconless) fail(`blank: ${iconless} buttons on ${card} have no icon`);
      await page.screenshot({ path: `${shots}blank-${card.slice(6)}.png` });
    }
    console.log('[blank] plays, pauses and opens the map with every string blanked; every button has an icon');
    await context.close();
  }
} catch (error) {
  fail(error.message);
} finally {
  await browser.close().catch(() => {});
  server.kill('SIGKILL');
}

if (failures.length) {
  console.error(`\nsmoke: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log(`\nsmoke: OK (screenshots in ${shots})`);
