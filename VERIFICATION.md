# Flingdom verification — 2026-11-22

Measured on this machine (Linux, Node 22.23.3, Playwright 1.65.0 Chromium, headless). Nothing
here was run on a physical phone or Chromebook.

## Engine decision (design §12)

`npm run spike` settles a 40-block tower in both engines for 30 s and fires a 160 m/s bullet at
an 8 cm pane:

| | drift after 30 s | asleep | bullet meets the pane |
|---|---|---|---|
| planck 1.4.2 | 4.6 cm (default 5 mm slop, gaps not authored) | yes | yes |
| matter-js 0.20.0 | 5.1 cm | — | **no, it passes straight through** |

matter-js fails the continuous-collision half, so the house precedent does not win: **planck
1.4.2**, pinned exactly. With the game's 1 mm slop and the builder's exact resting gaps, every
authored tower sleeps within 1.9 s and drifts at most 3.1 mm (table below).

## Automated checks

- **`npm test`**: 8 files, 134 tests, 4.8 s wall (the four isle files run in parallel).
  Final line: `Tests  134 passed (134)`.
  - `src/data/isle-1..4.test.ts` (21, 20, 20, 20): the four §B gates for each of the 20 levels, in the real
    engine, headless — well-formed (inside the field, no overlapping boxes, every balloon
    clear of every box, ≤ 60 bodies, no pom before its isle, each isle's first level carries
    its new pom, taps only on trick poms); at rest (10 s with no shot frees nothing, moves no
    block over 1 cm, all asleep by 4 s); solvable (the stored solution frees every balloon
    within par); robust (each solution shot has ≥ 5 of its 8 neighbours at ±1° / ±2 % that
    free at least the same balloons, and a trick ≥ 1 of its two ±3-step tap neighbours).
    Plus level 1's §3 promise: of the 132 grid shots whose first contact is its tower,
    at least 90 % free the balloon (measured 125, 95 %).
  - `src/sim/sim.test.ts` (19): launch speed linear in the pull; bit-exact replay of level
    5's three shots; **the preview equals the real flight, dot for dot, until first contact,
    for all four poms**; the Long aim line ends at the first contact and nowhere before; the
    basket order and refill; the next pom one second after a miss; a pom puffs away two
    seconds after it comes to rest; a tower at rest makes no sound however heavy; Pom has no
    trick; Puff splits into three at ±12°, once; Zip doubles its velocity; Thud stops going
    forward and is four times heavier; no trick after a touch; one full-power hit topples
    a wooden column, leaves a 1 m marble wall within 10 cm and 0.05 rad, and breaks crystal,
    the only thing that ever breaks; a pom boings off a balloon without moving it; a freed
    balloon rises.
  - `src/sim/rules.test.ts` (5): stars at par / par + 2 / finished; ⏭ after three restarts or
    twelve flings and not before; the silent valve 0.45 → 0.6 → 0.75 → 0.9 s after every
    three empty flings in a row, kept through a restart, reset with a new visit; the stuck
    pulse after four empty flings with the world at rest.
  - `src/save/save.test.ts` (8): the v1 fixture round-trips byte for byte; field-by-field
    fallback; `open` never below the finished levels; stars, parade and `open` rescued from
    corrupt JSON; a newer version's fields and version kept; missing or throwing storage
    tolerated; one key; best stars and fewest flings kept; ⏭ leaves no mark.
  - `src/i18n/i18n.test.ts` (21): eight tables with identical keys and placeholders, none
    empty, none copied from English (single-word names aside), the name never translated,
    blanking, `kidtopia:lang` then the browser (nb/nn → no) then English, a throwing storage.
