import * as THREE from 'three';
import type { WeaponId } from '../data/weapons';

/**
 * A visible gun, built from bricks.
 *
 * Every weapon used to share one placeholder gun mesh tinted to the muzzle colour, so the
 * arsenal was distinguishable only by tracer. Fused weapons especially need a silhouette —
 * the whole point of rebuilding two guns is that you can *see* the result.
 *
 * Builders take the weapon's own colour and a scale, and every gun returns a small
 * representative shape rather than a realistic firearm: at third-person distance only the
 * outline and the glow read anyway.
 */

export type GunBuilder = (color: string, accent: string) => THREE.Group;

const plastic = (color: string, roughness = 0.34, metalness = 0.3) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
const glow = (color: string, intensity = 0.9) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });

function shape(
  parts: Array<{ geo: THREE.BufferGeometry; pos: [number, number, number]; mat: THREE.Material; rot?: [number, number, number] }>,
): THREE.Group {
  const g = new THREE.Group();
  for (const p of parts) {
    const m = new THREE.Mesh(p.geo, p.mat);
    m.position.set(...p.pos);
    if (p.rot) m.rotation.set(...p.rot);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r1: number, r2: number, h: number, seg = 10) => new THREE.CylinderGeometry(r1, r2, h, seg);

function glowing(color: string): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 1.4, roughness: 0.3,
  });
}

/** Barrel points down +Z, matching the arm's forward axis. */
export const GUN_BUILDERS: Partial<Record<WeaponId, GunBuilder>> = {
  pulse: (c, a) => shape([
    { geo: box(0.2, 0.24, 0.62), pos: [0, 0, 0.06], mat: plastic(c) },
    { geo: cyl(0.05, 0.05, 0.34), pos: [0, 0.02, 0.5], mat: plastic('#2a3140'), rot: [Math.PI / 2, 0, 0] },
    { geo: box(0.1, 0.1, 0.06), pos: [0, 0.02, 0.66], mat: glow(a) },
    { geo: box(0.12, 0.24, 0.14), pos: [0, -0.22, -0.1], mat: plastic('#1b2436', 0.45) },
  ]),

  scatter: (c, a) => shape([
    { geo: box(0.26, 0.3, 0.72), pos: [0, 0, 0.04], mat: plastic(c) },
    { geo: cyl(0.09, 0.11, 0.5), pos: [0, 0.0, 0.52], mat: plastic('#2a3140'), rot: [Math.PI / 2, 0, 0] },
    { geo: box(0.3, 0.08, 0.12), pos: [0, 0.1, 0.74], mat: glow(a, 0.7) },
    // twin drums — the scatter gun's silhouette marker
    { geo: cyl(0.11, 0.11, 0.2), pos: [0, -0.16, 0.14], mat: plastic('#39414f'), rot: [Math.PI / 2, 0, 0] },
    { geo: box(0.12, 0.26, 0.16), pos: [0, -0.24, -0.12], mat: plastic('#1b2436', 0.45) },
  ]),

  rail: (c, a) => shape([
    { geo: box(0.18, 0.22, 0.86), pos: [0, 0, 0.06], mat: plastic(c) },
    // long rail + charge coils
    { geo: box(0.06, 0.06, 0.5), pos: [0, 0.16, 0.4], mat: glow(a) },
    { geo: cyl(0.07, 0.07, 0.1), pos: [0, 0, 0.34], mat: glowing('#c77dff') },
    { geo: cyl(0.07, 0.07, 0.1), pos: [0, 0, 0.54], mat: glowing('#c77dff') },
    { geo: cyl(0.045, 0.045, 0.36), pos: [0, 0, 0.66], mat: plastic('#2a3140'), rot: [Math.PI / 2, 0, 0] },
    { geo: box(0.12, 0.24, 0.14), pos: [0, -0.22, -0.14], mat: plastic('#1b2436', 0.45) },
  ]),

  grenade: (c, a) => shape([
    { geo: box(0.24, 0.24, 0.44), pos: [0, 0, -0.04], mat: plastic(c) },
    // fat cylinder — reads as a launcher at a glance
    { geo: cyl(0.14, 0.15, 0.54, 12), pos: [0, 0, 0.42], mat: plastic('#3a4048'), rot: [Math.PI / 2, 0, 0] },
    { geo: cyl(0.16, 0.16, 0.06, 12), pos: [0, 0, 0.68], mat: glow(a, 0.7), rot: [Math.PI / 2, 0, 0] },
    { geo: box(0.12, 0.26, 0.16), pos: [0, -0.22, -0.12], mat: plastic('#1b2436', 0.45) },
  ]),

  arc: (c, a) => shape([
    { geo: box(0.22, 0.26, 0.5), pos: [0, 0, 0], mat: plastic(c) },
    // forked prongs + an arc gap you can see the charge jump across
    { geo: box(0.05, 0.05, 0.44), pos: [-0.14, 0.06, 0.42], mat: plastic('#39414f') },
    { geo: box(0.05, 0.05, 0.44), pos: [0.14, 0.06, 0.42], mat: plastic('#39414f') },
    { geo: new THREE.SphereGeometry(0.07, 10, 8), pos: [-0.14, 0.06, 0.64], mat: glow(a, 1.3) },
    { geo: new THREE.SphereGeometry(0.07, 10, 8), pos: [0.14, 0.06, 0.64], mat: glow(a, 1.3) },
    { geo: box(0.12, 0.24, 0.14), pos: [0, -0.22, -0.1], mat: plastic('#1b2436', 0.45) },
  ]),

  plasma: (c, a) => shape([
    { geo: box(0.3, 0.32, 0.55), pos: [0, 0, -0.02], mat: plastic(c) },
    // big emitter dish
    { geo: cyl(0.24, 0.16, 0.3, 14), pos: [0, 0, 0.44], mat: plastic('#3a4048'), rot: [Math.PI / 2, 0, 0] },
    { geo: cyl(0.17, 0.17, 0.06, 14), pos: [0, 0, 0.6], mat: glow(a, 1.2), rot: [Math.PI / 2, 0, 0] },
    { geo: cyl(0.12, 0.12, 0.26, 12), pos: [0, 0.2, 0.1], mat: plastic('#2a3140'), rot: [0, 0, 0] },
    { geo: box(0.12, 0.28, 0.16), pos: [0, -0.26, -0.12], mat: plastic('#1b2436', 0.45) },
  ]),
};

