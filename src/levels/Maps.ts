import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { buildNeonArena, type LevelBuildResult, type Outpost } from './LevelFactory';
import { LEVELS, type Lang, t } from '../data/story';

/**
 * Ten levels, generated from the campaign table in `data/story.ts`.
 *
 * Each level's arena is the same structural template (that is a deliberate scope call —
 * see the acceptance doc), but the layout, palette and objective names all come from the
 * chapter data, and the building set is derived from a per-level seed so no two arenas
 * play the same.
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

/** Outpost centres for an index, spread around the arena and never inside each other. */
function outpostsFor(index: number, lang: Lang): Outpost[] {
  const rnd = mulberry32(index * 977 + 3);
  const centres: [number, number][] = [];
  const angles = [-0.9, 0.35, 2.2];
  for (let i = 0; i < 3; i++) {
    const a = angles[i]! + rnd() * 0.5;
    const r = 12 + rnd() * 7;
    centres.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const labels = LEVELS[index]!.outposts;
  return centres.map(([x, z], i) => ({
    id: (['A', 'B', 'C'] as const)[i]!,
    label: t(labels[i]!, lang),
    center: new THREE.Vector3(Math.round(x), 0, Math.round(z)),
    radius: 5 + i * 0.5,
    cleared: false,
  }));
}

/** Building blocks, scattered clear of the outpost rings. */
function buildingsFor(index: number, outposts: Outpost[]): Array<[number, number, number, number, number]> {
  const rnd = mulberry32(index * 613 + 11);
  const out: Array<[number, number, number, number, number]> = [];
  const clear = (x: number, z: number) =>
    outposts.every((o) => Math.hypot(x - o.center.x, z - o.center.z) > o.radius + 2.6);

  let guard = 0;
  while (out.length < 7 + (index % 3) && guard++ < 200) {
    const x = Math.round((rnd() - 0.5) * 34);
    const z = Math.round((rnd() - 0.5) * 34);
    const w = 3 + Math.round(rnd() * 3);
    const d = 3 + Math.round(rnd() * 3);
    // Height grows with the level so later arenas read as denser.
    const h = 2.2 + rnd() * 2.4 + index * 0.22;
    if (Math.abs(x) > 22 || Math.abs(z) > 22) continue;
    if (!clear(x, z)) continue;
    if (out.some(([ox, oz, ow, , od]) => Math.abs(ox - x) < (ow + w) / 2 + 2 && Math.abs(oz - z) < (od + d) / 2 + 2)) continue;
    out.push([x, z, w, h, d]);
  }
  return out;
}

export function createLevel(physics: PhysicsWorld, index: number, lang: Lang): LevelBuildResult {
  const chapter = LEVELS[index]!;
  const outposts = outpostsFor(index, lang);
  const angle = 1.1 + index * 0.9;
  const spawn = new THREE.Vector3(Math.round(Math.cos(angle) * 21), 1.2, Math.round(Math.sin(angle) * 21));

  return buildNeonArena(physics, {
    name: t(chapter.name, lang),
    mapIndex: index,
    floorColor: chapter.floorColor,
    buildingColor: chapter.buildingColor,
    neonA: chapter.neonA,
    neonB: chapter.neonB,
    outposts,
    spawn,
    buildings: buildingsFor(index, outposts),
  });
}
