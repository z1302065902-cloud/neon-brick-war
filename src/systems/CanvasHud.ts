/**
 * In-canvas game HUD.
 *
 * Everything is drawn with Canvas2D layered over the WebGL output — no DOM overlays and no
 * CSS chrome. Angular panels, cut corners, hairline neon strokes and letterspaced labels, so
 * the readout belongs to the game instead of looking like a web page sitting on top of it.
 *
 * The layout is fully derived from the viewport on every frame. Fixed pixel anchors do not
 * survive the range from a 390×844 phone to a 2400px desktop: two 306px panels plus margins
 * cannot fit in 390px, and a 420px banner runs off the side of the screen.
 */

export type HudState = {
  hp: number;
  maxHp: number;
  shield: number;
  weaponName: string;
  ammoText: string;
  chargeRatio: number | null;
  objective: string;
  status: string;
  enemiesLeft: number;
  mapName: string;
  unlockedKeys: number[];
  currentKey: number;
};

type Rect = { x: number; y: number; w: number; h: number };

export type BossReadout = { name: string; hp: number; maxHp: number; phase: number };

/** UI language. Every label below is bilingual; nothing is hard-coded English. */
export type HudLang = 'en' | 'zh';

const INK = '#eaf6ff';
const DIM = 'rgba(234,246,255,0.44)';
const CYAN = '#2de2ff';
const PINK = '#ff2d6a';
const AMBER = '#ffb703';
const GREEN = '#54f0a8';
const PANEL = 'rgba(5,9,18,0.62)';
const EDGE = 'rgba(45,226,255,0.42)';

const STACK = '"DIN Alternate","Avenir Next Condensed",ui-monospace,Menlo,monospace';
const fLabel = (px = 10) => `600 ${px}px ${STACK}`;
const fValue = (px = 26) => `700 ${px}px ${STACK}`;

/** Below this the two top panels stack vertically instead of sitting side by side. */
const NARROW_W = 720;
/** Below this there is no room for a status line plus a banner between the HUD blocks. */
const SHORT_H = 460;

type Layout = {
  w: number;
  h: number;
  margin: number;
  panelW: number;
  vitalsH: number;
  objH: number;
  vitals: Rect;
  objective: Rect;
  hintY: number;
  weapon: Rect;
  pipY: number;
  statusY: number;
  bannerTop: number;
  bannerBottom: number;
  boss: Rect | null;
  narrow: boolean;
  short: boolean;
};

export class CanvasHud {
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private state: HudState | null = null;
  private crossX = 0;
  private crossY = 0;
  private spread = 0;
  private hitAt = -1e9;
  private hurtAt = -1e9;
  private hint = true;
  private banner: string | null = null;
  private L: Layout | null = null;
  private hintRect: Rect | null = null;
  private statusRect: Rect | null = null;
  private bannerRect: Rect | null = null;
  private boss: BossReadout | null = null;
  private lang: HudLang = 'en';
  private storyLines: string[] = [];
  private storyAlpha = 0;
  private storyRect: Rect | null = null;
  private statusFlash: { text: string; until: number } | null = null;
  private paused = false;
  private volume: number | null = null;

  setLang(lang: HudLang): void {
    this.lang = lang;
  }

  /** Full-screen pause treatment; the sim is frozen while this is up. */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /** Shows the volume bar for a few seconds. Pass 0..1. */
  showVolume(value: number): void {
    this.volume = value;
    this.volumeUntil = performance.now() + 1600;
  }
  private volumeUntil = 0;

  /** Story card during level transitions; alpha 0..1 drives the fade. */
  setStory(lines: string[], alpha: number): void {
    this.storyLines = lines;
    this.storyAlpha = alpha;
  }

  /** Bilingual label lookup. */
  private txt(en: string, zh: string): string {
    return this.lang === 'zh' ? zh : en;
  }

  /** Boss health readout — set to null once the fight ends. */
  setBoss(readout: BossReadout | null): void {
    this.boss = readout;
  }

  /** Temporary override for the status line, e.g. a rage-phase callout. */
  flashStatus(text: string): void {
    this.statusFlash = { text, until: performance.now() + 2200 };
  }

