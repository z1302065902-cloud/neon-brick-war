import { WEAPONS, type WeaponDef, type WeaponId } from '../data/weapons';
import { comboFor, isFusedWeapon, type ComboDef } from '../data/combos';

export class WeaponLoadout {
  private index = 0;
  /** Weapons the player holds right now. Starts as the base six. */
  private roster: WeaponDef[] = [...WEAPONS];
  private readonly unlocked = new Set<WeaponId>(['pulse']);
  private readonly ammo = new Map<WeaponId, number>();
  cooldown = 0;
  railCharge = 0;
  charging = false;

  constructor() {
    for (const w of WEAPONS) {
      this.ammo.set(w.id, w.ammoMax === 'inf' ? 9999 : w.ammoMax);
    }
  }

  get current(): WeaponDef {
    return this.roster[this.index] ?? WEAPONS[0]!;
  }

  get slotCount(): number {
    return this.roster.length;
  }

  unlock(id: WeaponId): void {
    this.unlocked.add(id);
  }

  /** Key indices of the weapons actually available right now, ascending. */
  get unlockedKeys(): number[] {
    return this.roster.filter((w) => this.unlocked.has(w.id)).map((w) => w.keyIndex);
  }

  selectByKey(digit: number): boolean {
    const w = this.roster.find((x) => x.keyIndex === digit);
    if (!w || !this.unlocked.has(w.id)) return false;
    this.index = this.roster.indexOf(w);
    this.railCharge = 0;
    this.charging = false;
    return true;
  }

  cycle(dir: 1 | -1): void {
    const n = this.roster.length;
    for (let i = 0; i < n; i++) {
      this.index = (this.index + dir + n) % n;
      if (this.unlocked.has(this.current.id)) {
        this.railCharge = 0;
        this.charging = false;
        return;
      }
    }
  }

  ammoLeft(): number | 'inf' {
    const w = this.current;
    if (w.ammoMax === 'inf') return 'inf';
    return this.ammo.get(w.id) ?? 0;
  }

  tryConsumeAmmo(): boolean {
    const w = this.current;
    if (w.ammoMax === 'inf') return true;
    const left = this.ammo.get(w.id) ?? 0;
    if (left <= 0) return false;
    this.ammo.set(w.id, left - 1);
    return true;
  }

  /**
   * Restores a fraction of every weapon's capacity.
   *
   * This used to add a flat number of rounds to each gun, which inverted the design: a crate
   * topped the *scarce* weapons up completely (plasma holds 6, grenade 10) while barely
   * denting the roomy ones (scatter holds 48). Scaling by capacity keeps plasma and grenades
   * genuinely scarce and makes the crate worth the same to every weapon.
   */
  refillAmmo(fraction = 0.4): void {
    for (const w of this.roster) {
      if (w.ammoMax === 'inf') continue;
      const cur = this.ammo.get(w.id) ?? 0;
      const gain = Math.max(1, Math.round(w.ammoMax * fraction));
      this.ammo.set(w.id, Math.min(w.ammoMax, cur + gain));
    }
  }

  /** Remaining rounds per weapon, for tests and tuning. */
  get ammoSnapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const w of this.roster) {
      if (w.ammoMax === 'inf') continue;
      out[w.id] = this.ammo.get(w.id) ?? 0;
    }
    return out;
  }

  /** The weapon in the given slot, or null — used by the HUD pips. */
  atIndex(i: number): WeaponDef | null {
    return this.roster[i] ?? null;
  }

  /** Index of the currently held weapon. */
  get currentIndex(): number {
    return this.index;
  }

  /** Key index of a held weapon, or null if it is not in the roster. */
  keyIndexOf(id: WeaponId): number | null {
    return this.roster.find((w) => w.id === id)?.keyIndex ?? null;
  }

  /**
   * Does the player hold a pair that can be fused, and are both actually unlocked?
   * Fusion consumes parts, so holding them is not enough — they must be usable.
   */
  fusablePair(): ComboDef | null {
    for (let i = 0; i < this.roster.length; i++) {
      const a = this.roster[i]!;
      if (!this.unlocked.has(a.id)) continue;
      for (let j = i + 1; j < this.roster.length; j++) {
        const b = this.roster[j]!;
        if (!this.unlocked.has(b.id)) continue;
        const combo = comboFor(a.id, b.id);
        if (combo) return combo;
      }
    }
    return null;
  }

  /**
   * Break two weapons down and rebuild them as one.
   *
   * Both parts leave the roster — that cost is what stops the player from just collecting
   * every gun. The fused weapon takes over the lower of the two key slots so the bar does
   * not grow a gap, and it arrives with full ammo so the rebuild feels like a reward.
   */
  fuse(combo: ComboDef): boolean {
    const ia = this.roster.findIndex((w) => w.id === combo.parts[0]);
    const ib = this.roster.findIndex((w) => w.id === combo.parts[1]);
    if (ia < 0 || ib < 0) return false;
    if (this.roster.some((w) => w.id === combo.id)) return false;

    const keep = Math.max(ia, ib);
    const drop = Math.min(ia, ib);

    this.roster = this.roster.filter((_, i) => i !== keep && i !== drop);
    this.roster.push({ ...combo.def });
    /*
     * Renumber every slot 1..n after a fusion.
     *
     * Taking over "the lower of the two freed slots" left a hole — fusing slots 1 and 3 gave
     * the result slot 1 and orphaned key 3 forever, so a key bound to nothing did nothing.
     * A contiguous bar is worth more than keeping any particular weapon on its old key.
     */
    this.roster.sort((a, b) => a.keyIndex - b.keyIndex);
    this.roster = this.roster.map((w, i) => (w.keyIndex === i + 1 ? w : { ...w, keyIndex: i + 1 }));
    const active = this.current.id;
    this.index = Math.max(0, this.roster.findIndex((w) => w.id === combo.id));
    this.unlocked.add(combo.id);
    this.ammo.set(combo.id, combo.def.ammoMax === 'inf' ? 9999 : combo.def.ammoMax);
    this.railCharge = 0;
    this.charging = false;
    void active;
    return true;
  }

  /** True once the given weapon has been built by fusion (for UI badges). */
  isFused(id: WeaponId): boolean {
    return isFusedWeapon(id) && this.roster.some((w) => w.id === id);
  }

  update(delta: number): void {
    this.cooldown = Math.max(0, this.cooldown - delta);
  }
}
