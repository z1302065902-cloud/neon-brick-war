import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Over-shoulder orbit camera.
 * Look target stays on the player (never underground / inside walls).
 * Collision pulls the camera in along the player→camera ray only.
 */
export class TpsCamera {
  private _yaw = 0;
  pitch = 0.18;
  private readonly desiredDist = 4.4;
  private readonly shoulder = 0.95;
  private readonly pivotHeight = 1.35;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.camera.near = 0.12;
    this.camera.far = 140;
    this.camera.fov = 55;
  }

  get yawRadians(): number {
    return this._yaw;
  }

  addLookDelta(dx: number, dy: number, sensitivity = 0.0026): void {
    this._yaw -= dx * sensitivity;
    // Keep pitch in a safe band so the camera never flips under the floor.
    this.pitch = Math.max(-0.55, Math.min(0.72, this.pitch + dy * sensitivity));
  }

  forwardFlat(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this._yaw), 0, -Math.cos(this._yaw)).normalize();
  }

  rightFlat(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.cos(this._yaw), 0, -Math.sin(this._yaw)).normalize();
  }

  update(playerPos: THREE.Vector3, world: RAPIER.World, exclude?: RAPIER.Collider): void {
    const pivot = playerPos.clone().add(new THREE.Vector3(0, this.pivotHeight, 0));
    const back = new THREE.Vector3(Math.sin(this._yaw), 0, Math.cos(this._yaw));
    const right = new THREE.Vector3(Math.cos(this._yaw), 0, -Math.sin(this._yaw));

    // Spherical orbit offset from the pivot (shoulder TPS).
    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    const ideal = pivot
      .clone()
      .addScaledVector(right, this.shoulder)
      .addScaledVector(back, this.desiredDist * cosP)
      .add(new THREE.Vector3(0, this.desiredDist * sinP * 0.95 + 0.35, 0));

    // Always ray from pivot → camera so hits pull the camera closer, never underground.
    const toCam = ideal.clone().sub(pivot);
    let dist = toCam.length();
    if (dist < 0.2) dist = 0.2;
    toCam.multiplyScalar(1 / dist);

    const ray = new RAPIER.Ray(
      { x: pivot.x, y: pivot.y, z: pivot.z },
      { x: toCam.x, y: toCam.y, z: toCam.z },
    );
    const hit = world.castRay(ray, dist, true, undefined, undefined, exclude);
    if (hit && hit.timeOfImpact < dist) {
      dist = Math.max(0.55, hit.timeOfImpact - 0.2);
    }

    const cam = pivot.clone().addScaledVector(toCam, dist);
    // Hard floor for the camera lens — never render from under the ground plane.
    cam.y = Math.max(0.55, cam.y);

    this.camera.position.copy(cam);
    this.camera.lookAt(pivot);
  }
}
