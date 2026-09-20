import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createBrickFigure, type BrickPalette } from './BrickCharacter';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

const CAPSULE_HALF = 0.45;
const CAPSULE_RADIUS = 0.28;

export class BrickAgent {
  readonly group: THREE.Group;
  readonly body: RAPIER.RigidBody;
  hp: number;
  readonly maxHp: number;
  readonly team: 'player' | 'enemy';
  alive = true;
  hasShield = false;
  shieldHp = 0;
  isBoss = false;
  isShieldTrooper = false;
  /**
   * Dead enemies are *frozen*, not removed: the rigid body is switched to Fixed and its
   * collider disabled. Freeing the body instead would leave a dangling WASM handle, and any
   * later `body.translation()` would hard-crash Rapier rather than throw.
   */
  private readonly collider: RAPIER.Collider;
  private corpseFrozen = false;

  constructor(
    private readonly physics: PhysicsWorld,
    palette: BrickPalette,
    position: THREE.Vector3,
    team: 'player' | 'enemy',
    maxHp = 100,
    opts?: { boss?: boolean; shieldTrooper?: boolean; scale?: number },
  ) {
    this.team = team;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.isBoss = !!opts?.boss;
    this.isShieldTrooper = !!opts?.shieldTrooper;
    if (this.isShieldTrooper) {
      this.hasShield = true;
      this.shieldHp = 40;
    }
    this.group = createBrickFigure(palette, {
      boss: this.isBoss,
      shield: this.isShieldTrooper,
    });
    const scale = opts?.scale ?? (this.isBoss ? 1.85 : 1);
    this.group.scale.setScalar(scale);
    this.group.position.copy(position);

    const half = this.isBoss ? CAPSULE_HALF * 1.5 : CAPSULE_HALF;
    const radius = this.isBoss ? CAPSULE_RADIUS * 1.4 : CAPSULE_RADIUS;

    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .lockRotations()
      .setCanSleep(false)
      .setLinearDamping(6)
      .setCcdEnabled(true);
    this.body = this.physics.world.createRigidBody(desc);
    this.collider = this.physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(half, radius)
        .setFriction(0.9)
        .setRestitution(0)
        .setDensity(this.isBoss ? 4 : 2),
      this.body,
    );
  }

  syncMesh(): void {
    const t = this.body.translation();
    // Capsule bottom = center - (half + radius); keep mesh feet on that plane.
    const foot = this.capsuleFoot;
    this.group.position.set(t.x, t.y - foot, t.z);
  }

  get capsuleFoot(): number {
    const half = this.isBoss ? CAPSULE_HALF * 1.5 : CAPSULE_HALF;
    const radius = this.isBoss ? CAPSULE_RADIUS * 1.4 : CAPSULE_RADIUS;
    return half + radius;
  }

  get standHeight(): number {
    return this.capsuleFoot;
  }

  setYaw(radians: number): void {
    this.group.rotation.y = radians;
  }

  setWeaponColor(color: string): void {
    const mat = this.group.userData.gunMat as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial | undefined;
    if (!mat || !('color' in mat)) return;
    mat.color.set(color);
    if ('emissive' in mat && mat.emissive) mat.emissive.set(color);
  }

  /**
   * Drive horizontal movement while leaving vertical velocity untouched, so gravity can
   * actually accumulate — agents can now stand on elevated surfaces and fall off ledges.
   */
  applyMoveVelocity(vx: number, vz: number, maxSpeed: number): void {
    if (!this.alive) return;
    const vy = this.body.linvel().y;
    const speed = Math.hypot(vx, vz);
    if (speed > 1e-4) {
      const s = Math.min(1, maxSpeed / speed);
      this.body.setLinvel({ x: vx * s, y: vy, z: vz * s }, true);
    } else {
      this.body.setLinvel({ x: 0, y: vy, z: 0 }, true);
    }
  }

  absorbShield(amount: number): void {
    this.shieldHp = Math.max(0, this.shieldHp - amount);
    if (this.shieldHp <= 0) this.hasShield = false;
  }

  addShield(amount: number): void {
    this.hasShield = true;
    this.shieldHp = Math.min(80, this.shieldHp + amount);
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.alive = false;
      if (this.team === 'enemy') {
        // A corpse must stop blocking bullets, movement and the camera pull-in ray
        // immediately, even though it stays visible on the ground.
        this.freezeCorpse();
        this.topple();
      } else {
        this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      return true;
    }
    return false;
  }

  /** Stop a dead agent from moving or colliding, keeping its handles valid. Idempotent. */
  private freezeCorpse(): void {
    if (this.corpseFrozen) return;
    this.corpseFrozen = true;
    this.collider.setEnabled(false);
    this.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** Lay the figure flat so a corpse reads as dead rather than a frozen standing statue. */
  private topple(): void {
    this.group.rotation.x = -Math.PI / 2;
  }

  heal(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  respawn(x: number, y: number, z: number): void {
    this.alive = true;
    this.hp = this.maxHp;
    this.group.visible = true;
    this.body.setTranslation({ x, y, z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.syncMesh();
  }

  dispose(physics: PhysicsWorld): void {
    physics.world.removeRigidBody(this.body);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
  }
}

export { CAPSULE_HALF, CAPSULE_RADIUS };