- **`npm run build`**: `tsc --noEmit`, the Vite build, then `scripts/check-licenses.mjs`:
  55 dependencies with free licenses, zero asset files among 41 scanned, no live external URL
  in `dist/` (the one inert string is the inline favicon's SVG namespace). **272.7 KiB raw,
  69.1 KiB gzip** against the 1024 KiB budget (design: < 1 MiB, expected ~0.3 MiB). Final
  line: `all gates passed`.
- **`npm run smoke`** (the real `dist/` under `vite preview`; fails on any console or page
  error, failed or external request, or a flat canvas):
  - Desktop 1280×720, keyboard and mouse: a first visit opens straight on tower 1; ↑ ↓ ← →
    aim (the dots show) and Space flings it in one: three stars, saved, tower 2 open; Enter on
    the focused ▶ starts tower 2; an 11 px mouse drag cancels; a drag released over the pause
    button flings and the button stays unpressed; R restarts; a mouse drag at tower 2's
    solution clears it; Esc from the results opens the map with tower 3 focused; Enter plays
    it; P, arrows, Enter flips a switch, Esc resumes; M is saved.
  - Tower 6 (the Puff's first): the tap ring shows; Space at the tap step in mid-flight
    splits the Puff, all three balloons go, `puff` is saved as seen.
  - Phone 390×844 with CDP touch: a tap flings nothing; a touch drag at the solution clears
    tower 1; the three corner buttons are 56 px (≥ 48); pause and map by tap; back by tap.
    A landscape 844×390 capture.
  - The site's exact iframe sandbox (`allow-scripts allow-same-origin allow-popups
    allow-forms allow-modals`, `allow="fullscreen; autoplay; gamepad"`): keys reach the
    game, M is saved, and a mouse drag released below the frame still flings.
  - `?blank=1`: the HUD, pause card and map hold no words; every button has an icon.
  - Final line: `smoke: OK (screenshots in /tmp/flingdom-shots/)`.

## The levels (§B)

Authored with the `Tower` grid helpers (`src/data/build.ts`); the solutions were found
headlessly in the real engine by sweeping each next shot (2° × 4 % grid, ten tap steps for a
trick), keeping only outcomes reached by ≥ 3 grid cells, demanding the robust gate, and
backtracking on dead ends. `npm run solve -- <level> [angle:power[:tap] …]` is the committed
form of that sweep: candidates, their neighbours and the one-shot hit rate.

| level | isle | basket | balloons | bodies | par | asleep | drift |
|---|---|---|---|---|---|---|---|
| 1 | 1 | pom | 1 | 4 | 1 (18°/74%) | 0.52 s | 0.01 mm |
| 2 | 1 | pom | 2 | 6 | 1 (28°/74%) | 0.52 s | 0.05 mm |
| 3 | 1 | pom | 1 | 4 | 1 (26°/74%) | 0.52 s | 0.02 mm |
| 4 | 1 | pom | 2 | 8 | 2 (2°/74%, 46°/78%) | 0.52 s | 0.04 mm |
| 5 | 1 | pom | 4 | 16 | 3 (34°/78%, -2°/74%, 40°/90%) | 1.03 s | 0.45 mm |
| 6 | 2 | puff | 3 | 15 | 1 (30°/82% tap 40) | 0.52 s | 0.07 mm |
| 7 | 2 | pom puff | 3 | 13 | 2 (14°/74%, 52°/82% tap 56) | 0.52 s | 0.03 mm |
| 8 | 2 | puff pom | 4 | 18 | 2 (20°/74% tap 40, 44°/86%) | 0.53 s | 0.71 mm |
| 9 | 2 | pom puff pom | 3 | 13 | 2 (58°/86%, 14°/74% tap 8) | 0.55 s | 0.22 mm |
| 10 | 2 | puff pom | 4 | 17 | 2 (48°/78% tap 72, 0°/74%) | 0.52 s | 0.04 mm |
| 11 | 3 | zip | 1 | 8 | 1 (10°/74% tap 8) | 0.52 s | 0.03 mm |
| 12 | 3 | zip pom | 2 | 12 | 2 (2°/70% tap 8, 44°/86%) | 0.52 s | 0.03 mm |
| 13 | 3 | pom zip puff | 4 | 19 | 2 (30°/82%, 22°/74% tap 40) | 0.52 s | 0.03 mm |
| 14 | 3 | zip puff zip | 3 | 17 | 2 (20°/70% tap 8, 8°/74% tap 8) | 0.52 s | 0.04 mm |
| 15 | 3 | zip pom puff zip | 4 | 19 | 2 (10°/70% tap 8, 42°/90%) | 1.07 s | 0.43 mm |
| 16 | 4 | thud | 1 | 3 | 1 (34°/82% tap 80) | 1.87 s | 3.09 mm |
| 17 | 4 | thud pom | 2 | 7 | 2 (30°/74% tap 64, 42°/82%) | 1.87 s | 3.09 mm |
| 18 | 4 | puff zip thud | 4 | 17 | 3 (22°/74% tap 8, 32°/70% tap 40, 30°/82% tap 80) | 1.87 s | 3.09 mm |
| 19 | 4 | zip puff thud | 3 | 14 | 2 (14°/70% tap 8, 20°/86% tap 16) | 1.87 s | 3.09 mm |
| 20 | 4 | zip pom puff thud | 4 | 17 | 4 (4°/74% tap 8, 32°/74%, 30°/74% tap 24, 44°/92% tap 111) | 1.87 s | 3.09 mm |

Par is the solution's length. "asleep" is when every block and pinned balloon of the untouched
tower is asleep; "drift" is the largest block movement over the gate's 10 s. Levels 16–20 share
the lever, whose 3.1 mm is its marble lid settling 0.3 m inside the pedestal's edge.

## Visual review

I looked at every capture in `/tmp/flingdom-shots/` and fixed what was wrong:
`desktop-opening.png`, `desktop-aim.png`, `desktop-tumble.png`, `desktop-results.png`,
`desktop-map.png`, `desktop-pause.png`, `desktop-tap-ring.png`, `desktop-puff-split.png`,
`desktop-level-11.png`, `desktop-level-16.png`, `desktop-level-20.png`,
`desktop-map-full.png`, `phone-opening.png`, `phone-aim.png`, `phone-results.png`,
`phone-pause.png`, `phone-map.png`, `phone-landscape.png`, `iframe.png`, `blank-pause.png`,
`blank-map.png`.

What the review changed: portrait phones had a band of flat white cloud under the field and
then a diagonal staircase of clouds (two correlated sequences); the field now sits lower and
the clouds are scattered by the R2 sequence over however much sky the screen shows. Map
nodes repeated one colour per column; they now shift per isle.

## Defects found and fixed on the way

- Knocks and bunting flaps were driven by total contact impulse, which includes resting load:
  a heavy marble block sitting still knocked every eight steps. Every impact is now measured
  by approach speed × effective mass, and a test holds a resting tower silent.
- A slim marble column could be toppled by a full-power Pom. Marble is now density 16 and
  every marble wall at least 1 m wide; a test holds it within 10 cm of where it stood.
- Arches with spans under 1.6 m left a gap narrower than the balloon, which pushed the posts
  apart (17 cm of drift on one level). Every arch now clears its balloon; the well-formed
  gate checks it.
- Level 1 forgave only 62 % of the shots that reach its tower; tall slim posts under a light
  lid now forgive 95 % (gated at 90 %).
- At start-up the play layer took focus from the map's focused tower; after a mouse click a
  HUD button kept focus, so a later Space would have pressed it again.
- The Commercial License still named Gatecrash.

## Deliberate differences from the design

- **Level 1 forgives 95 %, not every shot that reaches it** (§3). The last 5 % are glancing
  hits that leave the lid on its posts; the test holds the rate at 90 % or better.
- **Not every basket pom is needed by its proven solution.** Towers 13, 15 and 19 carry a pom
  (a Puff, a Puff, a Thud) that their solutions clear the tower without; par is the
  solution's length, so it costs nothing, and the pom still works if a kid reaches for it.
  The finale, tower 20, uses all four, one per island.
- **Zip solutions tap early.** The robust Zip shots tap 8 steps after launch, which doubles
  the speed along a flat line, as the design's "side-on" intends; a later tap works but over
  a narrower window.
- **Crystal breaks on impact only.** The design's crystal "breaks at a firm touch"; an
  earlier draft also crushed it under load, but no tower rests anything on crystal, and the
  Thud's job is the marble lever (a lid balanced 0.3 m inside its post's edge, which only a
  tapped Thud tips: 0 of 495 untapped shots move it in the probe, 46 tapped ones do).
- **A Music switch** joins the pause card's Sound, Calm motion and Long aim line: the design
  lists a music loop but no way to silence it alone.
- **Portrait phones get a small field.** §10 asks for full width under a taller sky, which
  on a 390 px phone is 12 px per metre; landscape is the comfortable way to play.
- **The pixel ratio drops to 1** after 90 net slow frames (each over 22 ms) rather than a
  rolling average; the effect is the same and it needs no buffer.
- **The tap ring sits at the solution's tap point to the nearest three-step dot**, since it
  comes from the same preview function as the aim dots.

## Not verified here

Real devices (a phone, a Chromebook), audio by ear (the synthesis runs without errors in the
smoke, headless), and a replay on Safari's engine (§12 already names that limit).
