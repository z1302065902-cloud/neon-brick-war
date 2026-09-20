import type { WeaponId } from '../data/weapons';

/**
 * Synthesised combat audio — no asset downloads, no loading screen.
 *
 * Everything, including the per-map music, is generated from oscillators and one shared
 * noise buffer, so the whole soundtrack costs a few kilobytes of code instead of megabytes
 * of samples. The music is a small step sequencer running on a Web Audio lookahead clock,
 * which is the only way to keep timing steady when the main thread is busy rendering.
 */

type MusicSpec = {
  bpm: number;
  root: number;
  scale: number[];
  wave: OscillatorType;
  /** Scale degrees per 16th step; -1 is a rest. */
  pattern: number[];
};

const SCALES: number[][] = [
  [0, 3, 5, 7, 10], // minor pentatonic — open, driving
  [0, 2, 3, 5, 7, 8, 10], // natural minor — brooding
  [0, 1, 3, 5, 7, 8, 10], // phrygian — menacing
  [0, 2, 4, 7, 9], // major pentatonic — hopeful
  [0, 1, 4, 5, 7, 8, 11], // double harmonic — alien
];

/** Ten roots, one per level, descending as the campaign goes deeper. */
const ROOTS = [110.0, 98.0, 87.31, 92.5, 82.41, 77.78, 73.42, 69.3, 65.41, 61.74];
const WAVES: OscillatorType[] = ['triangle', 'square', 'sawtooth'];

/**
 * Every level gets its own track rather than cycling three: tempo, key, scale and timbre are
 * all derived from the level index, so the campaign audibly deepens as it goes.
 */
function specForLevel(index: number): MusicSpec {
  const scale = SCALES[index % SCALES.length]!;
  const len = scale.length;
  const pattern: number[] = [];
  for (let i = 0; i < 16; i++) {
    // Rests on the 4th and 8th beats keep it from becoming a wall of notes.
    if (i === 7 || i === 15) {
      pattern.push(-1);
      continue;
    }
    // Up the scale for the first half, back down for the second.
    const step = i < 8 ? i % len : len - 1 - ((i - 8) % len);
    pattern.push(step);
  }
  return {
    bpm: 92 + (index % 10) * 4,
    root: ROOTS[index % ROOTS.length]!,
    scale,
    wave: WAVES[index % WAVES.length]!,
    pattern,
  };
}

export class AudioSystem {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private unlocked = false;
  private muted = false;

  private music: MusicSpec | null = null;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private pendingMap: number | null = null;

