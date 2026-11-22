// Inline SVG icons: every button has one, so the game plays with every string blanked (§11).
// No files: the zero-asset rule holds and nothing is requested.

import type { PomKind } from '../sim/types.js';

const svg = (body: string, viewBox = '0 0 24 24') => `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;
const stroke = (path: string, width = 2.6) => `<path d="${path}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const starPath = 'm12 2.8 2.7 5.8 6.3.7-4.7 4.3 1.3 6.3-5.6-3.2-5.6 3.2 1.3-6.3L3 9.3l6.3-.7z';

export const ICONS = {
  pause: svg('<rect x="6" y="5" width="4.2" height="14" rx="1.4"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4"/>'),
  play: svg('<path d="M8 5.2v13.6c0 .8.9 1.3 1.6.8l10-6.8a1 1 0 0 0 0-1.6l-10-6.8C8.9 3.9 8 4.4 8 5.2z"/>'),
  restart: svg(`${stroke('M19 12a7 7 0 1 1-2.05-4.95')}${stroke('M19.5 3.2v5h-5')}`),
  back: svg(stroke('M14.5 5 7.5 12l7 7')),
  skip: svg('<path d="M4 6.2v11.6c0 .8.9 1.2 1.5.7L13 13v4.8c0 .8.9 1.2 1.5.7l6.9-5.8a.9.9 0 0 0 0-1.4l-6.9-5.8c-.6-.5-1.5-.1-1.5.7V11L5.5 5.5C4.9 5 4 5.4 4 6.2z"/>'),
  soundOn: svg(`<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/>${stroke('M15 8.5a5 5 0 0 1 0 7M17.6 6a8.6 8.6 0 0 1 0 12', 2)}`),
  soundOff: svg(`<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/>${stroke('M15.5 9.5l5 5M20.5 9.5l-5 5', 2.2)}`),
  music: svg(`${stroke('M9 17.5V6.2l10-2.2v11.3', 2.2)}<circle cx="6.6" cy="17.6" r="2.8"/><circle cx="16.6" cy="15.6" r="2.8"/>`),
  motion: svg(stroke('M3 8c3-3 6 3 9 0s6 3 9 0M3 16c3-3 6 3 9 0s6 3 9 0', 2.2)),
  /** The Long aim line: a full dotted arc to its landing. */
  aim: svg('<g fill="currentColor"><circle cx="3.5" cy="19" r="1.6"/><circle cx="6.5" cy="12.5" r="1.6"/><circle cx="10.5" cy="8" r="1.6"/><circle cx="15" cy="6.5" r="1.6"/><circle cx="19" cy="9" r="1.6"/></g><path d="M18 14h4v6h-4z" fill="#ff8a65"/>'),
  /** The map: a floating island with a balloon over it. */
  map: svg('<path d="M3 14h18c-1 3-4 5.5-9 7-5-1.5-8-4-9-7z" fill="#d9825b"/><rect x="2.5" y="12.5" width="19" height="2.6" rx="1.3" fill="#79cc57"/><ellipse cx="13" cy="6" rx="3.4" ry="3.8" fill="#ff4f6d"/><path d="M13 9.8v2.7" stroke="#6b6b78" stroke-width="1"/><ellipse cx="11.9" cy="4.8" rx=".8" ry="1.2" fill="#fff" opacity=".9"/>'),
  star: svg(`<path d="${starPath}" fill="#ffd23f" stroke="#e8a317" stroke-width="1"/>`),
  starEmpty: svg(`<path d="${starPath}" fill="rgba(255,255,255,.55)" stroke="#b9c4ce" stroke-width="1.2"/>`),
  lock: svg('<rect x="6" y="11" width="12" height="9" rx="2.2" fill="#c9d3dc"/><path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11" fill="none" stroke="#c9d3dc" stroke-width="2.2"/>'),
};

/** A balloon in a given colour: map nodes and the parade. */
export function balloonIcon(colour: string, open = true): string {
  return open
    ? svg(`<ellipse cx="12" cy="10" rx="7" ry="8" fill="${colour}" stroke="rgba(0,0,0,.18)"/><path d="M11 18h2l-1-1.4z" fill="${colour}"/><path d="M12 18.5c-1 1.5 1 2.5 0 4" fill="none" stroke="#6b6b78" stroke-width="1"/><ellipse cx="9.3" cy="6.8" rx="1.6" ry="2.4" fill="#fff" opacity=".85" transform="rotate(-30 9.3 6.8)"/>`)
    : svg(`<ellipse cx="12" cy="10" rx="7" ry="8" fill="none" stroke="${colour}" stroke-width="1.8" stroke-dasharray="3 2.4"/>`);
}

/** The four poms, told apart by silhouette before colour (§9). */
export function pomIcon(kind: PomKind): string {
  if (kind === 'puff') return svg('<g fill="#fff4d8" stroke="#c9b48a" stroke-width="1"><circle cx="8" cy="9" r="4"/><circle cx="16" cy="9" r="4"/><circle cx="6.5" cy="14.5" r="4"/><circle cx="17.5" cy="14.5" r="4"/><circle cx="12" cy="17" r="4"/></g><circle cx="12" cy="12.5" r="6" fill="#fff4d8"/>');
  if (kind === 'thud') return svg('<circle cx="12" cy="12" r="8.5" fill="#ffc72c"/><g fill="none" stroke="#c98a10" stroke-width="1.4"><ellipse cx="12" cy="12" rx="8" ry="3" transform="rotate(20 12 12)"/><ellipse cx="12" cy="12" rx="8" ry="4.5" transform="rotate(-40 12 12)"/><ellipse cx="12" cy="12" rx="8" ry="6" transform="rotate(75 12 12)"/></g>');
  const colour = kind === 'zip' ? '#3d8bff' : '#e8434f';
  const strands = Array.from({ length: 16 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2;
    return `M${(12 + Math.cos(angle) * 6).toFixed(1)} ${(12 + Math.sin(angle) * 6).toFixed(1)}L${(12 + Math.cos(angle) * 9).toFixed(1)} ${(12 + Math.sin(angle) * 9).toFixed(1)}`;
  }).join('');
  const tail = kind === 'zip' ? '<path d="M5 14c-2 1-3 3-4.5 3.5" fill="none" stroke="#8fd0ff" stroke-width="2.4" stroke-linecap="round"/>' : '';
  return svg(`${tail}<path d="${strands}" stroke="${colour}" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="7" fill="${colour}"/><circle cx="9.5" cy="9.5" r="2" fill="#fff" opacity=".35"/>`);
}
