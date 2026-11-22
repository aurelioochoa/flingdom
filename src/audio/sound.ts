// All sound is Web Audio synthesis (§9): the ribbon's rising tone, thwip, a trick whoosh,
// knocks pitched by block size, the marble thunk, the crystal tinkle, each balloon's whistle
// and its note of a five-note tune, a fanfare with synthesized applause, and a light loop of
// plucks and glockenspiel. Nothing is loaded. The context is made on the first gesture.

// G major pentatonic: the loop and the balloons share it.
const SCALE = [392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 880.0, 987.77, 1174.66];
/** The balloons' phrase: the last balloon of a level always lands on the home note (§7a). */
const PHRASE = [783.99, 880.0, 987.77, 1174.66, 783.99 * 2];
const PLUCKS = [0, -1, 2, -1, 4, -1, 2, 3, 1, -1, 3, -1, 5, -1, 4, -1];
const BELLS = [-1, -1, -1, -1, -1, -1, 7, -1, -1, -1, -1, -1, -1, -1, 8, -1];

export class Sound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private music: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private ribbon: { oscillator: OscillatorNode; gain: GainNode } | null = null;
  private muted = false;
  private musicOn = true;
  private musicPlaying = false;
  private nextNote = 0;
  private musicStep = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Call from a user gesture. Safe to call again and again. */
  unlock(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
      return;
    }
    try {
      const context = new AudioContext();
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(context.destination);
      this.effects = context.createGain();
      this.effects.gain.value = 0.6;
      this.effects.connect(this.master);
      this.music = context.createGain();
      this.music.gain.value = 0;
      this.music.connect(this.master);
      const length = Math.floor(context.sampleRate);
      this.noise = context.createBuffer(1, length, context.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let index = 0; index < length; index++) samples[index] = Math.random() * 2 - 1;
    } catch {
      this.context = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.context.currentTime, 0.03);
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  suspend(): void {
    this.stopRibbon();
    if (this.context?.state === 'running') void this.context.suspend().catch(() => {});
  }

  resume(): void {
    if (this.context?.state === 'suspended') void this.context.resume().catch(() => {});
  }

  startMusic(): void {
    const context = this.context;
    if (!context || !this.music || !this.musicOn || this.musicPlaying) return;
    this.musicPlaying = true;
    this.music.gain.setTargetAtTime(0.22, context.currentTime, 0.5);
    this.nextNote = context.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 60);
  }

  stopMusic(): void {
    this.musicPlaying = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.context && this.music) this.music.gain.setTargetAtTime(0, this.context.currentTime, 0.2);
  }

  private schedule(): void {
    const context = this.context;
    if (!context || !this.music) return;
    const eighth = 60 / 100 / 2;
    while (this.nextNote < context.currentTime + 0.25) {
      const index = this.musicStep % PLUCKS.length;
      const pluck = PLUCKS[index]!;
      const bell = BELLS[index]!;
      if (pluck >= 0) this.tone(SCALE[pluck]! / 2, SCALE[pluck]! / 2, 0.35, 'triangle', 0.16, this.nextNote, this.music);
      if (bell >= 0) this.bell(SCALE[bell]!, this.nextNote, 0.06, this.music);
      if (index % 8 === 0) this.tone(SCALE[0]! / 4, SCALE[0]! / 4, 0.6, 'sine', 0.14, this.nextNote, this.music);
      this.nextNote += eighth;
      this.musicStep++;
    }
  }

  private tone(from: number, to: number, seconds: number, type: OscillatorType, volume: number, when = -1, out?: AudioNode): void {
    const context = this.context;
    if (!context || !this.effects) return;
    const start = when < 0 ? context.currentTime : when;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    gain.connect(out ?? this.effects);
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, start + seconds);
    oscillator.connect(gain);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.05);
  }

  private hiss(seconds: number, frequency: number, type: BiquadFilterType, volume: number, when = -1, sweepTo = frequency): void {
    const context = this.context;
    if (!context || !this.noise || !this.effects) return;
    const start = when < 0 ? context.currentTime : when;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, start);
    if (sweepTo !== frequency) filter.frequency.exponentialRampToValueAtTime(sweepTo, start + seconds);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    source.connect(filter).connect(gain).connect(this.effects);
    source.start(start, Math.random() * 0.5);
    source.stop(start + seconds + 0.02);
  }

  /** A glockenspiel bar: a sine with its bright inharmonic partial. */
  private bell(frequency: number, when: number, volume: number, out?: AudioNode): void {
    this.tone(frequency * 2, frequency * 2, 0.9, 'sine', volume, when, out);
    this.tone(frequency * 5.4, frequency * 5.4, 0.15, 'sine', volume * 0.3, when, out);
  }

  /** §7a: the ribbon's tone rises with the pull, so the ear knows "a bit less than last time". */
  pull(power: number): void {
    const context = this.context;
    if (!context || !this.effects) return;
    if (!this.ribbon) {
      const oscillator = context.createOscillator();
      oscillator.type = 'triangle';
      const gain = context.createGain();
      gain.gain.value = 0;
      oscillator.connect(gain).connect(this.effects);
      oscillator.start();
      this.ribbon = { oscillator, gain };
    }
    this.ribbon.oscillator.frequency.setTargetAtTime(180 + power * 420, context.currentTime, 0.02);
    this.ribbon.gain.gain.setTargetAtTime(power > 0 ? 0.05 + power * 0.06 : 0, context.currentTime, 0.03);
  }

  stopRibbon(): void {
    if (!this.ribbon || !this.context) return;
    const ribbon = this.ribbon;
    this.ribbon = null;
    ribbon.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
    ribbon.oscillator.stop(this.context.currentTime + 0.15);
  }

  /** A keyboard aim step: one click, pitched by the pull. */
  click(power: number): void {
    this.tone(900 + power * 900, 700 + power * 700, 0.03, 'square', 0.05);
  }

  thwip(power: number): void {
    this.stopRibbon();
    this.tone(180, 360 + power * 500, 0.12, 'triangle', 0.25);
    this.hiss(0.12, 900, 'bandpass', 0.15, -1, 2500);
  }

  whoosh(): void {
    this.hiss(0.35, 600, 'bandpass', 0.3, -1, 3500);
    this.tone(500, 1100, 0.2, 'sine', 0.1);
  }

  /** Wood knocks on a pitch set by its size; marble only thunks (§7a). */
  knock(material: 'wood' | 'marble', size: number, strength: number): void {
    const volume = Math.min(0.35, 0.06 + strength * 0.015);
    if (material === 'marble') {
      this.tone(110, 70, 0.25, 'sine', volume * 1.2);
      this.hiss(0.08, 400, 'lowpass', volume * 0.6);
      return;
    }
    const pitch = 620 / Math.sqrt(Math.max(0.15, size));
    this.tone(pitch, pitch * 0.8, 0.09, 'triangle', volume);
    this.hiss(0.04, pitch * 3, 'bandpass', volume * 0.5);
  }

  tinkle(): void {
    const context = this.context;
    if (!context) return;
    [2093, 2637, 3136, 2349, 3520].forEach((frequency, index) => this.tone(frequency, frequency, 0.5, 'sine', 0.07, context.currentTime + index * 0.035));
    this.hiss(0.25, 6000, 'highpass', 0.12);
  }

  boing(): void {
    this.tone(220, 520, 0.18, 'sine', 0.16);
  }

  /** A miss drops into the clouds with a soft pff; nothing descends to mean "wrong" (§8). */
  pff(): void {
    this.hiss(0.3, 900, 'lowpass', 0.18);
  }

  /** A freed balloon: a squeaky whistle, then its note of the five-note tune. */
  whistle(order: number, total: number): void {
    const context = this.context;
    if (!context) return;
    this.tone(900, 1700, 0.22, 'sine', 0.08);
    const note = PHRASE[Math.max(0, PHRASE.length - total + order) % PHRASE.length]!;
    this.bell(note / 2, context.currentTime + 0.18, 0.14);
  }

  fanfare(): void {
    const context = this.context;
    if (!context) return;
    [0, 2, 4, 5, 8].forEach((step, index) => this.tone(SCALE[step]!, SCALE[step]!, 0.5, 'triangle', 0.14, context.currentTime + index * 0.11));
    this.bell(SCALE[5]!, context.currentTime + 0.6, 0.12);
    // Applause: a crowd of short filtered claps.
    for (let clap = 0; clap < 26; clap++) this.hiss(0.05, 1400 + Math.random() * 1600, 'bandpass', 0.12, context.currentTime + 0.5 + Math.random() * 1.4);
  }
}
