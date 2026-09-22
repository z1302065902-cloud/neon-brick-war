import * as THREE from 'three';
import { BrickAgent } from './BrickAgent';
import { ARCHETYPE_KIND, createBossFigure, type BossArchetype, type BossFigure } from './BossFigure';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { ExplosionVfx } from '../systems/ExplosionVfx';
import type { AudioSystem } from '../systems/AudioSystem';

export type { BossArchetype };

export type BossContext = {
  player: BrickAgent;
  vfx: ExplosionVfx;
  audio: AudioSystem;
  /** Applied to the player — the boss never touches hp directly. */
  damagePlayer: (amount: number) => void;
  spawnAdd: (position: THREE.Vector3, shielded: boolean) => void;
  onPhaseChange: (phase: 2) => void;
};

type BossState = 'idle' | 'windup' | 'strike' | 'recover';

type Spec = {
  name: string;
  hp: number;
  speed: number;
  half: number;
  radius: number;
  /** Seconds between attacks, per phase. */
  interval: [number, number];
  weakRadius: number;
  weakMultiplier: number;
  hover: number;
};

const SPECS: Record<BossArchetype, Spec> = {
  loader: {
    name: 'Armored Loader',
    hp: 320,
    speed: 2.3,
    half: 0.5,
    radius: 0.45,
    interval: [3.6, 2.6],
    weakRadius: 0.62,
    weakMultiplier: 2.6,
    hover: 0,
  },
  carrier: {
    name: 'Drone Carrier',
    hp: 380,
    speed: 3.1,
    half: 0.6,
    radius: 0.5,
    interval: [2.4, 1.6],
    weakRadius: 0.6,
    weakMultiplier: 2.2,
    hover: 1.2,
  },
  guardian: {
    name: 'Core Guardian',
    hp: 460,
    speed: 1.5,
    half: 1.0,
    radius: 0.55,
    interval: [5.4, 3.0],
    weakRadius: 0.72,
    weakMultiplier: 3.0,
    hover: 0,
  },
  // ---- levels 2, 5, 9: ground chargers, each heavier than the last ----
  hauler: {
    name: 'Cargo Hauler',
    hp: 400, speed: 2.6, half: 0.55, radius: 0.5,
    interval: [3.2, 2.2], weakRadius: 0.66, weakMultiplier: 2.4, hover: 0,
  },
  welder: {
    name: 'Rig Welder',
    hp: 520, speed: 2.1, half: 0.55, radius: 0.52,
    interval: [3.0, 2.0], weakRadius: 0.7, weakMultiplier: 2.8, hover: 0,
  },
  behemoth: {
    name: 'Slag Behemoth',
    hp: 760, speed: 1.7, half: 0.62, radius: 0.62,
    interval: [3.6, 2.4], weakRadius: 0.8, weakMultiplier: 2.6, hover: 0,
  },
  colossus: {
    name: 'Wall Colossus',
    hp: 980, speed: 1.5, half: 0.68, radius: 0.7,
    interval: [3.4, 2.2], weakRadius: 0.88, weakMultiplier: 3.0, hover: 0,
  },
  // ---- levels 3, 7: air kiters ----
  warden: {
    name: 'Signal Warden',
    hp: 440, speed: 3.4, half: 0.62, radius: 0.52,
    interval: [2.2, 1.5], weakRadius: 0.62, weakMultiplier: 2.3, hover: 1.4,
  },
  wyrm: {
    name: 'Coolant Wyrm',
    hp: 620, speed: 3.6, half: 0.62, radius: 0.54,
    interval: [2.0, 1.3], weakRadius: 0.66, weakMultiplier: 2.4, hover: 1.8,
  },
  // ---- level 6: a second guard-type ----
  sentinel: {
    name: 'Archive Sentinel',
    hp: 580, speed: 1.6, half: 1.05, radius: 0.58,
    interval: [5.0, 2.8], weakRadius: 0.76, weakMultiplier: 3.1, hover: 0,
  },
};

/** Level index -> boss. Every level gets its own. */
export const LEVEL_BOSS: BossArchetype[] = [
  'loader', 'hauler', 'carrier', 'warden', 'welder',
  'sentinel', 'wyrm', 'behemoth', 'colossus', 'guardian',
];

/** Phase-2 armour heats up to this colour. */
const RAGE = new THREE.Color('#ff5a00');
const BASE_ARMOUR = new THREE.Color('#3d2752');

/**
 * Boss cadence from the design spec §9:
 *   expose weak point → rage phase with a new attack → neon explosion climax → drop a key.
 *
 * Each map gets a genuinely different fight rather than the same figure rescaled:
 *  - loader   : tracked bruiser, directional armour, charge + ground pound
 *  - carrier  : hovering kiter, the game's only ranged attacker, summons drones in rage
 *  - guardian : guarded core that only opens after each pulse; rage doubles the cadence
 */
