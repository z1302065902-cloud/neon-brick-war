import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

export type Outpost = {
  id: 'A' | 'B' | 'C';
  label: string;
  center: THREE.Vector3;
  radius: number;
  cleared: boolean;
};

/** A raised platform: a slab on four legs, so there is room to fight underneath. */
export type DeckSpec = { x: number; z: number; w: number; d: number; y: number };
/** A flight of stacked steps. `dir` is the direction of ascent. */
export type StairSpec = {
  x: number;
  z: number;
  w: number;
  y0: number;
  y1: number;
  dir: 'n' | 's' | 'e' | 'w';
  /** Horizontal distance covered. Defaults to twice the rise. */
  run?: number;
};

/** Axis-aligned solid, mirrored from a static collider so push-out can be solved exactly. */
export type SolidBox = {
  x: number;
  y: number;
  z: number;
  hw: number;
  hh: number;
  hd: number;
  /**
   * Sloped geometry. The push-out solver is axis-aligned and would treat a ramp as a wall,
   * so tagged ramps are skipped there and left entirely to Rapier — which handles slopes
   * natively and is exactly what a character controller should rely on for them.
   */
  ramp?: boolean;
};

export type LevelBuildResult = {
  group: THREE.Group;
  outposts: Outpost[];
  spawnPoint: THREE.Vector3;
  halfExtent: number;
  name: string;
  /** Zero-based level index into the campaign table. */
  mapIndex: number;
  /** Every static solid in the arena, for exact capsule push-out. */
  blocks: SolidBox[];
};

function addBuilding(
  group: THREE.Group,
  physics: PhysicsWorld,
  x: number,
  z: number,
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  blocks: SolidBox[],
): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  physics.addStaticBox(w / 2, h / 2, d / 2, x, h / 2, z);
  blocks.push({ x, y: h / 2, z, hw: w / 2, hh: h / 2, hd: d / 2 });
}

/**
 * Raised platform. Deliberately built as a slab on visible legs rather than one solid block:
 * it reads as a constructed brick deck, and the space underneath becomes usable cover, which
 * is what makes a multi-level arena play differently instead of just being taller.
 */
function addDeck(
  group: THREE.Group,
  physics: PhysicsWorld,
  blocks: SolidBox[],
  mat: THREE.Material,
  spec: DeckSpec,
): void {
  const slabH = 0.6;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(spec.w, slabH, spec.d), mat);
  slab.position.set(spec.x, spec.y - slabH / 2, spec.z);
  slab.castShadow = true;
  slab.receiveShadow = true;
  group.add(slab);
  physics.addStaticBox(spec.w / 2, slabH / 2, spec.d / 2, spec.x, spec.y - slabH / 2, spec.z);
  blocks.push({ x: spec.x, y: spec.y - slabH / 2, z: spec.z, hw: spec.w / 2, hh: slabH / 2, hd: spec.d / 2 });

  const legHalf = 0.3;
  const legH = spec.y - slabH;
  if (legH <= 0.3) return;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = spec.x + sx * (spec.w / 2 - legHalf);
      const pz = spec.z + sz * (spec.d / 2 - legHalf);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(legHalf * 2, legH, legHalf * 2), mat);
      leg.position.set(px, legH / 2, pz);
      leg.castShadow = true;
      group.add(leg);
      physics.addStaticBox(legHalf, legH / 2, legHalf, px, legH / 2, pz);
      blocks.push({ x: px, y: legH / 2, z: pz, hw: legHalf, hh: legH / 2, hd: legHalf });
    }
  }
}

/**
 * Stacked-brick staircase. Steps rather than a ramp on purpose: a rotated collider would
 * break the axis-aligned push-out solver, and stepped bricks are what a real brick staircase
 * looks like anyway. The 0.22 rise is under the capsule's rounded foot so it walks up unaided.
 */
/**
 * A climbable ramp.
 *
 * Stepped stairs were the obvious brick look, but a dynamic capsule cannot walk up a 0.22m
 * step: the contact on the riser sits below the capsule's rounded foot, so its normal points
 * sideways and the solver pushes the player back instead of up. Simulating a step-up to force
 * it produced a hover-oscillation instead of a climb.
 *
 * So the collider is one rotated box — Rapier walks those natively — and the visible steps are
 * decorative strips laid on top of it. Brick staircase to look at, clean slope to walk on.
 */