  /** Test hook: the exact rects drawn on the last frame, for layout regression checks. */
  get debugRects(): Record<string, Rect> | null {
    const L = this.L;
    if (!L) return null;
    const out: Record<string, Rect> = { vitals: L.vitals, objective: L.objective, weapon: L.weapon };
    if (L.boss) out.boss = L.boss;
    if (this.hintRect) out.hint = this.hintRect;
    if (this.statusRect) out.status = this.statusRect;
    if (this.bannerRect) out.banner = this.bannerRect;
    if (this.storyRect) out.story = this.storyRect;
    if (this.state) {
      const total = Math.max(1, this.state.unlockedKeys.length);
      const pipW = Math.min(26, (L.w - L.margin * 2 - (total - 1) * 6) / total);
      const rowW = total * pipW + (total - 1) * 6;
      out.pips = { x: (L.w - rowW) / 2, y: L.pipY, w: rowW, h: 20 };
    }
    return out;
  }

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas2D unavailable for the HUD');
    this.ctx = ctx;
  }

  resize(w: number, h: number, dpr: number): void {
    const bw = Math.max(1, Math.floor(w * dpr));
    const bh = Math.max(1, Math.floor(h * dpr));
    if (this.canvas.width === bw && this.canvas.height === bh) return;
    this.canvas.width = bw;
    this.canvas.height = bh;
  }

  setCrosshair(x: number, y: number): void {
    this.crossX = x;
    this.crossY = y;
  }

  setHintVisible(visible: boolean): void {
    this.hint = visible;
  }

  /** Centre banner used for unlock prompts and level transitions. */
  setUnlockVisible(visible: boolean, text?: string): void {
    this.banner = visible ? text ?? '' : null;
  }

  update(state: HudState): void {
    this.state = state;
  }

  recoil(amount = 1): void {
    this.spread = Math.min(14, this.spread + 5 * amount);
  }

  hitmarker(): void {
    this.hitAt = performance.now();
  }

  hurt(): void {
    this.hurtAt = performance.now();
  }

  // ------------------------------------------------------------------ layout

  private computeLayout(): Layout {
    const w = this.w;
    const h = this.h;
    const narrow = w < NARROW_W;
    const short = h < SHORT_H;
    const margin = narrow ? 12 : 26;
    const panelW = Math.min(306, w - margin * 2);
    const hasShield = (this.state?.shield ?? 0) > 0;
    const vitalsH = hasShield ? 96 : 78;
    const objH = 88;

    const vitals: Rect = { x: margin, y: margin, w: panelW, h: vitalsH };
    const objective: Rect = narrow
      ? { x: margin, y: margin + vitalsH + 8, w: panelW, h: objH }
      : { x: w - panelW - margin, y: margin, w: panelW, h: objH };

    // Everything below the top block, so the hint can never land on a panel.
    const topBlockBottom = narrow
      ? objective.y + objH
      : Math.max(vitals.y + vitalsH, objective.y + objH);

    // Boss health bar claims the row directly under the top block while a boss is alive.
    const bossW = Math.min(560, w - margin * 2);
    const boss: Rect | null = this.boss
      ? { x: (w - bossW) / 2, y: topBlockBottom + 8, w: bossW, h: 42 }
      : null;

    // +30 keeps the hint's plate (drawn 18px above its baseline) clear of the panels below.
    const hintY = (boss ? boss.y + boss.h : topBlockBottom) + 30;

    const weaponH = 78;
    const pipGap = short ? 12 : 26;
    const weapon: Rect = {
      x: (w - panelW) / 2,
      y: h - weaponH - pipGap - (short ? 18 : 34),
      w: panelW,
      h: weaponH,
    };
    const pipY = weapon.y + weaponH + (short ? 8 : 14);
    const statusY = weapon.y - 30;

    // The banner lives in whatever vertical room is left, so it cannot cover the weapon
    // block on a short screen or the panels on a narrow one. While a banner is up the
    // status line is suppressed (drawStatus skips it) because they say the same thing and
    // a 390px-tall window has no room for both.
    const bannerTop = Math.max(hintY + 26, margin);
    const bandBottom = (this.banner !== null ? weapon.y : statusY) - 20;
    const bannerBottom = Math.max(bannerTop + 60, bandBottom);

    return {
      w, h, margin, panelW, vitalsH, objH, vitals, objective, hintY,
      weapon, pipY, statusY, bannerTop, bannerBottom, boss, narrow, short,
    };
  }

  /** Largest font size from `sizes` at which `text` fits `maxW`. */
  private fit(text: string, maxW: number, sizes: number[], font: (px: number) => string): number {
    const c = this.ctx;
    for (const px of sizes) {
      c.font = font(px);
      if (c.measureText(text).width <= maxW) return px;
    }
    return sizes[sizes.length - 1]!;
  }

  // ------------------------------------------------------------------ render

  render(): void {
    const c = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.w = w;
    this.h = h;
    const dpr = this.canvas.width / Math.max(1, w);

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.textBaseline = 'alphabetic';

    const L = this.computeLayout();
    this.L = L;
    this.spread = Math.max(0, this.spread - 0.55);
    this.hintRect = null;
    this.statusRect = null;
    this.bannerRect = null;
    this.storyRect = null;

    this.drawDamageVignette();
    if (this.boss) this.drawBossBar(L);
    if (this.state) {
      this.drawVitals(L);
      this.drawObjective(L);
      this.drawWeapon(L);
      this.drawStatus(L);
    }
    this.drawCrosshair();
    if (this.paused) this.drawPaused(L);
    if (this.volume !== null && performance.now() < this.volumeUntil) this.drawVolume(L);
    if (this.hint) this.drawHint(L);
    // A story card and a banner say the same kind of thing and share a band, so the
    // story wins while it is on screen.
    if (this.storyAlpha > 0 && this.storyLines.length) this.drawStory(L);
    else if (this.banner !== null) this.drawBanner(L, this.banner);
  }

  // ---------------------------------------------------------------- pieces

  /** Angular plate with cut corners — deliberately not a rounded web card. */
  private plate(x: number, y: number, w: number, h: number, cut = 12, accent = EDGE): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w - cut, y);
    c.lineTo(x + w, y + cut);
    c.lineTo(x + w, y + h);
    c.lineTo(x + cut, y + h);
    c.lineTo(x, y + h - cut);
    c.closePath();
    c.fillStyle = PANEL;
    c.fill();
    c.strokeStyle = accent;
    c.lineWidth = 1.25;
    c.stroke();

    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x + 1, y + 1);
    c.lineTo(x + 16, y + 1);
    c.moveTo(x + w - 17, y + h - 1);
    c.lineTo(x + w - 1, y + h - 1);
    c.stroke();
  }

  private label(
    text: string,
    x: number,
    y: number,
    color = DIM,
    px = 10,
    align: CanvasTextAlign = 'left',
  ): void {
    const c = this.ctx;
    c.font = fLabel(px);
    if ('letterSpacing' in c) (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '2.4px';
    c.fillStyle = color;
    c.textAlign = align;
    c.fillText(text.toUpperCase(), x, y);
    if ('letterSpacing' in c) (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    c.textAlign = 'left';
  }

  private value(text: string, x: number, y: number, color = INK, px = 26, align: CanvasTextAlign = 'left'): void {
    const c = this.ctx;
    c.font = fValue(px);
    c.fillStyle = color;
    c.textAlign = align;
    c.fillText(text, x, y);
    c.textAlign = 'left';
  }

  private drawVitals(L: Layout): void {
    const s = this.state!;
    const { x, y, w, h } = L.vitals;
    this.plate(x, y, w, h);
    const pad = Math.min(16, w * 0.06);

    this.label(this.txt('Integrity', '完整度'), x + pad, y + 20);
    this.label(`${this.txt('Max', '上限')} ${s.maxHp}`, x + w - pad, y + 20, DIM, 9, 'right');

    const pct = Math.max(0, Math.min(1, s.hp / Math.max(1, s.maxHp)));
    const hpColor = pct > 0.55 ? CYAN : pct > 0.25 ? AMBER : PINK;
    const hpPx = this.fit(`${Math.ceil(s.hp)}`, w - pad * 2, [30, 26, 22, 18], fValue);
    this.value(`${Math.ceil(s.hp)}`, x + w - pad, y + 52, hpColor, hpPx, 'right');

    const c = this.ctx;
    const bx = x + pad;
    const by = y + 62;
    const bw = w - pad * 2;
    const bh = 13;
    const segs = Math.max(8, Math.min(24, Math.floor(bw / 9)));
    const gap = 2;
    const segW = (bw - gap * (segs - 1)) / segs;
    const lit = pct * segs;
    for (let i = 0; i < segs; i++) {
      const fill = i < Math.floor(lit);
      const partial = !fill && i < lit;
      const sx = bx + i * (segW + gap);
      const slant = Math.min(4, segW * 0.35);
      c.beginPath();
      c.moveTo(sx + slant, by);
      c.lineTo(sx + segW, by);
      c.lineTo(sx + segW - slant, by + bh);
      c.lineTo(sx, by + bh);
      c.closePath();
      c.fillStyle = fill ? hpColor : partial ? `${hpColor}66` : 'rgba(234,246,255,0.09)';
      c.fill();
    }

    if (s.shield > 0) {
      const sy = by + bh + 9;
      const trackW = Math.min(bw * 0.6, 150);
      c.fillStyle = 'rgba(199,125,255,0.2)';
      c.fillRect(bx, sy, trackW, 5);
      c.fillStyle = '#c77dff';
      c.fillRect(bx, sy, (Math.min(1, s.shield / 80)) * trackW, 5);
      this.label(`${this.txt('Shield', '护盾')} ${Math.ceil(s.shield)}`, bx + trackW + 10, sy + 6, '#c77dff', 9);
    }
  }

  private drawObjective(L: Layout): void {
    const s = this.state!;
    const { x, y, w, h } = L.objective;
    this.plate(x, y, w, h);
    const pad = Math.min(16, w * 0.06);

    this.label(this.txt('Objective', '目标'), x + pad, y + 20);
    const namePx = this.fit(s.mapName, w - pad * 2, [17, 15, 13], fValue);
    this.value(s.mapName, x + pad, y + 46, INK, namePx);

    const hostilesW = s.enemiesLeft > 0 ? 52 : 0;
    const objPx = this.fit(s.objective, w - pad * 2 - hostilesW, [10, 9, 8], fLabel);
    this.label(s.objective, x + pad, y + 68, DIM, objPx);

    if (s.enemiesLeft > 0) {
      this.value(`${s.enemiesLeft}`, x + w - pad, y + 46, PINK, 22, 'right');
      this.label(this.txt('Hostiles', '敌人'), x + w - pad, y + 68, PINK, 9, 'right');
    }
  }

  private drawWeapon(L: Layout): void {
    const s = this.state!;
    const { x, y, w, h } = L.weapon;
    this.plate(x, y, w, h, 14, 'rgba(255,45,106,0.42)');
    const pad = Math.min(16, w * 0.06);

    this.label(this.txt('Weapon', '武器'), x + pad, y + 21);
    const ammoW = this.ctx.measureText(s.ammoText).width;
    const namePx = this.fit(s.weaponName, w - pad * 2 - ammoW - 16, [20, 17, 15, 13], fValue);
    this.value(s.weaponName, x + pad, y + 48, INK, namePx);
    this.value(s.ammoText, x + w - pad, y + 48, s.ammoText === '∞' ? CYAN : INK, 26, 'right');

    if (s.chargeRatio !== null) {
      const bx = x + pad;
      const by = y + h - 12;
      const bw = w - pad * 2;
      this.ctx.fillStyle = 'rgba(234,246,255,0.12)';
      this.ctx.fillRect(bx, by, bw, 5);
      this.ctx.fillStyle = s.chargeRatio >= 1 ? GREEN : '#c77dff';
      this.ctx.fillRect(bx, by, bw * Math.min(1, s.chargeRatio), 5);
      this.label(s.chargeRatio >= 1 ? this.txt('Charged', '已充能') : this.txt('Charging', '充能中'), bx, by - 4, s.chargeRatio >= 1 ? GREEN : '#c77dff', 9);
    }

    // Slot pips — only the slots the player can actually reach are drawn lit.
    const total = Math.max(1, s.unlockedKeys.length);
    const pipW = Math.min(26, (L.w - L.margin * 2 - (total - 1) * 6) / total);
    const gap = 6;
    const startX = (L.w - (total * pipW + (total - 1) * gap)) / 2;
    s.unlockedKeys.forEach((key, i) => {
      const px = startX + i * (pipW + gap);
      const active = key === s.currentKey;
      this.ctx.fillStyle = active ? PINK : 'rgba(234,246,255,0.14)';
      this.ctx.fillRect(px, L.pipY, pipW, 4);
      this.label(`${key}`, px + pipW / 2, L.pipY + 16, active ? INK : DIM, 10, 'center');
    });
  }

  /**
   * Boss health bar with a marker at the 50% line, so the rage-phase threshold is visible
   * before it happens rather than being a surprise.
   */
  private drawBossBar(L: Layout): void {
    const b = this.boss!;
    const rect = L.boss;
    if (!rect) return;
    const rage = b.phase === 2;
    this.plate(rect.x, rect.y, rect.w, rect.h, 10, rage ? 'rgba(255,90,0,0.62)' : 'rgba(255,45,106,0.5)');

    const pad = 12;
    const namePx = this.fit(b.name, rect.w - pad * 2 - 90, [11, 10, 9], fLabel);
    this.label(b.name, rect.x + pad, rect.y + 16, rage ? AMBER : INK, namePx);
    this.label(rage ? this.txt('Rage phase', '狂暴阶段') : this.txt('Phase 1', '第一阶段'), rect.x + rect.w - pad, rect.y + 16, rage ? '#ff5a00' : DIM, 9, 'right');

    const c = this.ctx;
    const bx = rect.x + pad;
    const by = rect.y + 22;
    const bw = rect.w - pad * 2;
    const bh = 12;
    c.fillStyle = 'rgba(234,246,255,0.1)';
    c.fillRect(bx, by, bw, bh);
    const pct = Math.max(0, Math.min(1, b.hp / Math.max(1, b.maxHp)));
    c.fillStyle = rage ? '#ff5a00' : PINK;
    c.fillRect(bx, by, bw * pct, bh);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillRect(bx + bw * 0.5 - 1, by - 2, 2, bh + 4);
  }

  private drawStatus(L: Layout): void {
    const s = this.state!;
    // A banner already carries the message, and short viewports cannot fit both.
    if (this.banner !== null) return;
    const flash = this.statusFlash && this.statusFlash.until > performance.now() ? this.statusFlash.text : null;
    const text = flash ?? s.status;
    if (!text) return;
    const c = this.ctx;
    const maxW = L.w - L.margin * 2 - 40;
    const px = this.fit(text, maxW, [12, 11, 10, 9], fLabel);
    c.font = fLabel(px);
    const tw = Math.min(maxW + 34, c.measureText(text).width + 34);
    const y = L.statusY;
    this.statusRect = { x: (L.w - tw) / 2, y: y - 17, w: tw, h: 24 };
    c.fillStyle = 'rgba(5,9,18,0.66)';
    c.fillRect((L.w - tw) / 2, y - 17, tw, 24);
    c.fillStyle = flash ? AMBER : PINK;
    c.fillRect((L.w - tw) / 2, y - 17, 3, 24);
    c.fillStyle = INK;
    c.textAlign = 'center';
    c.fillText(text.toUpperCase(), L.w / 2, y);
    c.textAlign = 'left';
  }

  // ---------------------------------------------------------------- feedback

  private drawCrosshair(): void {
    const c = this.ctx;
    const x = this.crossX;
    const y = this.crossY;
    const gap = 7 + this.spread;
    const len = 9;
    const segments: readonly [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    c.strokeStyle = 'rgba(5,9,18,0.85)';
    c.lineWidth = 4;
    c.beginPath();
    for (const [dx, dy] of segments) {
      c.moveTo(x + dx * gap, y + dy * gap);
      c.lineTo(x + dx * (gap + len), y + dy * (gap + len));
    }
    c.stroke();

    c.strokeStyle = PINK;
    c.lineWidth = 2;
    c.beginPath();
    for (const [dx, dy] of segments) {
      c.moveTo(x + dx * gap, y + dy * gap);
      c.lineTo(x + dx * (gap + len), y + dy * (gap + len));
    }
    c.stroke();

    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fillRect(x - 1, y - 1, 2, 2);

    const since = performance.now() - this.hitAt;
    if (since < 140) {
      const a = 1 - since / 140;
      c.strokeStyle = `rgba(255,255,255,${a})`;
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(x - 13, y - 13); c.lineTo(x - 6, y - 6);
      c.moveTo(x + 13, y - 13); c.lineTo(x + 6, y - 6);
      c.moveTo(x - 13, y + 13); c.lineTo(x - 6, y + 6);
      c.moveTo(x + 13, y + 13); c.lineTo(x + 6, y + 6);
      c.stroke();
    }
  }

  private drawDamageVignette(): void {
    const since = performance.now() - this.hurtAt;
    if (since > 420) return;
    const a = (1 - since / 420) * 0.5;
    const c = this.ctx;
    const g = c.createRadialGradient(
      this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.32,
      this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.72,
    );
    g.addColorStop(0, 'rgba(255,45,106,0)');
    g.addColorStop(1, `rgba(255,45,106,${a})`);
    c.fillStyle = g;
    c.fillRect(0, 0, this.w, this.h);
  }

  /**
   * Cutscene-style story card: a letterboxed band across the middle with the narration
   * centred. Fades on `storyAlpha` so the level transition is not an abrupt cut.
   */
  private drawStory(L: Layout): void {
    const c = this.ctx;
    const a = Math.max(0, Math.min(1, this.storyAlpha));
    const maxW = L.w - L.margin * 2 - 40;
    const px = this.fitLongest(this.storyLines, maxW, [26, 22, 19, 16, 14], fValue);
    c.font = fValue(px);
    let widest = 0;
    for (const line of this.storyLines) widest = Math.max(widest, c.measureText(line).width);
    const bw = Math.min(L.w, widest + 100);
    const bh = 30 + this.storyLines.length * (px + 12);
    const x = (L.w - bw) / 2;
    const freeTop = L.bannerTop;
    const freeBottom = Math.max(freeTop + bh, L.bannerBottom);
    const y = Math.max(freeTop, Math.min(freeBottom - bh, (freeTop + freeBottom - bh) / 2));

    this.storyRect = { x, y, w: bw, h: bh };
    c.globalAlpha = a;
    c.fillStyle = 'rgba(3,5,12,0.78)';
    c.fillRect(x, y, bw, bh);
    c.fillStyle = AMBER;
    c.fillRect(x, y, bw, 2);
    c.fillRect(x, y + bh - 2, bw, 2);

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    this.storyLines.forEach((line, i) => {
      const last = i === this.storyLines.length - 1;
      c.fillStyle = last ? AMBER : INK;
      c.font = fValue(px);
      c.fillText(line, L.w / 2, y + 26 + i * (px + 12));
    });
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.globalAlpha = 1;
  }

  /** Largest font size at which every line fits. */
  private fitLongest(lines: string[], maxW: number, sizes: number[], font: (px: number) => string): number {
    const c = this.ctx;
    for (const px of sizes) {
      c.font = font(px);
      if (lines.every((l) => c.measureText(l).width <= maxW)) return px;
    }
    return sizes[sizes.length - 1]!;
  }

  /** Dimming scrim with a centred PAUSED plate. */
  private drawPaused(L: Layout): void {
    const c = this.ctx;
    c.fillStyle = 'rgba(3,5,12,0.55)';
    c.fillRect(0, 0, L.w, L.h);

    const title = this.txt('PAUSED', '已暂停');
    const sub = this.txt('Click to resume', '点击继续');
    const px = Math.min(44, Math.max(22, L.w * 0.05));
    c.textAlign = 'center';
    c.font = fValue(px);
    if ('letterSpacing' in c) (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '6px';
    const tw = c.measureText(title).width;
    const bw = Math.min(L.w - 40, tw + 90);
    const bh = px + 62;
    const x = (L.w - bw) / 2;
    const y = (L.h - bh) / 2;
    this.plate(x, y, bw, bh, 16, 'rgba(255,183,3,0.55)');
    c.fillStyle = AMBER;
    c.fillText(title, L.w / 2, y + px + 10);
    if ('letterSpacing' in c) (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    c.font = fLabel(12);
    c.fillStyle = INK;
    c.fillText(sub, L.w / 2, y + px + 38);
    c.textAlign = 'left';
    this.statusRect = null;
  }

  /** Transient volume bar, bottom-left. */
  private drawVolume(L: Layout): void {
    const c = this.ctx;
    const w = Math.min(220, L.w - L.margin * 2);
    const h = 34;
    const x = L.margin;
    const y = L.h - h - L.margin;
    this.plate(x, y, w, h, 10);
    const label = this.txt('Volume', '音量');
    const muted = (this.volume ?? 0) <= 0;
    this.label(label, x + 12, y + 14, DIM, 9);
    const bx = x + 12;
    const by = y + 20;
    const bw = w - 24;
    c.fillStyle = 'rgba(234,246,255,0.12)';
    c.fillRect(bx, by, bw, 6);
    c.fillStyle = muted ? PINK : CYAN;
    c.fillRect(bx, by, bw * (this.volume ?? 0), 6);
    if (muted) this.label(this.txt('MUTED', '静音'), x + w - 12, y + 14, PINK, 9, 'right');
  }

  private drawHint(L: Layout): void {
    const c = this.ctx;
    const text = L.narrow
      ? this.txt('WASD move · LMB fire · 1-6 swap · L 语言', 'WASD 移动 · 左键开火 · 1-6 换枪 · L 语言')
      : this.txt(
          'Click canvas to play · WASD move · LMB / Space fire · 1-6 or Q E swap · L 中文 · F3 colliders',
          '点击画布开始 · WASD 移动 · 左键/空格 开火 · 1-6 或 Q E 换枪 · L English · F3 碰撞体',
        );
    const maxW = L.w - L.margin * 2 - 36;
    const px = this.fit(text, maxW, [12, 11, 10, 9], fLabel);
    c.font = fLabel(px);
    const tw = Math.min(maxW + 36, c.measureText(text).width + 36);
    const y = L.hintY;
    this.hintRect = { x: (L.w - tw) / 2, y: y - 18, w: tw, h: 26 };
    c.fillStyle = 'rgba(5,9,18,0.72)';
    c.fillRect((L.w - tw) / 2, y - 18, tw, 26);
    c.fillStyle = 'rgba(255,159,191,0.95)';
    c.textAlign = 'center';
    c.fillText(text, L.w / 2, y);
    c.textAlign = 'left';
  }

  private drawBanner(L: Layout, text: string): void {
    const c = this.ctx;
    const lines = text.split('\n');
    const maxW = L.w - L.margin * 2 - 60;

    let titlePx = 15;
    let bodyPx = 12;
    for (const [t, b] of [[15, 12], [13, 11], [11, 10], [10, 9]] as const) {
      c.font = fLabel(t);
      const titleOk = c.measureText(lines[0] ?? '').width <= maxW;
      c.font = fLabel(b);
      const bodyOk = lines.slice(1).every((l) => c.measureText(l).width <= maxW);
      if (titleOk && bodyOk) { titlePx = t; bodyPx = b; break; }
      titlePx = t;
      bodyPx = b;
    }

    let bw = 0;
    c.font = fLabel(titlePx);
    bw = Math.max(bw, c.measureText(lines[0] ?? '').width);
    c.font = fLabel(bodyPx);
    for (const l of lines.slice(1)) bw = Math.max(bw, c.measureText(l).width);
    bw = Math.min(L.w - L.margin * 2, bw + 56);
    const bh = 34 + (lines.length - 1) * 22;
    const x = (L.w - bw) / 2;

    // Centre within the free band so it never covers the top panels or the weapon block.
    const freeTop = L.bannerTop;
    const freeBottom = L.bannerBottom;
    const y = Math.max(freeTop, Math.min(freeBottom - bh, (freeTop + freeBottom - bh) / 2));
    this.bannerRect = { x, y, w: bw, h: bh };

    this.plate(x, y, bw, bh, 16, 'rgba(255,183,3,0.5)');
    c.textAlign = 'center';
    lines.forEach((l, i) => {
      c.fillStyle = i === 0 ? AMBER : INK;
      c.font = i === 0 ? fLabel(titlePx) : fLabel(bodyPx);
      c.fillText(l.toUpperCase(), L.w / 2, y + 30 + i * 22);
    });
    c.textAlign = 'left';
  }
}
