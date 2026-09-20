import * as THREE from 'three';
import type { PickupDef, PickupId } from '../data/pickups';
import { PICKUPS } from '../data/pickups';

export class WorldPickup {
  readonly group = new THREE.Group();
  readonly def: PickupDef;
  active = true;
  private readonly mesh: THREE.Mesh;
  private spin = 0;

  constructor(id: PickupId, position: THREE.Vector3) {
    const def = PICKUPS.find((p) => p.id === id);
    if (!def) throw new Error(`Unknown pickup ${id}`);
    this.def = def;
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.45, 0.45),
      new THREE.MeshStandardMaterial({
        color: def.color,
        emissive: def.color,
        emissiveIntensity: 0.55,
        roughness: 0.35,
        metalness: 0.2,
      }),
    );
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.5, 24),
      new THREE.MeshBasicMaterial({ color: def.color, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    this.group.add(ring);
    this.group.position.copy(position);
  }

  update(delta: number, elapsed: number): void {
    if (!this.active) return;
    this.spin += delta * 2;
    this.mesh.rotation.y = this.spin;
    this.mesh.position.y = 0.55 + Math.sin(elapsed * 3) * 0.12;
  }

  collect(): void {
    this.active = false;
    this.group.visible = false;
  }
}
