import { WEAPONS, type WeaponDef, type WeaponId } from '../data/weapons';

export class WeaponLoadout {
  private index = 0;
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
    return WEAPONS[this.index]!;
  }

  unlock(id: WeaponId): void {
    this.unlocked.add(id);
  }

  /** Key indices of the weapons actually available right now, ascending. */
  get unlockedKeys(): number[] {
    return WEAPONS.filter((w) => this.unlocked.has(w.id)).map((w) => w.keyIndex);
  }

  selectByKey(digit: number): boolean {
    const w = WEAPONS.find((x) => x.keyIndex === digit);
    if (!w || !this.unlocked.has(w.id)) return false;
    this.index = WEAPONS.indexOf(w);
    this.railCharge = 0;
    this.charging = false;
    return true;
  }

  cycle(dir: 1 | -1): void {
    const n = WEAPONS.length;
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
    for (const w of WEAPONS) {
      if (w.ammoMax === 'inf') continue;
      const cur = this.ammo.get(w.id) ?? 0;
      const gain = Math.max(1, Math.round(w.ammoMax * fraction));
      this.ammo.set(w.id, Math.min(w.ammoMax, cur + gain));
    }
  }

  /** Remaining rounds per weapon, for tests and tuning. */
  get ammoSnapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const w of WEAPONS) {
      if (w.ammoMax === 'inf') continue;
      out[w.id] = this.ammo.get(w.id) ?? 0;
    }
    return out;
  }

  update(delta: number): void {
    this.cooldown = Math.max(0, this.cooldown - delta);
  }
}