  constructor() {
    const unlock = () => {
      void this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.context = new Ctor();
    await this.context.resume();

    this.master = this.context.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.context.destination);

    // Music sits under the effects on its own bus so it can stay quiet without ducking SFX.
    this.musicGain = this.context.createGain();
    this.musicGain.gain.value = 0.42;
    this.musicGain.connect(this.master);

    // One second of white noise, reused by every impact and explosion.
    const frames = Math.floor(this.context.sampleRate);
    this.noise = this.context.createBuffer(1, frames, this.context.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    this.unlocked = true;
    if (this.pendingMap !== null) this.startMusic(this.pendingMap);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  private get live(): boolean {
    return Boolean(this.context && this.master && this.context.state === 'running' && !this.muted);
  }

  // ------------------------------------------------------------------ primitives

  /** One oscillator with an optional pitch sweep, scheduled at `at`. */
  private tone(
    type: OscillatorType,
    from: number,
    to: number,
    dur: number,
    gain: number,
    at?: number,
    dest?: AudioNode,
  ): void {
    if (!this.live) return;
    const ctx = this.context!;
    const t = at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest ?? this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private burst(dur: number, gain: number, cutoff: number, at?: number, dest?: AudioNode): void {
    if (!this.live || !this.noise) return;
    const ctx = this.context!;
    const t = at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(90, cutoff * 0.16), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(dest ?? this.master!);
    src.start(t);
    src.stop(t + dur + 0.03);
  }

  // ------------------------------------------------------------------ combat sfx

  /** Each gun gets its own voice so the six weapons sound as different as they play. */
  fire(weapon: WeaponId): void {
    switch (weapon) {
      case 'pulse':
        this.tone('square', 760, 240, 0.08, 0.05);
        break;
      case 'scatter':
        this.tone('sawtooth', 430, 140, 0.12, 0.055);
        this.burst(0.09, 0.08, 2800);
        break;
      case 'rail':
        this.tone('sawtooth', 170, 1500, 0.24, 0.075);
        this.tone('square', 900, 1800, 0.18, 0.03);
        break;
      case 'grenade':
        this.tone('triangle', 250, 80, 0.17, 0.07);
        break;
      case 'arc':
        this.tone('square', 1200, 520, 0.12, 0.045);
        this.burst(0.06, 0.05, 4200);
        break;
      case 'plasma':
        this.tone('sawtooth', 150, 55, 0.32, 0.085);
        break;
    }
  }

  hit(): void {
    this.tone('square', 1500, 880, 0.05, 0.04);
  }

  explosion(scale = 1): void {
    this.burst(0.3 * Math.min(1.7, Math.max(0.7, scale)), 0.15, 1700);
    this.tone('sine', 130, 45, 0.3, 0.09);
  }

  hurt(): void {
    this.tone('square', 230, 85, 0.15, 0.07);
  }

  empty(): void {
    this.tone('square', 190, 130, 0.05, 0.05);
  }

  /** Bright shattering crack when a shield trooper's barrier finally gives out. */
  shieldBreak(): void {
    this.tone('square', 2400, 700, 0.14, 0.06);
    this.tone('triangle', 1700, 320, 0.22, 0.05);
    this.burst(0.16, 0.09, 6000);
  }

  /** Low swell when a boss arrives. */
  bossSting(): void {
    this.tone('sawtooth', 55, 110, 1.5, 0.10);
    this.tone('sine', 82, 55, 1.8, 0.09);
    this.burst(1.2, 0.05, 700);
  }

  /** Harsher, shorter sting for the rage-phase turn. */
  rageSting(): void {
    this.tone('sawtooth', 140, 420, 0.5, 0.09);
    this.tone('square', 210, 90, 0.6, 0.05);
  }

  pickup(index: number): void {
    if (!this.live) return;
    const ctx = this.context!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320 + index * 22, t);
    osc.frequency.exponentialRampToValueAtTime(680 + index * 24, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  /** Rising two-note sting for a cleared objective. */
  fanfare(): void {
    this.tone('triangle', 520, 700, 0.16, 0.07);
    window.setTimeout(() => this.tone('triangle', 700, 1050, 0.26, 0.07), 130);
  }

  // ------------------------------------------------------------------ music

  /** Switches the loop to a level's theme. Safe to call before the first user gesture. */
  startMusic(levelIndex: number): void {
    this.pendingMap = levelIndex;
    this.music = specForLevel(levelIndex);
    this.step = 0;
    if (!this.unlocked) return;
    this.beginLoop();
  }

  stopMusic(): void {
    this.music = null;
    this.pendingMap = null;
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /**
   * Lookahead scheduler: a 25ms timer queues notes up to 150ms into the future, so timing
   * stays rock-steady even when a frame takes 200ms.
   */
  private beginLoop(): void {
    if (this.musicTimer !== null || !this.context) return;
    this.nextNoteTime = this.context.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.pump(), 25);
  }

  private pump(): void {
    const ctx = this.context;
    const spec = this.music;
    if (!ctx || !spec || !this.musicGain) return;
    const stepDur = 60 / spec.bpm / 4;
    while (this.nextNoteTime < ctx.currentTime + 0.15) {
      this.playStep(spec, this.step, this.nextNoteTime);
      this.nextNoteTime += stepDur;
      this.step = (this.step + 1) % spec.pattern.length;
    }
  }

  private playStep(spec: MusicSpec, step: number, at: number): void {
    const bus = this.musicGain!;
    const deg = spec.pattern[step % spec.pattern.length]!;
    const semi = (d: number) => spec.root * Math.pow(2, spec.scale[d % spec.scale.length]! / 12);

    // Bass on the half bar keeps the pulse without muddying the mix.
    if (step % 8 === 0) {
      this.tone('triangle', spec.root / 2, spec.root / 2, 0.5, 0.11, at, bus);
    }
    // Kick, with a pickup hit late in the bar.
    if (step % 8 === 0 || step % 16 === 11) {
      this.tone('sine', 110, 42, 0.16, 0.17, at, bus);
    }
    // Hat on the off-beats.
    if (step % 4 === 2) this.burst(0.025, 0.022, 8000, at, bus);
    // Pad: a slow root+fifth swell at the top of each half bar, well under the arp.
    if (step % 8 === 0) {
      const padDur = (60 / spec.bpm / 4) * 7;
      this.tone('sine', semi(0) * 2, semi(0) * 2, padDur, 0.018, at, bus);
      this.tone('sine', semi(2) * 2, semi(2) * 2, padDur, 0.013, at, bus);
    }
    // Arp line.
    if (deg >= 0) {
      this.tone(spec.wave, semi(deg), semi(deg) * 0.99, 0.14, 0.032, at, bus);
    }
  }

  dispose(): void {
    this.stopMusic();
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.musicGain = null;
    this.noise = null;
    this.unlocked = false;
  }
}
