import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

export type Outpost = {
  id: 'A' | 'B' | 'C';
  label: string;
  center: THREE.Vector3;
  radius: number;
  cleared: boolean;
};

/** Axis-aligned solid, mirrored from a static collider so push-out can be solved exactly. */
export type SolidBox = {
  x: number;
  y: number;
  z: number;
  hw: number;
  hh: number;
  hd: number;
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
