// DOM overlays in the site's frosted-glass family (§9): the wordless HUD (the basket, ↺, mute,
// pause), and the pause, results and map cards. Every button has an icon, so blanked strings
// leave the game playable (§11). Menus work with the arrows, Enter/Space and Esc (§10).

import { LEVELS, LEVELS_PER_ISLE } from '../data/levels.js';
import { formatNumber, translate, type StringKey } from '../i18n/index.js';
import { BALLOON_COLOURS, ISLE_COLOURS } from '../render/palette.js';
import type { Save } from '../save/save.js';
import type { PomKind } from '../sim/types.js';
import { ICONS, balloonIcon, pomIcon } from './icons.js';

export type Toggle = 'sound' | 'music' | 'motion' | 'longAim';
export type Overlay = 'pause' | 'results' | 'map';

export interface UiActions {
  pause(): void;
  resume(): void;
  restart(): void;
  skip(): void;
  toggle(setting: Toggle): void;
  openMap(): void;
  play(level: number): void;
}

export interface UiState {
  save: Save;
  reducedMotion: boolean;
  canSkip: boolean;
}

/** A card's buttons ignore presses this soon after it opens, so a held key or a double tap cannot fire them. */
const CARD_GUARD_MS = 300;
/** The parade shows this many balloons, then a number. */
const PARADE_SHOWN = 24;

function element<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className: string, html = ''): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  node.className = className;
  node.innerHTML = html;
  return node;
}

function iconButton(className: string, icon: string, label: string, onPress: () => void, ariaLabel = label): HTMLButtonElement {
  const button = element('button', className, `<span class="icon">${icon}</span>${label ? `<span class="label">${label}</span>` : ''}`);
  button.type = 'button';
  if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
  button.addEventListener('click', onPress);
  return button;
}

const starsHtml = (stars: number) => [0, 1, 2].map((index) => `<span class="icon">${index < stars ? ICONS.star : ICONS.starEmpty}</span>`).join('');

export class Ui {
  readonly touch: HTMLDivElement;
  overlay: Overlay | null = null;
  private readonly root: HTMLElement;
  private readonly basket: HTMLElement;
  private readonly mute: HTMLButtonElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly scrim: HTMLElement;
  private openedAt = 0;
  /** Set while a fling drag is live and just after: a button must not take its release (§10). */
  dragEndedAt = -Infinity;

  constructor(
    root: HTMLElement,
    private readonly actions: UiActions,
    private readonly state: () => UiState,
  ) {
    this.root = root;
    this.touch = element('div', 'touch');
    this.touch.tabIndex = 0;
    this.touch.setAttribute('role', 'application');
    this.touch.setAttribute('aria-label', translate('aria.game'));
    const hud = element('div', 'hud');
    this.basket = element('div', 'pill basket');
    this.restartButton = this.hudButton(ICONS.restart, translate('aria.restart'), () => actions.restart());
    this.mute = this.hudButton(ICONS.soundOn, '', () => actions.toggle('sound'));
    const right = element('div', 'hud-right');
    right.append(this.restartButton, this.mute, this.hudButton(ICONS.pause, translate('aria.pause'), () => actions.pause()));
    hud.append(this.basket, right);
    this.scrim = element('div', 'scrim hidden');
    this.scrim.addEventListener('keydown', (event) => this.cardKeys(event));
    root.append(this.touch, hud, this.scrim);
  }

  private hudButton(icon: string, label: string, action: () => void): HTMLButtonElement {
    return iconButton('round', icon, '', () => {
      if (performance.now() - this.dragEndedAt > 250) action();
      // Hand the keys back to the field, so a later Space flings rather than presses this again.
      if (!this.overlay) this.touch.focus({ preventScroll: true });
    }, label);
  }

  setMuted(muted: boolean): void {
    this.mute.querySelector('.icon')!.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn;
    this.mute.setAttribute('aria-label', translate(muted ? 'aria.unmute' : 'aria.mute'));
  }

