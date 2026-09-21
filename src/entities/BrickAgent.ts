import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createBrickFigure, type BrickPalette, type BrickRig } from './BrickCharacter';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

const CAPSULE_HALF = 0.45;
const CAPSULE_RADIUS = 0.28;

export type AgentOpts = {
  boss?: boolean;
  shieldTrooper?: boolean;
  scale?: number;
  /** Replaces the default brick figure — bosses bring their own silhouette. */
  figure?: THREE.Group;
  /** Collider sizing. Bosses are chunkier than grunts. */
  half?: number;
  radius?: number;
  density?: number;
};

/**
 * A damageable weak spot. `CombatSystem` reads this off any agent it hits, so a boss can
 * expose and retract it freely without the combat layer knowing what a boss is.
 */
export type WeakPoint = {
  /** World-space centre, refreshed by the owner every frame. */
  position: THREE.Vector3;
  radius: number;
  multiplier: number;
};

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
  /** Non-null only while the owner is exposing it (see BossAgent). */
  weakPoint: WeakPoint | null = null;
  /** Fired once on death, after `onDeath()`. The game uses it to blow the figure apart. */
  onDied: ((agent: BrickAgent) => void) | null = null;
  /**
   * Dead enemies are *frozen*, not removed: the rigid body is switched to Fixed and its
   * collider disabled. Freeing the body instead would leave a dangling WASM handle, and any
   * later `body.translation()` would hard-crash Rapier rather than throw.
   */
  protected readonly collider: RAPIER.Collider;
  protected readonly capsuleHalf: number;
  protected readonly capsuleRadius: number;
  private corpseFrozen = false;
  /** Walk-cycle phase; advances continuously so the gait never pops. */
  private animPhase = 0;

  constructor(
    protected readonly physics: PhysicsWorld,
    palette: BrickPalette,
    position: THREE.Vector3,
    team: 'player' | 'enemy',
    maxHp = 100,
    opts?: AgentOpts,
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
    this.group =
      opts?.figure ??
      createBrickFigure(palette, {
        boss: this.isBoss,
        shield: this.isShieldTrooper,
      });
    const scale = opts?.scale ?? (this.isBoss ? 1.85 : 1);
    this.group.scale.setScalar(scale);
    this.group.position.copy(position);

    this.capsuleHalf = opts?.half ?? (this.isBoss ? CAPSULE_HALF * 1.5 : CAPSULE_HALF);
    this.capsuleRadius = opts?.radius ?? (this.isBoss ? CAPSULE_RADIUS * 1.4 : CAPSULE_RADIUS);

    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .lockRotations()
      .setCanSleep(false)
      .setLinearDamping(6)
      .setCcdEnabled(true);
    this.body = this.physics.world.createRigidBody(desc);
    this.collider = this.physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(this.capsuleHalf, this.capsuleRadius)
        .setFriction(0.9)
        .setRestitution(0)
        .setDensity(opts?.density ?? (this.isBoss ? 4 : 2)),
      this.body,
    );
  }

  syncMesh(): void {
    const t = this.body.translation();
    // Capsule bottom = center - (half + radius); keep mesh feet on that plane.
    this.group.position.set(t.x, t.y - this.capsuleFoot, t.z);
  }

  /**
   * Walk cycle, driven purely by the rigid body's horizontal speed.
   *
   * Stride frequency comes from how fast the agent is *actually* moving, so the feet never
   * skate when it is slowed by a wall or a shove. Standing still settles into a slow breath
   * rather than freezing mid-stride.
   */
  animate(delta: number): void {
    const rig = this.group.userData.rig as BrickRig | undefined;
    if (!rig) return;

    const v = this.body.linvel();
    const speed = Math.hypot(v.x, v.z);
    const moving = this.alive && speed > 0.4;
    const swing = moving ? Math.min(1, 0.3 + speed / 6) : 0;

    this.animPhase += delta * (moving ? 5.2 + speed * 0.7 : 2.1);
    const s = Math.sin(this.animPhase);
    const c = Math.cos(this.animPhase);

    rig.legL.rotation.x = s * 0.9 * swing;
    rig.legR.rotation.x = -s * 0.9 * swing;
    // The gun arm is braced on the weapon, so it swings far less than the free arm.
    rig.armL.rotation.x = -s * 0.75 * swing;
    rig.armR.rotation.x = s * 0.22 * swing;
    rig.armL.rotation.z = swing * 0.12;

    // Two bobs per stride, plus a slow breath when idle.
    const idle = moving ? 0 : Math.sin(this.animPhase * 1.4) * 0.012;
    rig.body.position.y = Math.abs(c) * 0.05 * swing + idle;
    // A slight forward lean into the run.
    rig.body.rotation.x = swing * 0.1;
    rig.head.rotation.x = -swing * 0.05;
  }

  get capsuleFoot(): number {
    return this.capsuleHalf + this.capsuleRadius;
  }

  get standHeight(): number {
    return this.capsuleFoot;
  }

  /** Collider radius. Combat sizes its hit tolerance from this so big targets stay hittable. */
  get radius(): number {
    return this.capsuleRadius;
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

  /**
   * Per-hit damage scaling from a given direction. Bosses override this for directional
   * armour; everything else takes full damage from every angle.
   */
  damageScaleFrom(_from: THREE.Vector3): number {
    return 1;
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
        // Sampled before onDeath() so the bricks come off a standing figure — toppling
        // first would scatter them in a lying-down pose.
        this.onDied?.(this);
        this.onDeath();
      } else {
        this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      return true;
    }
    return false;
  }

  /** Overridden by bosses, which explode instead of toppling. */
  protected onDeath(): void {
    this.topple();
  }

  /** Stop a dead agent from moving or colliding, keeping its handles valid. Idempotent. */
  protected freezeCorpse(): void {
    if (this.corpseFrozen) return;
    this.corpseFrozen = true;
    this.collider.setEnabled(false);
    this.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** Lay the figure flat so a corpse reads as dead rather than a frozen standing statue. */
  protected topple(): void {
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
