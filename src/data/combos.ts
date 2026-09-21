import type { WeaponDef, WeaponId } from './weapons';

/**
 * Weapon fusion.
 *
 * Two carried weapons can be broken down and rebuilt into a third — the brick idea applied
 * to the arsenal rather than the scenery. Recipes are pure data so the roster can grow
 * without touching the firing code: a fused weapon is just a WeaponDef plus a note of which
 * two parts made it.
 *
 * Design rule for every recipe: the result has to inherit a *recognisable* trait from each
 * parent, otherwise it reads as a stat bump instead of a combination. The comment on each
 * entry says which trait came from where.
 */

export type ComboDef = {
  /** Unordered pair. Sorted alphabetically when registered. */
  parts: [WeaponId, WeaponId];
  id: WeaponId;
  name: string;
  nameZh: string;
  /** One line shown on the fusion card. */
  blurb: [string, string];
  def: WeaponDef;
  muzzleColor: string;
};

export const COMBOS: ComboDef[] = [
  {
    parts: ['pulse', 'rail'],
    id: 'needler',
    name: 'Needle Driver',
    nameZh: '针刺驱动器',
    blurb: [
      'Rail punch, pistol cadence — fast bolts that ignore shields.',
      '轨道的穿透力配手枪的射速 —— 高速弹，无视护盾。',
    ],
    def: {
      id: 'needler',
      name: 'Needle Driver',
      nameZh: '针刺驱动器',
      mode: 'hitscan',
      fireRate: 0.22,
      damage: 30,
      range: 55,
      ammoMax: 40,
      pierceShield: true,
      pierceBodies: 2,
      muzzleColor: '#c77dff',
      keyIndex: 7,
    },
    muzzleColor: '#c77dff',
  },
  {
    parts: ['scatter', 'grenade'],
    id: 'flak',
    name: 'Flak Burster',
    nameZh: '破片爆裂者',
    blurb: [
      'Scatter spread, grenade blast — every pellet detonates.',
      '散射的弹幕配榴弹的爆炸 —— 每一颗弹丸都会炸。',
    ],
    def: {
      id: 'flak',
      name: 'Flak Burster',
      nameZh: '破片爆裂者',
      mode: 'grenade',
      fireRate: 0.85,
      damage: 34,
      range: 22,
      ammoMax: 16,
      pierceShield: false,
      aoeRadius: 2.6,
      pellets: 4,
      spread: 0.22,
      muzzleColor: '#ff9f43',
      keyIndex: 8,
    },
    muzzleColor: '#ff9f43',
  },
  {
    parts: ['arc', 'plasma'],
    id: 'storm',
    name: 'Storm Core',
    nameZh: '风暴核心',
    blurb: [
      'Arc chain, plasma scale — a blast that leaps between bodies.',
      '电弧的连锁配等离子的规模 —— 会跳跃传导的爆炸。',
    ],
    def: {
      id: 'storm',
      name: 'Storm Core',
      nameZh: '风暴核心',
      mode: 'arc',
      fireRate: 0.6,
      damage: 46,
      range: 30,
      ammoMax: 12,
      pierceShield: true,
      chainCount: 5,
      aoeRadius: 3.4,
      muzzleColor: '#7df9ff',
      keyIndex: 9,
    },
    muzzleColor: '#7df9ff',
  },
];

/** Key used to look a pair up regardless of the order the player holds them. */
function pairKey(a: WeaponId, b: WeaponId): string {
  return [a, b].sort().join('+');
}

const BY_PAIR = new Map<string, ComboDef>();
for (const combo of COMBOS) {
  BY_PAIR.set(pairKey(combo.parts[0], combo.parts[1]), combo);
}

const BY_ID = new Map<WeaponId, ComboDef>();
for (const combo of COMBOS) BY_ID.set(combo.id, combo);

/** The fusion two carried weapons produce, or null if the pair has no recipe. */
export function comboFor(a: WeaponId, b: WeaponId): ComboDef | null {
  if (a === b) return null;
  return BY_PAIR.get(pairKey(a, b)) ?? null;
}

/** Every recipe reachable from a given weapon, for the codex panel. */
export function combosInvolving(id: WeaponId): ComboDef[] {
  return COMBOS.filter((c) => c.parts.includes(id));
}

export function isFusedWeapon(id: WeaponId): boolean {
  return BY_ID.has(id);
}