function addRamp(
  group: THREE.Group,
  physics: PhysicsWorld,
  blocks: SolidBox[],
  mat: THREE.Material,
  spec: StairSpec,
): void {
  const run = Math.max(1.2, spec.run ?? (spec.y1 - spec.y0) * 2.0);
  const rise = spec.y1 - spec.y0;
  const len = Math.hypot(run, rise);
  const angle = Math.atan2(rise, run);
  const dx = spec.dir === 'e' ? 1 : spec.dir === 'w' ? -1 : 0;
  const dz = spec.dir === 's' ? 1 : spec.dir === 'n' ? -1 : 0;
  const thick = 0.7;

  /*
   * Sink the box by half its thickness along the surface normal, so the ramp's *top* face
   * runs from (anchor, y0) to (end, y1). Without this the box's own thickness leaves a
   * ~0.4m lip at the bottom of the run, and a capsule cannot climb that — the player walks
   * up to the ramp and stops dead against it.
   */
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const midX = spec.x + dx * run / 2 + dx * (thick / 2) * sin;
  const midZ = spec.z + dz * run / 2 + dz * (thick / 2) * sin;
  const midY = spec.y0 + rise / 2 - (thick / 2) * cos;

  const geom = dx !== 0
    ? new THREE.BoxGeometry(len, thick, spec.w)
    : new THREE.BoxGeometry(spec.w, thick, len);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(midX, midY, midZ);
  if (dx !== 0) mesh.rotation.z = angle * dx;
  else mesh.rotation.x = -angle * dz;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const rot = new THREE.Quaternion().setFromEuler(mesh.rotation);
  const collider = physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(
      dx !== 0 ? len / 2 : spec.w / 2,
      thick / 2,
      dz !== 0 ? len / 2 : spec.w / 2,
    ).setRotation(rot).setTranslation(midX, midY, midZ),
  );
  void collider;
  blocks.push({ x: midX, y: midY, z: midZ,
                hw: dx !== 0 ? len / 2 : spec.w / 2,
                hh: thick / 2,
                hd: dz !== 0 ? len / 2 : spec.w / 2,
                ramp: true });

  // Decorative treads: the staircase you see, with no collision of their own.
  const treadCount = Math.max(3, Math.round(rise / 0.22));
  for (let i = 0; i < treadCount; i++) {
    const f = (i + 0.5) / treadCount;
    const px = spec.x + dx * run * f;
    const pz = spec.z + dz * run * f;
    const py = spec.y0 + rise * f + 0.06;
    const tread = new THREE.Mesh(
      dx !== 0
        ? new THREE.BoxGeometry(0.34, 0.1, spec.w)
        : new THREE.BoxGeometry(spec.w, 0.1, 0.34),
      mat,
    );
    tread.position.set(px, py, pz);
    if (dx !== 0) tread.rotation.z = angle * dx;
    else tread.rotation.x = -angle * dz;
    tread.castShadow = true;
    group.add(tread);
  }
}

export function buildNeonArena(
  physics: PhysicsWorld,
  opts: {
    name: string;
    mapIndex: number;
    floorColor: string;
    buildingColor: string;
    neonA: string;
    neonB: string;
    outposts: Outpost[];
    spawn: THREE.Vector3;
    buildings: Array<[number, number, number, number, number]>;
    decks?: DeckSpec[];
    stairs?: StairSpec[];
    halfExtent?: number;
  },
): LevelBuildResult {
  const group = new THREE.Group();
  const half = opts.halfExtent ?? 28;
  const blocks: SolidBox[] = [];

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2, half * 2),
    new THREE.MeshStandardMaterial({
      color: opts.floorColor,
      emissive: opts.floorColor,
      emissiveIntensity: 0.08,
      roughness: 0.55,
      metalness: 0.05,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  physics.addGround(half, half, 0);

  // A floor grid costs almost nothing and does the heavy lifting for scale and motion
  // feedback — without it the arena reads as one flat slab of colour.
  const grid = new THREE.GridHelper(
    half * 2,
    Math.round(half),
    new THREE.Color(opts.neonA),
    new THREE.Color(opts.neonA),
  );
  grid.position.y = 0.02;
  const gridMat = grid.material as THREE.LineBasicMaterial;
  gridMat.transparent = true;
  gridMat.opacity = 0.16;
  group.add(grid);

  const buildingMat = new THREE.MeshStandardMaterial({
    color: opts.buildingColor,
    roughness: 0.7,
    metalness: 0.35,
  });
  const neonA = new THREE.MeshStandardMaterial({
    color: opts.neonA,
    emissive: opts.neonA,
    emissiveIntensity: 1.4,
    roughness: 0.3,
  });
  const neonB = new THREE.MeshStandardMaterial({
    color: opts.neonB,
    emissive: opts.neonB,
    emissiveIntensity: 1.2,
    roughness: 0.3,
  });

  const wallH = 4;
  addBuilding(group, physics, 0, -half, half * 2, wallH, 1.2, buildingMat, blocks);
  addBuilding(group, physics, 0, half, half * 2, wallH, 1.2, buildingMat, blocks);
  addBuilding(group, physics, -half, 0, 1.2, wallH, half * 2, buildingMat, blocks);
  addBuilding(group, physics, half, 0, 1.2, wallH, half * 2, buildingMat, blocks);

  for (const [x, z, w, h, d] of opts.buildings) {
    addBuilding(group, physics, x, z, w, h, d, buildingMat, blocks);
  }

  for (const deck of opts.decks ?? []) addDeck(group, physics, blocks, buildingMat, deck);
  for (const stair of opts.stairs ?? []) addRamp(group, physics, blocks, buildingMat, stair);

  const poles: Array<[number, number, THREE.Material]> = [
    [-8, -4, neonA],
    [8, -6, neonB],
    [-2, 6, neonA],
    [6, 12, neonB],
  ];
  for (const [x, z, m] of poles) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5, 0.35), m);
    pole.position.set(x, 2.5, z);
    group.add(pole);
    physics.addStaticBox(0.2, 2.5, 0.2, x, 2.5, z);
    blocks.push({ x, y: 2.5, z, hw: 0.2, hh: 2.5, hd: 0.2 });
  }

  for (const op of opts.outposts) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(op.radius - 0.15, op.radius, 48),
      new THREE.MeshBasicMaterial({
        color: op.id === 'A' ? opts.neonA : op.id === 'B' ? '#c77dff' : opts.neonB,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(op.center.x, 0.05, op.center.z);
    group.add(ring);
  }

  return {
    group,
    outposts: opts.outposts,
    spawnPoint: opts.spawn,
    halfExtent: half,
    name: opts.name,
    mapIndex: opts.mapIndex,
    blocks,
  };
}
