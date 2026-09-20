import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { buildNeonArena, type LevelBuildResult, type Outpost } from './LevelFactory';

export function createMap1(physics: PhysicsWorld): LevelBuildResult {
  const outposts: Outpost[] = [
    { id: 'A', label: 'Gate', center: new THREE.Vector3(0, 0, -8), radius: 5, cleared: false },
    { id: 'B', label: 'Warehouse', center: new THREE.Vector3(10, 0, 2), radius: 5.5, cleared: false },
    { id: 'C', label: 'Crane deck', center: new THREE.Vector3(-6, 0, 14), radius: 6, cleared: false },
  ];
  return buildNeonArena(physics, {
    name: 'Neon Docks',
    mapIndex: 1,
    floorColor: '#4a8ec7',
    buildingColor: '#8ba7c0',
    neonA: '#1ec8ff',
    neonB: '#ff2d6a',
    outposts,
    spawn: new THREE.Vector3(0, 1.0, 18),
    buildings: [
      [-4, -10, 4, 3.2, 4],
      [4, -12, 3, 2.4, 5],
      [12, 0, 6, 4, 5],
      [14, 6, 3, 2.2, 3],
      [-10, 8, 5, 3.5, 4],
      [-12, 14, 4, 2.8, 6],
      [2, 10, 3, 2, 3],
    ],
  });
}

export function createMap2(physics: PhysicsWorld): LevelBuildResult {
  const outposts: Outpost[] = [
    { id: 'A', label: 'Alley', center: new THREE.Vector3(-10, 0, -6), radius: 5, cleared: false },
    { id: 'B', label: 'Skybridge', center: new THREE.Vector3(2, 0, 4), radius: 5.5, cleared: false },
    { id: 'C', label: 'Ad tower', center: new THREE.Vector3(12, 0, -8), radius: 6, cleared: false },
  ];
  return buildNeonArena(physics, {
    name: 'Cyber Streets',
    mapIndex: 2,
    floorColor: '#7a68ab',
    buildingColor: '#9d92c4',
    neonA: '#c77dff',
    neonB: '#54f0a8',
    outposts,
    spawn: new THREE.Vector3(-16, 1.0, 16),
    buildings: [
      [-12, 0, 3, 5, 8],
      [-4, -10, 5, 4, 3],
      [0, 8, 8, 3.5, 3],
      [8, 2, 3, 6, 3],
      [14, -4, 4, 5, 4],
      [6, -14, 6, 2.5, 3],
      [-8, 12, 4, 3, 4],
    ],
  });
}

export function createMap3(physics: PhysicsWorld): LevelBuildResult {
  const outposts: Outpost[] = [
    { id: 'A', label: 'Perimeter', center: new THREE.Vector3(0, 0, -12), radius: 5.5, cleared: false },
    { id: 'B', label: 'Coolant', center: new THREE.Vector3(-12, 0, 4), radius: 5.5, cleared: false },
    { id: 'C', label: 'Core hall', center: new THREE.Vector3(8, 0, 10), radius: 6.5, cleared: false },
  ];
  return buildNeonArena(physics, {
    name: 'Core Reactor',
    mapIndex: 3,
    floorColor: '#b05a74',
    buildingColor: '#c495a4',
    neonA: '#ff2d6a',
    neonB: '#ffb703',
    outposts,
    spawn: new THREE.Vector3(0, 1.0, 20),
    buildings: [
      [-6, -6, 4, 4, 4],
      [6, -8, 4, 4, 4],
      [0, 0, 5, 2, 5],
      [-14, 8, 3, 5, 6],
      [12, 6, 5, 4, 3],
      [4, 14, 6, 3, 4],
      [-8, 14, 3, 3.5, 3],
    ],
  });
}