export class BossAgent extends BrickAgent {
  readonly archetype: BossArchetype;
  /** Behaviour rig: the archetype's silhouette does not change how it fights. */
  readonly kind: 'loader' | 'carrier' | 'guardian';
  readonly displayName: string;
  phase: 1 | 2 = 1;
  state: BossState = 'idle';

  private readonly spec: Spec;
  private readonly figure: BossFigure;
  private readonly coreLocal: THREE.Vector3;
  private readonly forward = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly weakPos = new THREE.Vector3();

  private cooldown = 2.2;
  private stateTimer = 0;
  private chargeDir = new THREE.Vector3();
  private coreOpenTimer = 0;
  private burstLeft = 0;
  private pulsePhase = 0;

  constructor(physics: PhysicsWorld, archetype: BossArchetype, position: THREE.Vector3) {
    const spec = SPECS[archetype];
    // Silhouette is the archetype; behaviour comes from which of the three rigs it maps to.
    const figure = createBossFigure(archetype);
    const kind = ARCHETYPE_KIND[archetype];
    super(physics, {
      skin: '#c4a882', torso: '#ffb703', legs: '#1b1b2f', accent: '#fb8500',
    }, position, 'enemy', spec.hp, {
      boss: true,
      figure: figure.root,
      scale: 1,
      half: spec.half,
      radius: spec.radius,
      density: 5,
    });
    this.archetype = archetype;
    this.kind = kind;
    this.displayName = spec.name;
    this.spec = spec;
    this.figure = figure;
    this.coreLocal = figure.core.position.clone();
    // The loader starts fully armoured; the guardian starts closed.
    this.coreOpenTimer = kind === 'guardian' ? 0 : Infinity;
    this.syncWeakPoint();
  }

  // ------------------------------------------------------------------ combat hooks

  /**
   * Directional armour. The loader's front plate soaks most of a frontal hit, which is what
   * forces the player to circle behind it instead of standing still and trading.
   */
  damageScaleFrom(from: THREE.Vector3): number {
    if (this.kind !== 'loader') return 1;
    const t = this.body.translation();
    this.tmp.set(from.x - t.x, 0, from.z - t.z);
    if (this.tmp.lengthSq() < 1e-6) return 1;
    this.tmp.normalize();
    const facing = this.tmp.dot(this.forward);
    // 0.3 while the plate holds, 0.6 once it cracks in rage.
    if (facing > 0.45) return this.phase === 1 ? 0.3 : 0.6;
    return 1;
  }

  protected override onDeath(): void {
    // A boss detonates rather than toppling — the game drives the staged climax.
    this.weakPoint = null;
    this.group.visible = false;
  }

  // ------------------------------------------------------------------ per-frame

