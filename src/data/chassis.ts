import type { BrickPalette } from '../entities/BrickCharacter';

/**
 * Character chassis — the player rebuilt.
 *
 * The brick idea taken all the way through: you are not a fixed character, you are a pile of
 * bricks that can be reassembled into a different shape. Salvage comes from kills, so the
 * mechanic ties directly into combat rather than being a menu.
 *
 * A chassis changes the figure's proportions, not just its stats — a scout is visibly leaner
 * and longer-legged, a tank is visibly wider and squatter. If the silhouette did not change,
 * the rebuild would not read as a rebuild.
 */

export type ChassisId = 'standard' | 'scout' | 'tank' | 'flier';

export type ChassisBuild = {
  torsoW: number;
  torsoH: number;
  legL: number;
  armL: number;
  headScale: number;
  shoulder: number;
};

export type ChassisDef = {
  id: ChassisId;
  name: readonly [string, string];
  blurb: readonly [string, string];
  /** Total kills before this chassis can be built. */
  kills: number;
  maxHp: number;
  /** Multiplies the base run speed. */
  speed: number;
  /** Multiplies the jump impulse. */
  jump: number;
  build: ChassisBuild;
  palette: BrickPalette;
};

const BASE_BUILD: ChassisBuild = {
  torsoW: 1,
  torsoH: 1,
  legL: 1,
  armL: 1,
  headScale: 1,
  shoulder: 1,
};

export const CHASSIS: readonly ChassisDef[] = [
  {
    id: 'standard',
    name: ['Standard', '标准型'],
    blurb: ['The kit you landed in.', '你降落时的那套。'],
    kills: 0,
    maxHp: 100,
    speed: 1,
    jump: 1,
    build: BASE_BUILD,
    palette: { skin: '#f2c9a0', torso: '#2de2ff', legs: '#0d1b2a', accent: '#5ef0ff' },
  },
  {
    id: 'scout',
    name: ['Scout', '侦察型'],
    blurb: ['Leaner and faster. Fewer bricks to lose.', '更瘦更快，但也更脆。'],
    kills: 6,
    maxHp: 74,
    speed: 1.28,
    jump: 1.22,
    build: { torsoW: 0.82, torsoH: 0.94, legL: 1.18, armL: 1.1, headScale: 1, shoulder: 0.86 },
    palette: { skin: '#f2c9a0', torso: '#ffe66d', legs: '#2a2410', accent: '#ffd23f' },
  },
  {
    id: 'tank',
    name: ['Bulwark', '重装型'],
    blurb: ['Wide, slow, and hard to knock over.', '又宽又慢，但很难被打倒。'],
    kills: 14,
    maxHp: 165,
    speed: 0.84,
    jump: 0.86,
    build: { torsoW: 1.32, torsoH: 1.1, legL: 0.92, armL: 0.92, headScale: 1.06, shoulder: 1.3 },
    palette: { skin: '#d4a574', torso: '#ff2d6a', legs: '#1b1220', accent: '#ff6b9d' },
  },
  {
    id: 'flier',
    name: ['Skirmisher', '游走型'],
    blurb: ['Light frame, high jump, built to keep moving.', '轻装、高跳，专为不停移动而生。'],
    kills: 24,
    maxHp: 88,
    speed: 1.16,
    jump: 1.55,
    build: { torsoW: 0.92, torsoH: 1.02, legL: 1.26, armL: 1.02, headScale: 0.96, shoulder: 0.94 },
    palette: { skin: '#f2c9a0', torso: '#54f0a8', legs: '#0d2418', accent: '#7df9ff' },
  },
];

export const DEFAULT_CHASSIS: ChassisId = 'standard';

export function chassisById(id: ChassisId): ChassisDef {
  return CHASSIS.find((c) => c.id === id) ?? CHASSIS[0]!;
}

/** Chassis the player has earned the salvage for. */
export function unlockedChassis(kills: number): ChassisDef[] {
  return CHASSIS.filter((c) => kills >= c.kills);
}

/** Next chassis and how many kills it still needs, for the HUD progress readout. */
export function nextChassis(kills: number): { def: ChassisDef; remaining: number } | null {
  const locked = CHASSIS.filter((c) => kills < c.kills).sort((a, b) => a.kills - b.kills);
  const def = locked[0];
  return def ? { def, remaining: def.kills - kills } : null;
}
