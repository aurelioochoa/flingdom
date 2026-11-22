// Colours of the sky kingdom (§9): one bright sky per isle, never dark, and the painted wood,
// balloons and poms. Materials and poms differ by texture and silhouette first, hue second (§D).

export interface IsleColours {
  skyTop: string;
  skyBottom: string;
  sun: string;
  cloud: string;
  cloudShade: string;
  /** Three paints for wood, so neighbouring blocks read apart. */
  wood: [string, string, string];
}

export const ISLE_COLOURS: IsleColours[] = [
  { skyTop: '#ffc9b0', skyBottom: '#fff0e2', sun: '#fff4c8', cloud: '#fffaf4', cloudShade: '#f3d6cf', wood: ['#ff8a65', '#4dc3b5', '#ffc94d'] },
  { skyTop: '#6fd0ea', skyBottom: '#dcf7fb', sun: '#ffffff', cloud: '#ffffff', cloudShade: '#cde9f2', wood: ['#ff7a8a', '#57b8ff', '#ffd25a'] },
  { skyTop: '#ffc861', skyBottom: '#fff2c9', sun: '#fffbe0', cloud: '#fffdf2', cloudShade: '#f3dfb4', wood: ['#e9765b', '#5cc28a', '#7f9cff'] },
  { skyTop: '#f39bb4', skyBottom: '#ffdcc7', sun: '#fff0d0', cloud: '#fff6f2', cloudShade: '#f1c8cf', wood: ['#ff9f5a', '#46b9c9', '#c58cff'] },
];

export const BALLOON_COLOURS = ['#ff4f6d', '#3f9dff', '#ffc928', '#47c96b', '#a974ff'];

export const POM_COLOURS = { pom: '#e8434f', puff: '#fff4d8', zip: '#3d8bff', thud: '#ffc72c' } as const;

export const GRASS = '#79cc57';
export const GRASS_LIGHT = '#a6e27a';
export const CLIFF = '#f4e3c3';
export const TERRACOTTA = '#d9825b';
