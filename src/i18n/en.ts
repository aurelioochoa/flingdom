// English, the reference table. Every other language has exactly these keys and the same
// {placeholders} (i18n.test.ts). "Flingdom" is a name and is never translated (§11). The field
// carries no text: these are buttons, the pause card and screen-reader labels only.
export const en = {
  'pause.title': 'Paused',
  'pause.resume': 'Keep playing',
  'pause.restart': 'Start again',
  'pause.map': 'Map',
  'pause.skip': 'Skip to the next tower',
  'results.next': 'Next tower',
  'results.again': 'Again',
  'settings.sound': 'Sound',
  'settings.music': 'Music',
  'settings.motion': 'Calm motion',
  'settings.longAim': 'Long aim line',
  'common.back': 'Back',
  'isle.0': 'Dawn Isle',
  'isle.1': 'Midday Isle',
  'isle.2': 'Afternoon Isle',
  'isle.3': 'Sunset Isle',
  'pom.pom': 'Pom',
  'pom.puff': 'Puff',
  'pom.zip': 'Zip',
  'pom.thud': 'Thud',
  'aria.game': 'Flingdom. Drag back anywhere and let go to fling a pom-pom, or aim with the arrow keys and press Space. Tap or press Space while it flies for its trick.',
  'aria.pause': 'Pause',
  'aria.mute': 'Turn sound off',
  'aria.unmute': 'Turn sound on',
  'aria.restart': 'Start this tower again',
  'aria.level': 'Tower {level}',
  'aria.levelLocked': 'Tower {level}, not open yet',
  'aria.levelStars': 'Tower {level}, {stars} of 3 stars',
  'aria.flings': '{flings} flings',
  'aria.parade': '{count} balloons in the parade',
} as const;

export type StringKey = keyof typeof en;
export type Table = Record<StringKey, string>;
