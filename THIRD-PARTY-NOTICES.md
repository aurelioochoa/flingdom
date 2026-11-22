# Third-Party Notices for Flingdom

Flingdom's own code is licensed under PolyForm Noncommercial 1.0.0 (see `LICENSE.md`). The
dependencies below keep their own licenses.

## Runtime dependency (shipped to players)

- [planck](https://piqnt.com/planck.js/) 1.4.2 — MIT License, Copyright © Erin Catto and Ali
  Shakiba. A JavaScript port of Box2D; the only code in `dist/` that is not Flingdom's own.

## Build / dev dependencies (not shipped to players)

- [TypeScript](https://www.typescriptlang.org/) 5.9.3 — Apache-2.0
- [Vite](https://vite.dev/) 8.2.2 — MIT (its CSS minifier, lightningcss, is MPL-2.0; a
  build tool only — nothing of it is in `dist/`)
- [Vitest](https://vitest.dev/) 4.1.11 — MIT
- [tsx](https://tsx.is/) 4.20.6 — MIT (runs `npm run solve`)
- [matter-js](https://brm.io/matter-js/) 0.20.0 — MIT (only `npm run spike`, the engine
  comparison of design §12)
- [Playwright](https://playwright.dev/) 1.65.0 — Apache-2.0 (the smoke harness only)

Run `npm run check:licenses` to re-verify that every installed dependency carries a
recognised free/open-source license, that the repo holds no asset files, and that `dist/`
contains no live external URL.
