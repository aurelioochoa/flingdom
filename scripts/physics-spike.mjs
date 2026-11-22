// The design's first build task (§12): settle a 40-block tower in planck and in matter-js for
// 30 s, and fire a fast Zip at a thin pane in each. Planck wins unless matter-js passes both.
//
//   npm run spike
import assert from 'node:assert/strict';
import { Box, Circle, Vec2, World } from 'planck';
import Matter from 'matter-js';

const STEPS_30_SECONDS = 1800;
const ZIP_SPEED = 160;

// ---- planck: a 5 × 8 stack of 1 m blocks, then a bullet at a 8 cm pane ------------------
const planckWorld = new World(Vec2(0, -10));
planckWorld.createBody({ position: Vec2(10, -0.5) }).createFixture(Box(12, 0.5));
const planckBlocks = [];
for (let row = 0; row < 5; row++) {
  for (let column = 0; column < 8; column++) {
    const block = planckWorld.createDynamicBody({ position: Vec2(3 + column * 1.5, 0.5 + row) });
    block.createFixture(Box(0.5, 0.5), { density: 1, friction: 0.6 });
    planckBlocks.push({ block, startX: 3 + column * 1.5, startY: 0.5 + row });
  }
}
for (let step = 0; step < STEPS_30_SECONDS; step++) planckWorld.step(1 / 60, 8, 3);
const planckDrift = Math.max(...planckBlocks.map(({ block, startX, startY }) => Math.hypot(block.getPosition().x - startX, block.getPosition().y - startY)));
const planckAsleep = planckBlocks.every(({ block }) => !block.isAwake());

const paneWorld = new World(Vec2(0, 0));
paneWorld.createBody({ position: Vec2(6, 0) }).createFixture(Box(0.04, 2));
const bullet = paneWorld.createDynamicBody({ position: Vec2(0, 0), linearVelocity: Vec2(ZIP_SPEED, 0), bullet: true });
bullet.createFixture(Circle(0.2), 1);
let planckHit = false;
paneWorld.on('begin-contact', () => (planckHit = true));
for (let step = 0; step < 10; step++) paneWorld.step(1 / 60, 8, 3);

// ---- matter-js: the same tower and the same shot, 40 px to the metre ---------------------
const engine = Matter.Engine.create({ enableSleeping: true });
engine.gravity.y = 1;
Matter.Composite.add(engine.world, Matter.Bodies.rectangle(400, 640, 1000, 40, { isStatic: true }));
const matterBlocks = [];
for (let row = 0; row < 5; row++) {
  for (let column = 0; column < 8; column++) {
    const block = Matter.Bodies.rectangle(140 + column * 60, 600 - row * 40, 40, 40, { friction: 0.6 });
    matterBlocks.push({ block, startX: block.position.x, startY: block.position.y });
    Matter.Composite.add(engine.world, block);
  }
}
for (let step = 0; step < STEPS_30_SECONDS; step++) Matter.Engine.update(engine, 1000 / 60);
const matterDrift = Math.max(...matterBlocks.map(({ block, startX, startY }) => Math.hypot(block.position.x - startX, block.position.y - startY) / 40));

const shotEngine = Matter.Engine.create();
shotEngine.gravity.y = 0;
const pane = Matter.Bodies.rectangle(240, 0, 3.2, 160, { isStatic: true });
const zip = Matter.Bodies.circle(0, 0, 8);
Matter.Body.setVelocity(zip, { x: (ZIP_SPEED / 60) * 40, y: 0 });
Matter.Composite.add(shotEngine.world, [pane, zip]);
let matterHit = false;
Matter.Events.on(shotEngine, 'collisionStart', () => (matterHit = true));
for (let step = 0; step < 10; step++) Matter.Engine.update(shotEngine, 1000 / 60);

const result = { planck: { driftMetres: planckDrift, asleep: planckAsleep, zipHitsPane: planckHit }, matter: { driftMetres: matterDrift, zipHitsPane: matterHit } };
console.log(JSON.stringify(result, null, 2));
assert.ok(planckDrift < 0.05 && planckAsleep && planckHit, 'planck must hold the tower still and catch the Zip');
assert.ok(!matterHit, 'matter-js caught the Zip too: revisit the engine decision (§12)');
console.log('physics spike: OK, planck (matter-js lets the Zip through the pane)');
