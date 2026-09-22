import * as THREE from 'three';

/**
 * Ten brick-built structure families — one per level.
 *
 * The arena used to reuse a single box for every building, so all ten levels read as the
 * same place in different colours. Each family here has a distinct silhouette you can name
 * from across the map: a mushroom cap, a fruit, a gear stack, a dish mast.
 *
 * Builders return their own collider boxes in local space rather than relying on a single
 * wrapping AABB. A mushroom on a thin stem should be walkable-through at the base and solid
 * at the cap, and that is only possible if the structure declares its own solids.
 */

export type StructureId =
  | 'mushroom'
  | 'fruit'
  | 'gear'
  | 'antenna'
  | 'crate'
  | 'pipe'
  | 'dome'
  | 'crystal'
  | 'billboard'
  | 'scaffold';

export type LocalBox = { x: number; y: number; z: number; hw: number; hh: number; hd: number };

export type StructureBuild = {
  group: THREE.Group;
  /** Colliders, in the structure's own local space (origin at its feet). */
  boxes: LocalBox[];
  /** Rough height, so the level builder can avoid stacking things into it. */
  height: number;
};

export type StructurePalette = {
  body: string;
  trim: string;
  accent: string;
};

const plastic = (color: string, roughness = 0.72, metalness = 0.18) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
const glow = (color: string, intensity = 1.0) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });

/** Collects parts and their colliders as a builder goes. */
class Frame {
  readonly group = new THREE.Group();
  readonly boxes: LocalBox[] = [];
  height = 0;

  /** Add a solid part: mesh plus a matching collider. */
  solid(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: [number, number, number],
    size: [number, number, number],
    rot?: [number, number, number],
  ): void {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    const [w, h, d] = size;
    this.boxes.push({ x: pos[0], y: pos[1], z: pos[2], hw: w / 2, hh: h / 2, hd: d / 2 });
    this.height = Math.max(this.height, pos[1] + h / 2);
  }

  /** Decorative part: no collider. */
  deco(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: [number, number, number],
    rot?: [number, number, number],
  ): void {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true;
    this.group.add(m);
    this.height = Math.max(this.height, pos[1]);
  }
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r1: number, r2: number, h: number, seg = 12) =>
  new THREE.CylinderGeometry(r1, r2, h, seg);
const sphere = (r: number, a = 14, b = 10) => new THREE.SphereGeometry(r, a, b);

/**
 * scale controls the overall footprint so a level can ask for one small one and one large
 * one of the same family without a second builder.
 */