/**
 * Fused weapons get distinct, chunkier silhouettes — they are made of two guns, so they read
 * as visibly over-built compared to the base six.
 */
GUN_BUILDERS.needler = (c, a) => shape([
  { geo: box(0.17, 0.2, 0.8), pos: [0, 0, 0.06], mat: plastic(c) },
  { geo: box(0.05, 0.05, 0.6), pos: [-0.1, 0.04, 0.44], mat: plastic('#39414f') },
  { geo: box(0.05, 0.05, 0.6), pos: [0.1, 0.04, 0.44], mat: plastic('#39414f') },
  // needle stack: three slim rails instead of the rail rifle's two coils
  { geo: cyl(0.02, 0.02, 0.7), pos: [0, 0.1, 0.5], mat: glow(a, 1.2), rot: [Math.PI / 2, 0, 0] },
  { geo: cyl(0.02, 0.02, 0.7), pos: [-0.07, 0.1, 0.5], mat: glow(a, 1.0), rot: [Math.PI / 2, 0, 0] },
  { geo: cyl(0.02, 0.02, 0.7), pos: [0.07, 0.1, 0.5], mat: glow(a, 1.0), rot: [Math.PI / 2, 0, 0] },
  { geo: box(0.12, 0.24, 0.14), pos: [0, -0.2, -0.16], mat: plastic('#1b2436', 0.45) },
]);

GUN_BUILDERS.flak = (c, a) => shape([
  { geo: box(0.3, 0.28, 0.4), pos: [0, 0, -0.08], mat: plastic(c) },
  // four stubby barrels fanned out — scatter plus grenade, literally
  { geo: cyl(0.06, 0.07, 0.42, 10), pos: [-0.09, 0.05, 0.36], mat: plastic('#3a4048'), rot: [Math.PI / 2, 0, 0] },
  { geo: cyl(0.06, 0.07, 0.42, 10), pos: [0.09, 0.05, 0.36], mat: plastic('#3a4048'), rot: [Math.PI / 2, 0, 0] },
  { geo: cyl(0.06, 0.07, 0.42, 10), pos: [-0.09, -0.1, 0.36], mat: plastic('#3a4048'), rot: [Math.PI / 2, 0, 0] },
  { geo: cyl(0.06, 0.07, 0.42, 10), pos: [0.09, -0.1, 0.36], mat: plastic('#3a4048'), rot: [Math.PI / 2, 0, 0] },
  { geo: box(0.24, 0.05, 0.06), pos: [0, 0.12, 0.56], mat: glow(a, 0.8) },
  { geo: box(0.12, 0.26, 0.16), pos: [0, -0.26, -0.12], mat: plastic('#1b2436', 0.45) },
]);

GUN_BUILDERS.storm = (c, a) => shape([
  { geo: box(0.28, 0.3, 0.5), pos: [0, 0, -0.04], mat: plastic(c) },
  // caged orb: arc prongs wrapped around a plasma emitter
  { geo: new THREE.SphereGeometry(0.16, 14, 12), pos: [0, 0, 0.46], mat: glow(a, 1.3) },
  { geo: new THREE.TorusGeometry(0.24, 0.025, 8, 20), pos: [0, 0, 0.46], mat: glowing('#7df9ff'), rot: [Math.PI / 2, 0, 0] },
  { geo: new THREE.TorusGeometry(0.24, 0.025, 8, 20), pos: [0, 0, 0.46], mat: glowing('#c77dff'), rot: [0, Math.PI / 2, 0] },
  { geo: box(0.06, 0.06, 0.3), pos: [-0.18, 0.06, 0.3], mat: plastic('#39414f') },
  { geo: box(0.06, 0.06, 0.3), pos: [0.18, 0.06, 0.3], mat: plastic('#39414f') },
  { geo: box(0.12, 0.28, 0.16), pos: [0, -0.26, -0.12], mat: plastic('#1b2436', 0.45) },
]);

export function createGunFigure(id: WeaponId, bodyColor: string, accentColor: string): THREE.Group {
  const build = GUN_BUILDERS[id];
  if (!build) {
    // Unknown weapon: fall back to the pulse shape rather than nothing at all.
    return GUN_BUILDERS.pulse!(bodyColor, accentColor);
  }
  return build(bodyColor, accentColor);
}
