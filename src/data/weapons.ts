export type WeaponId =
  | 'pulse'
  | 'scatter'
  | 'rail'
  | 'grenade'
  | 'arc'
  | 'plasma';

export type FireMode = 'hitscan' | 'scatter' | 'rail' | 'grenade' | 'arc' | 'plasma';

export type WeaponDef = {
  id: WeaponId;
  name: string;
  mode: FireMode;
  fireRate: number;
  damage: number;
  range: number;
  ammoMax: number | 'inf';
  pierceShield: boolean;
  pellets?: number;
  spread?: number;
  aoeRadius?: number;
  chargeTime?: number;
  chainCount?: number;
  muzzleColor: string;
  keyIndex: number;
};

/** Six distinct guns — feel must differ in rate, pattern, and feedback. */
export const WEAPONS: WeaponDef[] = [
  {
    id: 'pulse',
    name: 'Pulse Pistol',
    mode: 'hitscan',
    fireRate: 0.16,
    damage: 18,
    range: 45,
    ammoMax: 'inf',
    pierceShield: false,
    muzzleColor: '#ff2d6a',
    keyIndex: 1,
  },
  {
    id: 'scatter',
    name: 'Scatter SMG',
    mode: 'scatter',
    fireRate: 0.28,
    damage: 10,
    range: 18,
    ammoMax: 48,
    pierceShield: false,
    pellets: 6,
    spread: 0.18,
    muzzleColor: '#ffe66d',
    keyIndex: 2,
  },
  {
    id: 'rail',
    name: 'Rail Rifle',
    mode: 'rail',
    fireRate: 0.05,
    damage: 55,
    range: 60,
    ammoMax: 12,
    pierceShield: true,
    chargeTime: 0.55,
    muzzleColor: '#c77dff',
    keyIndex: 3,
  },
  {
    id: 'grenade',
    name: 'Grenade Launcher',
    mode: 'grenade',
    fireRate: 0.7,
    damage: 48,
    range: 35,
    ammoMax: 10,
    pierceShield: false,
    aoeRadius: 3.2,
    muzzleColor: '#ff9f43',
    keyIndex: 4,
  },
  {
    id: 'arc',
    name: 'Arc Gun',
    mode: 'arc',
    fireRate: 0.35,
    damage: 16,
    range: 28,
    ammoMax: 30,
    pierceShield: false,
    chainCount: 3,
    muzzleColor: '#54f0a8',
    keyIndex: 5,
  },
  {
    id: 'plasma',
    name: 'Plasma Cannon',
    mode: 'plasma',
    fireRate: 1.1,
    damage: 90,
    range: 40,
    ammoMax: 6,
    pierceShield: false,
    aoeRadius: 4.5,
    muzzleColor: '#ff2d6a',
    keyIndex: 6,
  },
];

export function weaponById(id: WeaponId): WeaponDef {
  const w = WEAPONS.find((x) => x.id === id);
  if (!w) throw new Error(`Unknown weapon ${id}`);
  return w;
}