  /** The basket: the level's poms in order, the one in the ribbon raised, the used ones faded (§5). */
  setBasket(basket: PomKind[], current: number): void {
    const key = `${basket.join()}:${current}`;
    if (this.basket.dataset.key === key) return;
    this.basket.dataset.key = key;
    this.basket.innerHTML = basket.map((kind, index) => `<span class="icon pom${index === current ? ' current' : index < current ? ' used' : ''}" aria-label="${translate(`pom.${kind}` as StringKey)}">${pomIcon(kind)}</span>`).join('');
  }

  /** §8: after four empty flings with the world at rest, ↺ pulses gently. */
  setStuck(stuck: boolean): void {
    this.restartButton.classList.toggle('pulse', stuck);
  }

  private card(className: string, children: HTMLElement[]): void {
    const card = element('div', `card ${className}`);
    card.setAttribute('role', 'dialog');
    card.append(...children);
    this.scrim.replaceChildren(card);
    this.scrim.classList.remove('hidden');
    this.root.classList.add('menu-open');
    this.openedAt = performance.now();
    this.focusCard();
  }

  private guarded(className: string, icon: string, label: string, action: () => void, ariaLabel = label): HTMLButtonElement {
    return iconButton(className, icon, label, () => {
      if (performance.now() - this.openedAt >= CARD_GUARD_MS) action();
    }, ariaLabel);
  }

  openPause(): void {
    this.overlay = 'pause';
    const state = this.state();
    const settings = state.save.settings;
    const toggle = (setting: Toggle, icon: string, key: StringKey, pressed: boolean) => {
      const button = iconButton('toggle', icon, translate(key), () => {
        this.actions.toggle(setting);
        button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
      });
      button.setAttribute('aria-pressed', String(pressed));
      button.append(element('span', 'switch'));
      return button;
    };
    const buttons = element('div', 'row');
    buttons.append(
      iconButton('wide primary', ICONS.play, translate('pause.resume'), () => this.actions.resume()),
      iconButton('wide', ICONS.restart, translate('pause.restart'), () => this.actions.restart()),
      iconButton('wide', ICONS.map, translate('pause.map'), () => this.actions.openMap()),
    );
    // §5: after three restarts or twelve flings, the pause card grows a ⏭ to the next tower.
    if (state.canSkip) buttons.append(this.guarded('wide skip', ICONS.skip, translate('pause.skip'), () => this.actions.skip()));
    const toggles = element('div', 'toggles');
    toggles.append(
      toggle('sound', ICONS.soundOn, 'settings.sound', !settings.muted),
      toggle('music', ICONS.music, 'settings.music', settings.music),
      toggle('motion', ICONS.motion, 'settings.motion', state.reducedMotion),
      toggle('longAim', ICONS.aim, 'settings.longAim', settings.longAim),
    );
    this.card('card-pause', [element('h2', '', translate('pause.title')), buttons, toggles]);
  }

  /** §3: stars, a pom icon beside the flings, a pulsing ▶. No words. */
  openResults(level: number, stars: number, flings: number): void {
    this.overlay = 'results';
    const starRow = element('div', 'result-stars', starsHtml(stars));
    starRow.setAttribute('aria-label', translate('aria.levelStars', { level: formatNumber(level), stars: formatNumber(stars) }));
    const count = element('div', 'result-flings', `<span class="icon">${pomIcon(LEVELS[level - 1]!.basket[0]!)}</span><b>${formatNumber(flings)}</b>`);
    count.setAttribute('aria-label', translate('aria.flings', { flings: formatNumber(flings) }));
    const buttons = element('div', 'row');
    const last = level >= LEVELS.length;
    buttons.append(
      this.guarded('again primary', last ? ICONS.map : ICONS.play, '', () => (last ? this.actions.openMap() : this.actions.play(level + 1)), translate(last ? 'pause.map' : 'results.next')),
      this.guarded('round big-ish', ICONS.restart, '', () => this.actions.play(level), translate('results.again')),
      this.guarded('round big-ish', ICONS.map, '', () => this.actions.openMap(), translate('pause.map')),
    );
    this.card('card-results', [starRow, count, buttons]);
  }

