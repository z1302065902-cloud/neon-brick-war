import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import {
  buildNeonArena,
  type DeckSpec,
  type LevelBuildResult,
  type Outpost,
  type StairSpec,
} from './LevelFactory';
import { createSkyline } from './Skyline';
import { LEVELS, type Lang, t } from '../data/story';

/**
 * Ten levels generated from the campaign table.
 *
 * Each arena is the same structural skeleton but the layout, palette, vertical structure and
 * lighting grade all come from the chapter, so no two read the same. The building set, deck
 * placement and skyline are derived from a per-level seed, which keeps a level identical
 * between reloads while making it different from its neighbours.
 */

/** Deterministic per-level jitter so a level always builds the same way. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per-level lighting and post grade. This is what makes each level feel different in mood. */
export type Grading = {
  exposure: number;
  fogNear: number;
  fogFar: number;
  hemi: number;
  key: number;
  keyColor: string;
  fill: number;
  fillColor: string;
  bloom: number;
};

export function gradingFor(index: number): Grading {
  const t = index / Math.max(1, LEVELS.length - 1);
  // Bright and open at the docks, dimmer, more saturated and hazier as the campaign closes in.
  return {
    exposure: 1.22 - t * 0.28,
    fogNear: 42 - t * 10,
    fogFar: 130 - t * 46,
    hemi: 1.15 - t * 0.3,
    key: 1.45 + t * 0.35,
    keyColor: index < 3 ? '#fff7e8' : index < 6 ? '#ffe9c8' : index < 8 ? '#ffd6b0' : '#ffc2a8',
    fill: 1.6 + t * 1.4,
    fillColor: LEVELS[index]!.neonA,
    bloom: 0.42 + t * 0.3,
  };
}

function outpostsFor(index: number, lang: Lang): Outpost[] {
  const rnd = mulberry32(index * 977 + 3);
  const angles = [-0.9, 0.35, 2.2];
  const labels = LEVELS[index]!.outposts;
  return angles.map((a0, i) => {
    const a = a0 + rnd() * 0.5;
    const r = 12 + rnd() * 7;
    return {
      id: (['A', 'B', 'C'] as const)[i]!,
      label: t(labels[i]!, lang),
      center: new THREE.Vector3(Math.round(Math.cos(a) * r), 0, Math.round(Math.sin(a) * r)),
      radius: 5 + i * 0.5,
      cleared: false,
    };
  });
}

/**
 * Blocks and towers, scattered clear of the outpost rings and of each other. Later levels get
 * a denser, taller city, which is most of what makes the campaign feel like it escalates.
 */
/**
 * Footprint a stair run occupies, measured from its spec. Used to keep buildings off it —
 * a staircase with a tower dropped on top is a staircase nobody can climb.
 */
function stairFootprint(s: StairSpec): { x0: number; x1: number; z0: number; z1: number } {
  const run = s.run ?? Math.max(2.4, (s.y1 - s.y0) * 2.0);
  const dx = s.dir === 'e' ? 1 : s.dir === 'w' ? -1 : 0;
  const dz = s.dir === 's' ? 1 : s.dir === 'n' ? -1 : 0;
  const half = s.w / 2;
  return {
    x0: Math.min(s.x, s.x + dx * run) - (dx ? 0 : half),
    x1: Math.max(s.x, s.x + dx * run) + (dx ? 0 : half),
    z0: Math.min(s.z, s.z + dz * run) - (dz ? 0 : half),
    z1: Math.max(s.z, s.z + dz * run) + (dz ? 0 : half),
  };
}

function buildingsFor(
  index: number,
  outposts: Outpost[],
  decks: DeckSpec[],
  stairs: StairSpec[],
): Array<[number, number, number, number, number]> {
  const rnd = mulberry32(index * 613 + 11);
  const out: Array<[number, number, number, number, number]> = [];
  const want = 8 + (index % 4) + Math.floor(index / 3);
  const runs = stairs.map(stairFootprint);
  const clear = (x: number, z: number, w: number, d: number) =>
    outposts.every((o) => Math.hypot(x - o.center.x, z - o.center.z) > o.radius + w) &&
    decks.every((k) => Math.abs(x - k.x) > k.w / 2 + w / 2 + 1.5 || Math.abs(z - k.z) > k.d / 2 + d / 2 + 1.5) &&
    runs.every((r) => x - w / 2 - 1.2 > r.x1 || r.x0 > x + w / 2 + 1.2 || z - d / 2 - 1.2 > r.z1 || r.z0 > z + d / 2 + 1.2);

  let guard = 0;
  while (out.length < want && guard++ < 400) {
    const x = Math.round((rnd() - 0.5) * 34);
    const z = Math.round((rnd() - 0.5) * 34);
    const w = 3 + Math.round(rnd() * 3);
    const d = 3 + Math.round(rnd() * 3);
    // Heights climb with the level so the skyline of the arena itself changes between maps.
    const h = 2.4 + rnd() * 2.6 + index * 0.34;
    if (Math.abs(x) > 22 || Math.abs(z) > 22) continue;
    if (!clear(x, z, w, d)) continue;
    if (out.some(([ox, oz, ow, , od]) =>
      Math.abs(ox - x) < (ow + w) / 2 + 2 && Math.abs(oz - z) < (od + d) / 2 + 2)) continue;
    out.push([x, z, w, h, d]);
  }
  return out;
}

