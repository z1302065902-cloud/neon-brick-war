import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Brick-built background city.
 *
 * Everything visible is stacked bricks, so the horizon reads as the same toy language as the
 * arena instead of a flat gradient. Two rings of towers sit outside the playable arena: a near
 * band that gives the wall something to be silhouetted against, and a far band that reads as
 * the rest of the city.
 *
 * Baked into two merged meshes — one for tower bodies, one for the lit window strips — so the
 * whole skyline costs two draw calls no matter how many bricks are in it.
 */

type Tower = {
  x: number;
  z: number;
  w: number;
  d: number;
  base: number;
  segs: number;
  body: THREE.Color;
  glow: THREE.Color;
};

const BRICK = 1.1;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export type SkylineOptions = {
  /** Don't build inside this radius — that is the playable arena. */
  innerRadius: number;
  bodyColor: THREE.ColorRepresentation;
  neonA: THREE.ColorRepresentation;
  neonB: THREE.ColorRepresentation;
  seed: number;
  /** Ring count. More rings cost nothing extra — it is all one merged mesh. */
  density?: number;
};

export function createSkyline(opts: SkylineOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Skyline';
  const rand = rng(opts.seed * 7919 + 13);
  const bodyBase = new THREE.Color(opts.bodyColor);
  const neonA = new THREE.Color(opts.neonA);
  const neonB = new THREE.Color(opts.neonB);

  const towers: Tower[] = [];
  const rings = [
    { r: opts.innerRadius + 8, n: opts.density ?? 16, hMin: 6, hMax: 20 },
    { r: opts.innerRadius + 26, n: Math.round((opts.density ?? 16) * 1.1), hMin: 10, hMax: 34 },
    { r: opts.innerRadius + 50, n: Math.round((opts.density ?? 16) * 1.2), hMin: 14, hMax: 48 },
  ];

  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2 + rand() * 0.14;
      const r = ring.r * (0.88 + rand() * 0.26);
      const segH = ring.hMax / 12;
      const h = ring.hMin + rand() * (ring.hMax - ring.hMin);
      const count = Math.max(3, Math.round(h / segH));
      // Slight tint drift per tower so a row of them does not read as one flat colour.
      const body = bodyBase.clone().offsetHSL((rand() - 0.5) * 0.04, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.12);
      towers.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        w: (1 + Math.floor(rand() * 3)) * BRICK,
        d: (1 + Math.floor(rand() * 3)) * BRICK,
        base: 0,
        segs: count,
        body,
        glow: rand() > 0.5 ? neonA.clone() : neonB.clone(),
      });
    }
  }

  // ---- bake into merged geometry ----
  const bodyGeos: THREE.BufferGeometry[] = [];
  const glowGeos: THREE.BufferGeometry[] = [];
  const box = new THREE.BoxGeometry(1, 1, 1);

  const paint = (geo: THREE.BufferGeometry, color: THREE.Color) => {
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = color.r;
      arr[i * 3 + 1] = color.g;
      arr[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  };

  for (const t of towers) {
    for (let i = 0; i < t.segs; i++) {
      const h = BRICK;
      const y = t.base + i * h + h / 2;
      // Each brick steps in slightly as it rises, which is what makes it read as stacked.
      const taper = 1 - i * 0.012;
      const g = box.clone();
      g.scale(t.w * taper, h * 0.98, t.d * taper);
      g.translate(t.x, y, t.z);
      bodyGeos.push(paint(g, t.body));

      // A lit window band on every third brick.
      if (i % 3 === 2) {
        const w = box.clone();
        w.scale(t.w * taper * 1.04, h * 0.22, t.d * taper * 1.04);
        w.translate(t.x, y, t.z);
        glowGeos.push(paint(w, t.glow));
      }
    }
  }

  const bodies = mergeGeometries(bodyGeos, false);
  const glows = mergeGeometries(glowGeos, false);
  for (const g of bodyGeos) g.dispose();
  for (const g of glowGeos) g.dispose();
  box.dispose();

  if (bodies) {
    const mesh = new THREE.Mesh(
      bodies,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.12 }),
    );
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  }
  if (glows) {
    const mesh = new THREE.Mesh(
      glows,
      new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    );
    group.add(mesh);
  }

  return group;
}