export function createStructure(
  id: StructureId,
  p: StructurePalette,
  scale = 1,
): StructureBuild {
  const f = new Frame();
  const bodyMat = plastic(p.body);
  const trimMat = plastic(p.trim, 0.66, 0.24);
  const accentMat = glow(p.accent, 0.85);
  const s = scale;

  switch (id) {
    // 蘑菇屋 — cap on a stem. Walk under the cap, solid at the stem.
    case 'mushroom': {
      f.solid(cyl(0.9 * s, 1.1 * s, 3.2 * s, 14), bodyMat, [0, 1.6 * s, 0], [1.8 * s, 3.2 * s, 1.8 * s]);
      f.solid(cyl(2.9 * s, 2.2 * s, 1.5 * s, 20), trimMat, [0, 3.9 * s, 0], [5.8 * s, 1.5 * s, 5.8 * s]);
      f.deco(sphere(1.3 * s), trimMat, [0, 4.6 * s, 0]);
      for (const [dx, dz] of [[1.5, 0.6], [-1.2, 1.1], [0.4, -1.7]] as const) {
        f.deco(sphere(0.42 * s), accentMat, [dx * s, 4.65 * s, dz * s]);
      }
      f.deco(cyl(0.22 * s, 0.22 * s, 0.4 * s, 10), accentMat, [0, 0.2 * s, 1.1 * s], [Math.PI / 2, 0, 0]);
      break;
    }

    // 水果屋 — a big round fruit with a leaf and stem.
    case 'fruit': {
      f.solid(box(1.6 * s, 1.2 * s, 1.6 * s), trimMat, [0, 0.6 * s, 0], [1.6 * s, 1.2 * s, 1.6 * s]);
      f.solid(sphere(2.4 * s, 18, 14), bodyMat, [0, 3.4 * s, 0], [3.4 * s, 3.4 * s, 3.4 * s]);
      f.deco(cyl(0.18 * s, 0.22 * s, 1.0 * s, 8), plastic('#6b4a2a', 0.8), [0, 5.6 * s, 0]);
      f.deco(box(1.6 * s, 0.16 * s, 0.7 * s), accentMat, [0.7 * s, 5.9 * s, 0], [0, 0, -0.4]);
      // windows so it reads as a house, not just a fruit
      for (const dx of [-1, 1]) {
        f.deco(box(0.7 * s, 0.7 * s, 0.16 * s), accentMat, [dx * 1.15 * s, 3.5 * s, 1.9 * s]);
      }
      f.deco(box(0.9 * s, 1.2 * s, 0.2 * s), glow(p.accent, 0.5), [0, 1.0 * s, 0.85 * s]);
      break;
    }

    // 齿轮塔 — stacked cog wheels.
    case 'gear': {
      f.solid(cyl(1.9 * s, 2.1 * s, 1.0 * s, 16), trimMat, [0, 0.5 * s, 0], [4.2 * s, 1.0 * s, 4.2 * s]);
      for (let i = 0; i < 3; i++) {
        const y = (1.6 + i * 1.5) * s;
        const r = (1.6 - i * 0.22) * s;
        f.deco(cyl(r, r, 0.7 * s, 16), bodyMat, [0, y, 0]);
        // teeth
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 + i * 0.3;
          f.deco(box(0.42 * s, 0.5 * s, 0.42 * s), trimMat,
            [Math.cos(a) * (r + 0.2 * s), y, Math.sin(a) * (r + 0.2 * s)], [0, -a, 0]);
        }
      }
      f.deco(cyl(0.3 * s, 0.3 * s, 0.6 * s, 10), accentMat, [0, 5.9 * s, 0]);
      f.solid(box(2.4 * s, 3.6 * s, 2.4 * s), plastic(p.body, 0.8), [0, 2.2 * s, 0], [2.4 * s, 3.6 * s, 2.4 * s]);
      break;
    }

    // 天线塔 — tall mast with a dish.
    case 'antenna': {
      f.solid(box(2.2 * s, 0.8 * s, 2.2 * s), trimMat, [0, 0.4 * s, 0], [2.2 * s, 0.8 * s, 2.2 * s]);
      f.solid(cyl(0.42 * s, 0.7 * s, 7.5 * s, 10), bodyMat, [0, 4.4 * s, 0], [1.4 * s, 7.5 * s, 1.4 * s]);
      for (let i = 0; i < 4; i++) {
        const y = (1.8 + i * 1.7) * s;
        f.deco(box(2.6 * s - i * 0.4 * s, 0.14 * s, 0.14 * s), trimMat, [0, y, 0]);
        f.deco(box(0.14 * s, 0.14 * s, 2.6 * s - i * 0.4 * s), trimMat, [0, y, 0]);
      }
      const dish = new THREE.SphereGeometry(1.5 * s, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      f.deco(dish, accentMat, [0, 8.6 * s, 0], [Math.PI * 0.75, 0, 0]);
      f.deco(cyl(0.12 * s, 0.12 * s, 1.6 * s, 8), trimMat, [0, 9.8 * s, 0]);
      break;
    }

    // 货箱堆 — stacked crates with visible brick seams.
    case 'crate': {
      const layers = 4;
      for (let i = 0; i < layers; i++) {
        const w = (3.4 - i * 0.35) * s;
        const y = (0.9 + i * 1.7) * s;
        f.solid(box(w, 1.7 * s, w), i % 2 ? trimMat : bodyMat, [0, y, 0], [w, 1.7 * s, w]);
        // a banded stripe on each crate
        f.deco(box(w + 0.06 * s, 0.18 * s, w + 0.06 * s), accentMat, [0, y + 0.5 * s, 0]);
        // corner studs
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          f.deco(cyl(0.14 * s, 0.14 * s, 0.16 * s, 8), trimMat,
            [sx * w * 0.35, y + 0.9 * s, sz * w * 0.35]);
        }
      }
      break;
    }

    // 管道组 — vertical pipes with elbows.
    case 'pipe': {
      const heights = [5.2, 6.6, 4.4];
      heights.forEach((h, i) => {
        const x = (i - 1) * 1.5 * s;
        f.solid(cyl(0.62 * s, 0.62 * s, h * s, 12), i % 2 ? bodyMat : trimMat,
          [x, (h / 2) * s, 0], [1.24 * s, h * s, 1.24 * s]);
        f.deco(cyl(0.72 * s, 0.72 * s, 0.3 * s, 12), accentMat, [x, h * s, 0]);
        f.deco(cyl(0.78 * s, 0.78 * s, 0.24 * s, 12), trimMat, [x, 0.4 * s, 0]);
      });
      f.deco(cyl(0.5 * s, 0.5 * s, 1.5 * s, 10), bodyMat, [0, 7.2 * s, 0], [0, 0, Math.PI / 2]);
      f.deco(box(4.4 * s, 0.4 * s, 0.4 * s), trimMat, [0, 7.9 * s, 0]);
      break;
    }

    // 穹顶舱 — ribbed dome habitat.
    case 'dome': {
      // Colliders are the base ring and a ring of ribs, NOT one big block. A single lump
      // would fill the habitat's interior and wall in anything placed inside it — which is
      // exactly what happened to two pickups on this level before.
      /*
       * The base ring is a RING, not a disc. A solid 6.8m cylinder fills the habitat floor,
       * so anything placed inside the dome (a pickup, an enemy spawn) is entombed — two
       * pickups on this level were unreachable before this was segmented.
       */
      f.deco(cyl(3.2 * s, 3.4 * s, 0.8 * s, 18), trimMat, [0, 0.4 * s, 0]);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r = 3.1 * s;
        f.solid(box(1.7 * s, 0.8 * s, 0.5 * s), trimMat,
          [Math.cos(a) * r, 0.4 * s, Math.sin(a) * r], [0, -a, 0]);
      }
      const dome = new THREE.SphereGeometry(3.0 * s, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      f.deco(dome, bodyMat, [0, 0.8 * s, 0]);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = 3.0 * s;
        f.solid(box(0.34 * s, 2.6 * s, 0.34 * s), bodyMat,
          [Math.cos(a) * r, 2.0 * s, Math.sin(a) * r], [0.34 * s, 2.6 * s, 0.34 * s]);
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI;
        f.deco(box(0.16 * s, 3.0 * s, 0.16 * s), accentMat,
          [Math.cos(a) * 1.5 * s, 1.9 * s, Math.sin(a) * 1.5 * s]);
      }
      f.deco(cyl(0.5 * s, 0.5 * s, 0.6 * s, 10), accentMat, [0, 3.9 * s, 0]);
      f.deco(box(1.4 * s, 1.4 * s, 0.2 * s), glow(p.accent, 0.45), [0, 1.2 * s, 3.2 * s]);
      break;
    }

    // 水晶簇 — angular spires.
    case 'crystal': {
      f.solid(cyl(2.2 * s, 2.6 * s, 0.7 * s, 10), trimMat, [0, 0.35 * s, 0], [4.6 * s, 0.7 * s, 4.6 * s]);
      const spires: Array<[number, number, number]> = [
        [0, 6.2, 0.9], [1.4, 4.2, 0.6], [-1.5, 3.6, 0.55], [0.9, 3.0, 0.45], [-0.8, 2.4, 0.4],
      ];
      for (const [dx, h, r] of spires) {
        const cone = new THREE.ConeGeometry(r * s, h * s, 6);
        f.solid(cone, bodyMat, [dx * s, (h / 2 + 0.7) * s, (dx * 0.4) * s],
          [r * 2 * s, h * s, r * 2 * s]);
        f.deco(cyl(r * 0.5 * s, r * 0.5 * s, 0.2 * s, 6), accentMat, [dx * s, (h + 0.72) * s, dx * 0.4 * s]);
      }
      break;
    }

    // 广告牌 — frame plus a glowing panel.
    case 'billboard': {
      f.solid(box(1.0 * s, 0.6 * s, 1.0 * s), trimMat, [0, 0.3 * s, 0], [1.0 * s, 0.6 * s, 1.0 * s]);
      for (const dx of [-1.1, 1.1]) {
        f.solid(box(0.3 * s, 6.0 * s, 0.3 * s), trimMat, [dx * s, 3.3 * s, 0],
          [0.3 * s, 6.0 * s, 0.3 * s]);
      }
      f.solid(box(5.4 * s, 3.0 * s, 0.4 * s), bodyMat, [0, 7.4 * s, 0], [5.4 * s, 3.0 * s, 0.4 * s]);
      f.deco(box(4.8 * s, 2.4 * s, 0.12 * s), accentMat, [0, 7.4 * s, 0.28 * s]);
      // scan bars across the screen
      for (let i = 0; i < 4; i++) {
        f.deco(box(4.9 * s, 0.13 * s, 0.06 * s), glow(p.trim, 0.4), [0, (6.5 + i * 0.6) * s, 0.36 * s]);
      }
      f.deco(box(6.4 * s, 0.34 * s, 0.7 * s), trimMat, [0, 9.1 * s, 0]);
      break;
    }

    // 脚手架 — open frame with cross-braces.
    case 'scaffold': {
      const w = 4.2 * s;
      const h = 6.4 * s;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        f.solid(box(0.34 * s, h, 0.34 * s), bodyMat,
          [sx * w / 2, h / 2, sz * w / 2], [0.34 * s, h, 0.34 * s]);
      }
      for (let i = 1; i <= 3; i++) {
        const y = (h / 4) * i;
        f.deco(box(w, 0.22 * s, 0.3 * s), trimMat, [0, y, w / 2]);
        f.deco(box(w, 0.22 * s, 0.3 * s), trimMat, [0, y, -w / 2]);
        f.deco(box(0.3 * s, 0.22 * s, w), trimMat, [w / 2, y, 0]);
        f.deco(box(0.3 * s, 0.22 * s, w), trimMat, [-w / 2, y, 0]);
      }
      // two yellow safety planks
      f.solid(box(w * 0.9, 0.3 * s, 1.4 * s), glow('#ffb703', 0.35), [0, h * 0.5, 0],
        [w * 0.9, 0.3 * s, 1.4 * s]);
      f.deco(box(w * 1.2, 0.2 * s, 0.2 * s), accentMat, [0, h + 0.2 * s, 0]);
      break;
    }
  }

  return { group: f.group, boxes: f.boxes, height: f.height };
}

export const STRUCTURE_IDS: StructureId[] = [
  'mushroom', 'fruit', 'gear', 'antenna', 'crate',
  'pipe', 'dome', 'crystal', 'billboard', 'scaffold',
];