/**
 * Raised decks with a staircase each. Two are placed next to outposts, so taking the high
 * ground is a real tactical option rather than scenery; the rest add cover lanes.
 */
function verticalFor(
  index: number,
  outposts: Outpost[],
): { decks: DeckSpec[]; stairs: StairSpec[] } {
  const rnd = mulberry32(index * 331 + 29);
  const decks: DeckSpec[] = [];
  const stairs: StairSpec[] = [];

  const place = (x: number, z: number, w: number, d: number, y: number) => {
    decks.push({ x, z, w, d, y });
    // Ramp line, running from the deck edge out toward the arena centre.
    const towardsCentre = Math.atan2(-z, -x);
    const dir: StairSpec['dir'] =
      Math.abs(Math.cos(towardsCentre)) > Math.abs(Math.sin(towardsCentre))
        ? Math.cos(towardsCentre) > 0 ? 'e' : 'w'
        : Math.sin(towardsCentre) > 0 ? 's' : 'n';
    const outX = dir === 'e' ? 1 : dir === 'w' ? -1 : 0;
    const outZ = dir === 's' ? 1 : dir === 'n' ? -1 : 0;
    const run = Math.max(2.4, y * 2.0);
    // addRamp climbs from its anchor in the +dir direction, so anchor it at the far end and
    // point it back down-and-in toward the deck edge. Anchoring at the edge and pointing
    // outward laid the ramp straight across the deck's own footprint.
    const inward: StairSpec['dir'] =
      outX > 0 ? 'w' : outX < 0 ? 'e' : outZ > 0 ? 'n' : 's';
    stairs.push({
      x: x + outX * (w / 2 + run),
      z: z + outZ * (d / 2 + run),
      w: 2.6,
      y0: 0,
      y1: y,
      dir: inward,
      run,
    });
  };

  // One deck overlooking each of the first two outposts.
  for (let i = 0; i < 2; i++) {
    const op = outposts[i]!;
    const a = rnd() * Math.PI * 2;
    const r = op.radius + 5.5;
    const x = Math.round(op.center.x + Math.cos(a) * r);
    const z = Math.round(op.center.z + Math.sin(a) * r);
    if (Math.abs(x) < 21 && Math.abs(z) < 21) {
      place(x, z, 5 + Math.round(rnd() * 3), 5 + Math.round(rnd() * 3), 2.4 + rnd() * 0.8);
    }
  }
  // A taller lookout, higher on later levels.
  const extra = 1 + (index % 2);
  for (let i = 0; i < extra; i++) {
    const x = Math.round((rnd() - 0.5) * 30);
    const z = Math.round((rnd() - 0.5) * 30);
    if (Math.abs(x) > 20 || Math.abs(z) > 20) continue;
    if (outposts.some((o) => Math.hypot(x - o.center.x, z - o.center.z) < o.radius + 4)) continue;
    place(x, z, 4 + Math.round(rnd() * 2), 4 + Math.round(rnd() * 2), 3.4 + (index % 4) * 0.5);
  }
  return { decks, stairs };
}

export function createLevel(physics: PhysicsWorld, index: number, lang: Lang): LevelBuildResult {
  const chapter = LEVELS[index]!;
  const outposts = outpostsFor(index, lang);
  const { decks, stairs } = verticalFor(index, outposts);
  const angle = 1.1 + index * 0.9;
  const spawn = new THREE.Vector3(
    Math.round(Math.cos(angle) * 21),
    1.2,
    Math.round(Math.sin(angle) * 21),
  );

  const result = buildNeonArena(physics, {
    name: t(chapter.name, lang),
    mapIndex: index,
    floorColor: chapter.floorColor,
    buildingColor: chapter.buildingColor,
    neonA: chapter.neonA,
    neonB: chapter.neonB,
    outposts,
    spawn,
    buildings: buildingsFor(index, outposts, decks, stairs),
    decks,
    ramps: stairs,
    structures: LEVELS[index]!.structures,
  });

  // Background city, in the chapter's own colours so the horizon matches the arena.
  result.group.add(
    createSkyline({
      innerRadius: result.halfExtent,
      bodyColor: chapter.buildingColor,
      neonA: chapter.neonA,
      neonB: chapter.neonB,
      seed: index,
    }),
  );

  return result;
}