  update(delta: number, ctx: BossContext): void {
    if (!this.alive) return;

    const t = this.body.translation();
    const p = ctx.player.body.translation();
    const dx = p.x - t.x;
    const dz = p.z - t.z;
    const dist = Math.hypot(dx, dz) || 1;

    this.forward.set(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
    this.setYaw(Math.atan2(dx, dz));

    if (this.hp <= this.spec.hp * 0.5 && this.phase === 1) this.enterRage(ctx);

    for (const part of this.figure.spin) {
      part.rotation.y += delta * (this.phase === 2 ? 7 : 3.2);
    }
    this.pulsePhase += delta * (this.phase === 2 ? 6 : 3);
    this.figure.coreMat.emissiveIntensity = 1.2 + Math.sin(this.pulsePhase) * 0.35;

    if (this.spec.hover > 0) this.hover(t.x, t.z);
    this.updateCore(delta);
    this.syncWeakPoint();

    switch (this.kind) {
      case 'loader':
        this.runLoader(delta, dist, dx, dz, ctx);
        break;
      case 'carrier':
        this.runCarrier(delta, dist, dx, dz, ctx);
        break;
      case 'guardian':
        this.runGuardian(delta, dist, dx, dz, ctx);
        break;
    }
  }

  /** Freeze in place while the pointer is unlocked, without dropping a hovering boss. */
  parkPosition(): void {
    if (!this.alive) return;
    if (this.spec.hover > 0) {
      const t = this.body.translation();
      this.hover(t.x, t.z);
    }
    this.applyMoveVelocity(0, 0, 1);
  }

  private enterRage(ctx: BossContext): void {
    this.phase = 2;
    for (const mat of this.figure.armour) {
      mat.emissive.copy(RAGE);
      mat.emissiveIntensity = 0.5;
      if (mat.color.equals(BASE_ARMOUR)) mat.color.set('#7a3a2a');
    }
    const t = this.body.translation();
    ctx.vfx.spawn(new THREE.Vector3(t.x, t.y + 0.4, t.z), '#ff5a00', 3.4, 0.7);
    ctx.audio.explosion(1.2);
    ctx.onPhaseChange(2);
  }

  /** The carrier keeps itself off the floor; nothing else about it is special-cased. */
  private hover(x: number, z: number): void {
    const y = this.capsuleFoot + this.spec.hover;
    this.body.setTranslation({ x, y, z }, true);
    const v = this.body.linvel();
    if (Math.abs(v.y) > 1e-4) this.body.setLinvel({ x: v.x, y: 0, z: v.z }, true);
  }

  /** The guardian only opens its core for a window after each pulse. */
  private updateCore(delta: number): void {
    if (this.kind !== 'guardian') return;
    if (this.coreOpenTimer > 0) this.coreOpenTimer = Math.max(0, this.coreOpenTimer - delta);
    const open = this.coreOpenTimer > 0;
    this.figure.core.visible = true;
    this.figure.coreMat.emissiveIntensity = open ? 2.0 : 0.35;
    this.figure.coreMat.emissive.set(open ? '#54f0a8' : '#5a2038');
    this.figure.coreMat.color.set(open ? '#54f0a8' : '#3a1424');
  }

  private syncWeakPoint(): void {
    const open =
      this.archetype === 'guardian' ? this.coreOpenTimer > 0 : true;
    if (!open) {
      this.weakPoint = null;
      return;
    }
    const t = this.body.translation();
    const cos = Math.cos(this.group.rotation.y);
    const sin = Math.sin(this.group.rotation.y);
    this.weakPos.set(
      t.x + this.coreLocal.x * cos + this.coreLocal.z * sin,
      t.y - this.capsuleFoot + this.coreLocal.y,
      t.z - this.coreLocal.x * sin + this.coreLocal.z * cos,
    );
    if (this.weakPoint) {
      this.weakPoint.position.copy(this.weakPos);
    } else {
      this.weakPoint = {
        position: this.weakPos.clone(),
        radius: this.spec.weakRadius,
        multiplier: this.spec.weakMultiplier,
      };
    }
  }

  // ------------------------------------------------------------------ loader

  private runLoader(
    delta: number,
    dist: number,
    dx: number,
    dz: number,
    ctx: BossContext,
  ): void {
    const speed = this.spec.speed * (this.phase === 2 ? 1.15 : 1);
    this.stateTimer -= delta;

    if (this.state === 'idle') {
      this.cooldown -= delta;
      if (dist > 2.6) this.applyMoveVelocity((dx / dist) * speed, (dz / dist) * speed, speed);
      else this.applyMoveVelocity(0, 0, speed);
      if (this.cooldown <= 0) {
        this.state = 'windup';
        this.stateTimer = 0.7;
        this.chargeDir.set(dx / dist, 0, dz / dist);
        this.figure.coreMat.emissiveIntensity = 2.6;
      }
      return;
    }

    if (this.state === 'windup') {
      this.applyMoveVelocity(0, 0, speed);
      if (this.stateTimer <= 0) {
        this.state = 'strike';
        this.stateTimer = 0.75;
        ctx.audio.explosion(0.5);
      }
      return;
    }

    if (this.state === 'strike') {
      const dash = 11;
      this.applyMoveVelocity(this.chargeDir.x * dash, this.chargeDir.z * dash, dash);
      if (dist < 2.4) ctx.damagePlayer(26 * delta * 4);
      if (this.stateTimer <= 0) {
        this.state = 'recover';
        this.stateTimer = this.phase === 2 ? 0.5 : 0.9;
        // Rage phase adds a ground pound where the charge ends.
        if (this.phase === 2) this.groundPound(ctx);
      }
      return;
    }

    this.applyMoveVelocity(0, 0, speed);
    if (this.stateTimer <= 0) {
      this.state = 'idle';
      this.cooldown = this.spec.interval[this.phase - 1];
    }
  }

  private groundPound(ctx: BossContext): void {
    const t = this.body.translation();
    const at = new THREE.Vector3(t.x, 0.15, t.z);
    ctx.vfx.spawn(at, '#ffb703', 4.4, 0.6);
    ctx.audio.explosion(1.4);
    const p = ctx.player.body.translation();
    const d = Math.hypot(p.x - t.x, p.z - t.z);
    if (d < 5.5) ctx.damagePlayer(24);
  }

  // ------------------------------------------------------------------ carrier

  private runCarrier(
    delta: number,
    dist: number,
    dx: number,
    dz: number,
    ctx: BossContext,
  ): void {
    const speed = this.spec.speed;
    this.stateTimer -= delta;

    if (this.state === 'idle') {
      this.cooldown -= delta;
      // Kites: backs off when close, closes in when far. Never trades at contact range.
      const want = dist < 8 ? -1 : dist > 14 ? 1 : 0;
      if (want !== 0) this.applyMoveVelocity((dx / dist) * speed * want, (dz / dist) * speed * want, speed);
      else this.applyMoveVelocity(0, 0, speed);
      if (this.cooldown <= 0) {
        this.state = 'windup';
        this.stateTimer = 0.55;
        this.figure.coreMat.emissiveIntensity = 2.6;
      }
      return;
    }

    this.applyMoveVelocity(0, 0, speed);
    if (this.state === 'windup' && this.stateTimer <= 0) {
      this.fireBolt(ctx, dx / dist, dz / dist);
      if (this.phase === 2) {
        this.burstLeft -= 1;
        if (this.burstLeft > 0) {
          this.stateTimer = 0.22;
          return;
        }
      }
      this.state = 'recover';
      this.stateTimer = 0.45;
      return;
    }
    if (this.state === 'recover' && this.stateTimer <= 0) {
      this.state = 'idle';
      this.cooldown = this.spec.interval[this.phase - 1];
      this.burstLeft = this.phase === 2 ? 3 : 1;
    }
  }

  /** The game's only ranged attack — a telegraphed bolt the player can step out of. */
  private fireBolt(ctx: BossContext, nx: number, nz: number): void {
    const t = this.body.translation();
    const from = new THREE.Vector3(t.x, t.y - this.capsuleFoot + 0.62, t.z);
    const p = ctx.player.body.translation();
    const shots = this.phase === 2 ? 3 : 1;
    let hit = false;
    for (let i = 0; i < shots; i++) {
      const spread = (i - (shots - 1) / 2) * 0.16;
      const cos = Math.cos(spread);
      const sin = Math.sin(spread);
      const ax = nx * cos - nz * sin;
      const az = nx * sin + nz * cos;
      const to = new THREE.Vector3(t.x + ax * 26, from.y, t.z + az * 26);
      ctx.vfx.beam(from, to, '#54f0a8', 0.1, 0.3, false);
      const px = p.x - t.x;
      const pz = p.z - t.z;
      const along = px * ax + pz * az;
      const lateral = Math.abs(px * az - pz * ax);
      if (along > 0 && along < 26 && lateral < 1.5) hit = true;
    }
    if (hit) ctx.damagePlayer(this.phase === 2 ? 11 : 15);
    ctx.audio.fire('arc');
  }

  // ------------------------------------------------------------------ guardian

  private runGuardian(
    delta: number,
    dist: number,
    dx: number,
    dz: number,
    ctx: BossContext,
  ): void {
    const speed = this.spec.speed;
    this.stateTimer -= delta;

    if (this.state === 'idle') {
      this.cooldown -= delta;
      if (dist > 6) this.applyMoveVelocity((dx / dist) * speed, (dz / dist) * speed, speed);
      else this.applyMoveVelocity(0, 0, speed);
      if (this.cooldown <= 0) {
        this.state = 'windup';
        this.stateTimer = 0.85;
        // Rage phase fires a three-shot burst. Setting the count here (and decrementing it
        // on each shot) is what lets the state machine ever reach 'recover' — resetting it
        // inside the fire branch instead trapped the guardian in windup forever, so the core
        // never opened and the boss was unkillable.
        this.burstLeft = this.phase === 2 ? 3 : 1;
      }
      return;
    }

    this.applyMoveVelocity(0, 0, speed);

    if (this.state === 'windup' && this.stateTimer <= 0) {
      this.pulse(ctx);
      this.burstLeft = Math.max(0, this.burstLeft - 1);
      this.state = this.burstLeft > 0 ? 'windup' : 'recover';
      this.stateTimer = this.burstLeft > 0 ? 0.3 : 0.5;
      return;
    }

    if (this.state === 'recover' && this.stateTimer <= 0) {
      this.state = 'idle';
      this.cooldown = this.spec.interval[this.phase - 1];
      // The window where the core is actually damageable — the whole fight rhythm.
      this.coreOpenTimer = this.phase === 2 ? 4.2 : 3.0;
    }
  }

  /**
   * Radial shockwave. Safe if you hug the obelisk or stay outside the band, which is what
   * teaches spacing instead of rewarding face-tanking.
   */
  private pulse(ctx: BossContext): void {
    const t = this.body.translation();
    const at = new THREE.Vector3(t.x, 0.15, t.z);
    ctx.vfx.spawn(at, '#ff2d6a', 5.2, 0.55);
    ctx.audio.explosion(1.1);
    const p = ctx.player.body.translation();
    const d = Math.hypot(p.x - t.x, p.z - t.z);
    if (d > 2.2 && d < 8.5) ctx.damagePlayer(this.phase === 2 ? 22 : 18);
  }
}