  /** §5: the parade of every balloon ever freed, over four isles of five balloon nodes. */
  openMap(focusLevel: number): void {
    this.overlay = 'map';
    const save = this.state().save;
    const shown = Math.min(PARADE_SHOWN, save.parade);
    const parade = element('div', 'parade', Array.from({ length: shown }, (_, index) => `<span class="icon">${balloonIcon(BALLOON_COLOURS[index % BALLOON_COLOURS.length]!)}</span>`).join('') + (save.parade > 0 ? `<b>${formatNumber(save.parade)}</b>` : ''));
    parade.setAttribute('aria-label', translate('aria.parade', { count: formatNumber(save.parade) }));
    const isles = Array.from({ length: LEVELS.length / LEVELS_PER_ISLE }, (_, isle) => {
      const row = element('div', 'isle');
      row.style.setProperty('--sky', `linear-gradient(90deg, ${ISLE_COLOURS[isle]!.skyTop}, ${ISLE_COLOURS[isle]!.skyBottom})`);
      row.setAttribute('aria-label', translate(`isle.${isle}` as StringKey));
      row.setAttribute('role', 'group');
      for (let column = 0; column < LEVELS_PER_ISLE; column++) {
        const level = isle * LEVELS_PER_ISLE + column + 1;
        const record = save.levels[level];
        const open = level <= save.open;
        const label = translate(record ? 'aria.levelStars' : open ? 'aria.level' : 'aria.levelLocked', { level: formatNumber(level), stars: formatNumber(record?.stars ?? 0) });
        const node = this.guarded(`node${record ? ' done' : open ? ' open' : ''}`, open ? balloonIcon(BALLOON_COLOURS[(column + isle * 2) % BALLOON_COLOURS.length]!, !!record || level === focusLevel) : ICONS.lock, '', () => this.actions.play(level), label);
        node.insertAdjacentHTML('beforeend', `<span class="number">${formatNumber(level)}</span><span class="stars">${record ? starsHtml(record.stars) : ''}</span>`);
        node.disabled = !open;
        node.dataset.row = String(isle);
        node.dataset.column = String(column);
        node.dataset.level = String(level);
        row.append(node);
      }
      return row;
    });
    const back = iconButton('wide back', ICONS.back, translate('common.back'), () => this.back());
    back.dataset.row = String(isles.length);
    this.card('card-map', [parade, ...isles, back]);
    this.scrim.querySelector<HTMLButtonElement>(`[data-level="${focusLevel}"]:not([disabled])`)?.focus({ preventScroll: true });
  }

  close(): void {
    this.overlay = null;
    this.scrim.classList.add('hidden');
    this.scrim.replaceChildren();
    this.root.classList.remove('menu-open');
    this.touch.focus({ preventScroll: true });
  }

  /** Esc: one step back toward play. */
  back(): void {
    if (this.overlay === 'pause') this.actions.resume();
    else if (this.overlay === 'results') this.actions.openMap();
    else if (this.overlay === 'map') this.actions.resume();
  }

  private cardKeys(event: KeyboardEvent): void {
    const buttons = [...this.scrim.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
    const focused = document.activeElement as HTMLButtonElement;
    const index = buttons.indexOf(focused);
    if (event.key === 'Escape') {
      event.preventDefault();
      this.back();
    } else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
      const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
      if (vertical && focused?.dataset.row !== undefined) {
        // The map is a grid: up and down keep the column, skipping rows with nothing open.
        const row = Number(focused.dataset.row);
        const column = Number(focused.dataset.column ?? 0);
        const target = buttons
          .filter((button) => button.dataset.row !== undefined && Math.sign(Number(button.dataset.row) - row) === step)
          .sort((first, second) => Math.abs(Number(first.dataset.row) - row) - Math.abs(Number(second.dataset.row) - row) || Math.abs(Number(first.dataset.column ?? 0) - column) - Math.abs(Number(second.dataset.column ?? 0) - column))[0];
        target?.focus();
      } else buttons[(index + step + buttons.length) % buttons.length]?.focus();
    }
  }

  /** Bring focus back to the open card: a click on the scrim can drop it. */
  focusCard(): void {
    (this.scrim.querySelector<HTMLButtonElement>('.primary') ?? this.scrim.querySelector<HTMLButtonElement>('button:not([disabled])'))?.focus({ preventScroll: true });
  }
}
