import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Wireframe overlay of every Rapier collider — the design spec's
 * "dev toggle: wireframe colliders" acceptance item.
 * Toggle with F3, or start enabled by loading the page with `?debug`.
 */
export class ColliderDebug {
  private readonly lines: THREE.LineSegments;

  constructor(scene: THREE.Scene, startVisible: boolean) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    this.lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0x54f0a8,
        depthTest: false,
        transparent: true,
        opacity: 0.85,
      }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    this.lines.visible = startVisible;
    scene.add(this.lines);
  }

  get enabled(): boolean {
    return this.lines.visible;
  }

  toggle(): boolean {
    this.lines.visible = !this.lines.visible;
    return this.lines.visible;
  }

  update(world: RAPIER.World): void {
    if (!this.lines.visible) return;
    const { vertices } = world.debugRender();
    const attr = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (attr.array.length !== vertices.length) {
      this.lines.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    } else {
      (attr.array as Float32Array).set(vertices);
      attr.needsUpdate = true;
    }
    this.lines.geometry.computeBoundingSphere();
  }
}
