import * as THREE from 'three';

type Debris = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  /** When set the brick homes in on this point (the "snap back together" half). */
  attract: THREE.Vector3 | null;
  restY: number;
};

const GRAVITY = -24;
const GROUND = 0;

/**
 * The signature brick-game beat: a figure is not one solid lump, it is a pile of bricks.
 *
 * On death every mesh in a figure is replaced by a tumbling brick of the same size, colour
 * and world position, so the character visibly comes apart instead of just falling over.
 * The inverse is used on respawn: bricks fly in from around the spawn point and converge,
 * which is what makes "reassembling" read as a rebuild rather than a teleport.
 *
 * Debris carries its own pooled geometry and material rather than borrowing the figure's:
 * the figure's resources are disposed when its wave is cleared, and referencing them would
 * leave the debris rendering freed buffers.
 */
export class BrickDebris {
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private readonly pool: Debris[] = [];
  private readonly live: Debris[] = [];
  private readonly size = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();
  private readonly worldPos = new THREE.Vector3();
  private readonly worldScale = new THREE.Vector3();

  // A grunt is 22 bricks and a boss is larger, so a six-enemy wipe plus a boss climax can
  // legitimately want ~250 live bricks at once.
  constructor(private readonly scene: THREE.Scene, private readonly cap = 260) {
    for (let i = 0; i < this.cap; i++) {
      const mesh = new THREE.Mesh(
        this.box,
        new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.16 }),
      );
      mesh.castShadow = true;
      mesh.visible = false;
      this.scene.add(mesh);
      this.pool.push({
        mesh,
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        attract: null,
        restY: GROUND,
      });
    }
  }

  get activeCount(): number {
    return this.live.length;
  }

  /** Sample a figure's meshes into brick descriptors, largest first. */
  private collect(figure: THREE.Object3D) {
    type Piece = { pos: THREE.Vector3; scale: THREE.Vector3; color: THREE.Color; volume: number };
    // Deliberately does not force `figure.visible`: the respawn reassembly runs while the
    // player's figure is still hidden, and traverse/updateMatrixWorld ignore visibility.
    const pieces: Piece[] = [];
    figure.updateMatrixWorld(true);

    figure.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (!mat || !('color' in mat)) return;
      if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
      const bbox = obj.geometry.boundingBox;
      if (!bbox) return;

      this.size.subVectors(bbox.max, bbox.min);
      this.centre.addVectors(bbox.max, bbox.min).multiplyScalar(0.5);
      this.worldPos.copy(this.centre);
      obj.localToWorld(this.worldPos);

      const scale = obj.getWorldScale(this.worldScale).clone();
      const s = new THREE.Vector3(
        Math.max(0.05, this.size.x * scale.x),
        Math.max(0.05, this.size.y * scale.y),
        Math.max(0.05, this.size.z * scale.z),
      );
      pieces.push({
        pos: this.worldPos.clone(),
        scale: s,
        color: (mat as THREE.MeshStandardMaterial).color.clone(),
        volume: s.x * s.y * s.z,
      });
    });

    pieces.sort((a, b) => b.volume - a.volume);
    return pieces;
  }

  /**
   * Blow a figure apart. `inward` runs the effect backwards: bricks start scattered around
   * the point and converge on it, which is the respawn animation.
   */
  burst(figure: THREE.Object3D, opts?: { force?: number; inward?: boolean; spread?: number }): void {
    const pieces = this.collect(figure);
    const force = opts?.force ?? 5.5;
    const spread = opts?.spread ?? 1;
    const centreOfMass = new THREE.Vector3();
    for (const p of pieces) centreOfMass.add(p.pos);
    if (pieces.length) centreOfMass.multiplyScalar(1 / pieces.length);

    for (let i = 0; i < pieces.length; i++) {
      const d = this.pool.pop();
      if (!d) break;
      const p = pieces[i]!;
      d.mesh.position.copy(p.pos);
      d.mesh.scale.copy(p.scale);
      d.mesh.quaternion.setFromEuler(
        new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28),
      );
      (d.mesh.material as THREE.MeshStandardMaterial).color.copy(p.color);
      (d.mesh.material as THREE.MeshStandardMaterial).opacity = 1;
      (d.mesh.material as THREE.MeshStandardMaterial).transparent = false;
      d.mesh.visible = true;

      if (opts?.inward) {
        // Scatter out to a shell, then home in.
        const dir = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() * 0.8 + 0.2,
          Math.random() - 0.5,
        ).normalize();
        d.mesh.position.copy(centreOfMass).addScaledVector(dir, (2.6 + Math.random() * 2.2) * spread);
        d.vel.set(0, 0, 0);
        d.attract = centreOfMass.clone();
        d.maxLife = 0.55 + Math.random() * 0.18;
      } else {
        const away = new THREE.Vector3().subVectors(p.pos, centreOfMass);
        if (away.lengthSq() < 1e-4) away.set(Math.random() - 0.5, 1, Math.random() - 0.5);
        away.normalize();
        d.vel.copy(away).multiplyScalar(force * (0.6 + Math.random() * 0.8));
        d.vel.y += 2.5 + Math.random() * 3.5;
        d.attract = null;
        d.maxLife = 2.2 + Math.random() * 1.1;
      }
      d.spin.set(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
      );
      d.life = d.maxLife;
      d.restY = d.mesh.scale.y * 0.5;
      this.live.push(d);
    }
  }

  update(delta: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const d = this.live[i]!;
      d.life -= delta;

      if (d.attract) {
        // Converge: accelerate toward the assembly point, then vanish on arrival.
        const to = new THREE.Vector3().subVectors(d.attract, d.mesh.position);
        const dist = to.length();
        to.multiplyScalar(1 / Math.max(0.001, dist));
        d.vel.addScaledVector(to, 46 * delta);
        d.vel.multiplyScalar(1 - Math.min(1, 3.2 * delta));
        d.mesh.position.addScaledVector(d.vel, delta);
        d.mesh.rotateX(d.spin.x * delta * 0.4);
        d.mesh.rotateY(d.spin.y * delta * 0.4);
        if (dist < 0.35 || d.life <= 0) {
          d.mesh.visible = false;
          d.attract = null;
          this.live.splice(i, 1);
          this.pool.push(d);
        }
        continue;
      }

      d.vel.y += GRAVITY * delta;
      d.mesh.position.addScaledVector(d.vel, delta);
      d.mesh.rotateX(d.spin.x * delta);
      d.mesh.rotateY(d.spin.y * delta);
      d.mesh.rotateZ(d.spin.z * delta);

      if (d.mesh.position.y < d.restY) {
        d.mesh.position.y = d.restY;
        d.vel.y = -d.vel.y * 0.34;
        d.vel.x *= 0.72;
        d.vel.z *= 0.72;
        d.spin.multiplyScalar(0.6);
        if (Math.abs(d.vel.y) < 0.4) d.vel.y = 0;
      }

      // Fade out only once the brick has actually settled.
      const settleT = 1 - Math.max(0, d.life) / d.maxLife;
      if (settleT > 0.72) {
        const mat = d.mesh.material as THREE.MeshStandardMaterial;
        mat.transparent = true;
        mat.opacity = Math.max(0, 1 - (settleT - 0.72) / 0.28);
      }

      if (d.life <= 0) {
        d.mesh.visible = false;
        this.live.splice(i, 1);
        this.pool.push(d);
      }
    }
  }

  dispose(): void {
    for (const d of [...this.pool, ...this.live]) {
      this.scene.remove(d.mesh);
      (d.mesh.material as THREE.Material).dispose();
    }
    this.box.dispose();
    this.pool.length = 0;
    this.live.length = 0;
  }
}
