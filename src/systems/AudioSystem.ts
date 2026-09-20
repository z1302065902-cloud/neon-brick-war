import type { WeaponId } from '../data/weapons';

/**
 * Synthesised combat audio — no asset downloads, no loading screen.
 * Every sound is built from oscillators and one shared noise buffer, so the whole
 * soundtrack costs a few kilobytes of code instead of megabytes of samples.
 */
export class AudioSystem {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private unlocked = false;
  private muted = false;

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

    // One second of white noise, reused by every impact and explosion.
    const frames = Math.floor(this.context.sampleRate);
    this.noise = this.context.createBuffer(1, frames, this.context.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    this.unlocked = true;
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

  private tone(type: OscillatorType, from: number, to: number, dur: number, gain: number): void {
    if (!this.live) return;
    const ctx = this.context!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private burst(dur: number, gain: number, cutoff: number): void {
    if (!this.live || !this.noise) return;
    const ctx = this.context!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(90, cutoff * 0.16), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.03);
  }

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

  dispose(): void {
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.noise = null;
    this.unlocked = false;
  }
}
