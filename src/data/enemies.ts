import type { BrickBuild, BrickPalette } from '../entities/BrickCharacter';

/**
 * Ten enemy types, one per level — no two levels field the same silhouette.
 *
 * Differentiation is deliberately spread across three axes rather than palette alone:
 *   build   — proportions (a brute is wide and short, a stilt is tall and thin)
 *   palette — colour
 *   trait   — one distinguishing appendage or behaviour flag (horned, spiked, winged)
 *
 * Colour on its own was the trap here: recolour a single grunt ten times and the player
 * still reads one enemy. Change the shape and they read ten.
 */

export type EnemyTrait =
  | 'none'
  /** Armoured front plate: takes reduced damage head-on. */
  | 'plated'
  /** Carries a shield generator. */
  | 'shielded'
  /** Tall and thin, closes distance fast. */
  | 'lanky'
  /** Squat and heavy, slow but very tough. */
  | 'brute'
  /** Spiked shoulders: deals contact damage back. */
  | 'spiked'
  /** Visor glow: sees the player from further away. */
  | 'scout'
  /** Two extra arms — puts out more fire. */
  | 'quad'
  /** Crowned: a minor commander, buffs nearby allies. */
  | 'crested'
  /** Antenna array: calls in flyer support. */
  | 'beacon'
  /** Battle-worn: cracked plating, most aggressive. */
  | 'veteran';

export type EnemyDef = {
  id: string;
  name: readonly [string, string];
  trait: EnemyTrait;
  build: BrickBuild;
  palette: BrickPalette;
  /** Multiplies the level's base enemy HP. */
  hpScale: number;
  /** Multiplies walk speed. */
  speedScale: number;
};

const BASE: BrickBuild = {
  torsoW: 1, torsoH: 1, legL: 1, armL: 1, headScale: 1, shoulder: 1,
};

export const ENEMIES: readonly EnemyDef[] = [
  {
    id: 'sprout',
    name: ['Sprout Trooper', '新芽兵'],
    trait: 'none',
    build: BASE,
    palette: { skin: '#f2c9a0', torso: '#ff2d6a', legs: '#2a1018', accent: '#ff6b9d' },
    hpScale: 1, speedScale: 1,
  },
  {
    id: 'peeler',
    name: ['Peeler', '削皮者'],
    trait: 'shielded',
    build: { ...BASE, torsoW: 1.14, shoulder: 1.16 },
    palette: { skin: '#d4a574', torso: '#ff9f43', legs: '#2e1a08', accent: '#ffd166' },
    hpScale: 1.05, speedScale: 0.95,
  },
  {
    id: 'cog',
    name: ['Cog Runner', '齿轮行者'],
    trait: 'lanky',
    build: { ...BASE, torsoW: 0.84, legL: 1.24, armL: 1.2, shoulder: 0.88 },
    palette: { skin: '#e8c9a0', torso: '#c77dff', legs: '#1b1030', accent: '#e0b3ff' },
    hpScale: 0.92, speedScale: 1.3,
  },
  {
    id: 'mast',
    name: ['Mast Sentinel', '桅杆哨兵'],
    trait: 'scout',
    build: { ...BASE, torsoW: 0.9, torsoH: 1.12, legL: 1.14 },
    palette: { skin: '#cfe6ff', torso: '#2de2ff', legs: '#0a2230', accent: '#9ef2ff' },
    hpScale: 1, speedScale: 1.1,
  },
  {
    id: 'stacker',
    name: ['Stacker Brute', '叠箱蛮兵'],
    trait: 'brute',
    build: { torsoW: 1.42, torsoH: 1.16, legL: 0.84, armL: 0.9, headScale: 1.08, shoulder: 1.42 },
    palette: { skin: '#c99a6a', torso: '#8a86a8', legs: '#1a1826', accent: '#b9b3e0' },
    hpScale: 1.55, speedScale: 0.72,
  },
  {
    id: 'pipescale',
    name: ['Pipe Scale', '管鳞兵'],
    trait: 'spiked',
    build: { ...BASE, torsoW: 1.2, shoulder: 1.24, torsoH: 1.06 },
    palette: { skin: '#c9a878', torso: '#ff9f43', legs: '#2b1a08', accent: '#ffd166' },
    hpScale: 1.3, speedScale: 0.9,
  },
  {
    id: 'lenser',
    name: ['Lenser', '透镜兵'],
    trait: 'quad',
    build: { ...BASE, torsoW: 1.1, shoulder: 1.3, armL: 0.9 },
    palette: { skin: '#bcd9e8', torso: '#6f94ad', legs: '#101c26', accent: '#2de2ff' },
    hpScale: 1.15, speedScale: 0.98,
  },
  {
    id: 'shardling',
    name: ['Shardling', '碎晶兵'],
    trait: 'crested',
    build: { ...BASE, torsoW: 0.94, torsoH: 0.96, headScale: 1.1 },
    palette: { skin: '#c6f0e2', torso: '#54f0a8', legs: '#0b271c', accent: '#a9ffe0' },
    hpScale: 1.25, speedScale: 1.02,
  },
  {
    id: 'billpost',
    name: ['Billpost', '广告柱兵'],
    trait: 'beacon',
    build: { ...BASE, torsoW: 1.06, torsoH: 1.2, legL: 0.94, headScale: 0.94 },
    palette: { skin: '#e8bfc9', torso: '#ff2d6a', legs: '#2a0f18', accent: '#ffb703' },
    hpScale: 1.2, speedScale: 0.88,
  },
  {
    id: 'scaffoldmaster',
    name: ['Scaffold Master', '脚手架领主'],
    trait: 'veteran',
    build: { ...BASE, torsoW: 1.24, torsoH: 1.1, legL: 1.02, shoulder: 1.28, armL: 1.08 },
    palette: { skin: '#d8b48c', torso: '#c77dff', legs: '#1c1030', accent: '#ff2d6a' },
    hpScale: 1.6, speedScale: 1.08,
  },
];

export function enemyForLevel(level: number): EnemyDef {
  return ENEMIES[level % ENEMIES.length]!;
}

/** Chassis are for the player; enemies use the same build type so the figure code is shared. */
export type { BrickBuild };
