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

  refillAmmo(amount = 999): void {
    for (const w of WEAPONS) {
      if (w.ammoMax === 'inf') continue;
      const cur = this.ammo.get(w.id) ?? 0;
      this.ammo.set(w.id, Math.min(w.ammoMax, cur + Math.ceil(amount / 3)));
    }
  }

  update(delta: number): void {
    this.cooldown = Math.max(0, this.cooldown - delta);
  }
}
