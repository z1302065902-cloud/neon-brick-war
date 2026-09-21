import * as THREE from 'three';
import { BrickAgent } from './BrickAgent';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { ExplosionVfx } from '../systems/ExplosionVfx';
import type { AudioSystem } from '../systems/AudioSystem';

/**
 * Airborne enemy — a brick-built flyer.
 *
 * Everything else in the game walks toward you on the ground, so this one changes the fight
 * simply by existing: it orbits out of reach, so the player has to track a moving target
 * above the horizon line instead of strafing at eye level, and it forces a look up.
 *
 * Flight is positional rather than physical. The body is dynamic but its Y is written every
 * frame, the same approach the drone-carrier boss uses — a rigid body under gravity is the
 * wrong tool for something that is supposed to hold an altitude.
 */

export type FlyerState = 'orbit' | 'windup' | 'dive' | 'climb';

export type FlyerContext = {
  /** Player position at ground level — the flyer orbits this, not the capsule centre. */
  playerFeet: THREE.Vector3;
  vfx: ExplosionVfx;
  audio: AudioSystem;
  damagePlayer: (amount: number) => void;
};

export type FlyerFigure = {
  root: THREE.Group;
  wingL: THREE.Object3D;
  wingR: THREE.Object3D;
  head: THREE.Object3D;
  trail: THREE.Mesh[];
};

const BODY_HALF = 0.28;
const BODY_RADIUS = 0.26;
/** Cruise altitude. High enough that it reads as "above you", low enough to shoot. */
const ALTITUDE = 4.2;
const ORBIT_RADIUS = 9;
const ORBIT_SPEED = 0.62;

function createFlyerFigure(palette: { body: string; wing: string; accent: string }): FlyerFigure {
  const root = new THREE.Group();
  root.name = 'FlyerFigure';

  const plastic = (color: string, roughness = 0.3, metalness = 0.12) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const glow = (color: string, intensity = 1.0) =>
    new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: intensity, roughness: 0.32, metalness: 0.15,
    });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.44, 1.15), plastic(palette.body, 0.28));
  body.castShadow = true;
  root.add(body);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.2, 0.5), glow(palette.accent, 0.8));
  chest.position.set(0, -0.12, 0.12);
  root.add(chest);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.4), plastic(palette.body, 0.26));
  head.position.set(0, 0.24, 0.66);
  head.castShadow = true;
  root.add(head);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), plastic('#ffb703', 0.35, 0.3));
  beak.position.set(0, 0.22, 0.94);
  beak.rotation.x = Math.PI / 2;
  root.add(beak);

  // Wings pivot at the shoulder so the flap reads as a wingbeat, not a spin.
  const wingMat = plastic(palette.wing, 0.34);
  const wings: THREE.Object3D[] = [];
  for (const side of [-1, 1] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.24, 0.06, 0.1);
    root.add(pivot);

    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.62), wingMat);
    panel.position.x = side * 0.52;
    panel.castShadow = true;
    pivot.add(panel);

    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.44), glow(palette.accent, 0.7));
    tip.position.x = side * 1.1;
    pivot.add(tip);

    wings.push(pivot);
  }

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.4), wingMat);
  tail.position.set(0, 0.04, -0.72);
  tail.castShadow = true;
  root.add(tail);

  const trail: THREE.Mesh[] = [];
  for (const color of ['#54f0a8', '#7df9ff']) {
    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 8), glow(color, 1.1));
    jet.rotation.x = -Math.PI / 2;
    jet.position.set(0, -0.02, -0.86);
    jet.visible = false;
    root.add(jet);
    trail.push(jet);
  }

  return { root, wingL: wings[0]!, wingR: wings[1]!, head, trail };
}

export class FlyerAgent extends BrickAgent {
  state: FlyerState = 'orbit';
  private readonly figure: FlyerFigure;
  private readonly forward = new THREE.Vector3();
  private stateTimer = 0;
  private orbitAngle: number;
  private flap = 0;
  private diveDir = new THREE.Vector3();

  constructor(physics: PhysicsWorld, position: THREE.Vector3, maxHp = 42) {
    const figure = createFlyerFigure({ body: '#2f8f6a', wing: '#1f6b4e', accent: '#54f0a8' });
    super(physics, { skin: '#9fdcb8', torso: '#2f8f6a', legs: '#123a2a', accent: '#54f0a8' },
      position, 'enemy', maxHp, {
        figure: figure.root,
        half: BODY_HALF,
        radius: BODY_RADIUS,
        density: 1.6,
        scale: 1,
      });
    this.figure = figure;
    this.orbitAngle = Math.random() * Math.PI * 2;
  }

  /** Flyers detonate in the air; the bricks rain down instead of toppling. */
  protected override onDeath(): void {
    this.weakPoint = null;
    this.group.visible = false;
  }

  /**
   * Hold position while the pointer is unlocked.
   *
   * Clamps back up to cruise altitude as well as freezing X/Z: update() is what normally
   * writes Y, so without this a flyer that spawned while the game was paused simply fell
   * until someone took control of it.
   */
  parkPosition(): void {
    if (!this.alive) return;
    const t = this.body.translation();
    this.hold(t.x, Math.max(t.y, ALTITUDE), t.z);
  }

  /** Write the altitude directly — gravity is the wrong model for a hovering flyer. */
  private hold(x: number, y: number, z: number): void {
    this.body.setTranslation({ x, y, z }, true);
    const v = this.body.linvel();
    if (Math.abs(v.y) > 1e-4) this.body.setLinvel({ x: v.x, y: 0, z: v.z }, true);
  }

  update(delta: number, ctx: FlyerContext): void {
    if (!this.alive) return;

    const t = this.body.translation();
    const p = ctx.playerFeet;
    const dx = p.x - t.x;
    const dz = p.z - t.z;
    const flat = Math.hypot(dx, dz) || 1;

    // Wingbeat speeds up with effort, which sells the dive and the climb.
    const beatRate = this.state === 'dive' ? 26 : this.state === 'climb' ? 20 : 11;
    this.flap += delta * beatRate;
    const beat = Math.sin(this.flap);
    this.figure.wingL.rotation.z = beat * 0.75 - 0.15;
    this.figure.wingR.rotation.z = -beat * 0.75 + 0.15;
    const jetting = this.state === 'dive' || this.state === 'climb';
    for (const jet of this.figure.trail) {
      jet.visible = jetting;
      jet.scale.setScalar(0.85 + Math.abs(beat) * 0.5);
    }

    const level = t.y;
    switch (this.state) {
      case 'orbit': {
        this.stateTimer -= delta;
        // Circle the player rather than closing in. Strafe-and-shoot does not answer this.
        this.orbitAngle += delta * ORBIT_SPEED;
        const tx = p.x + Math.cos(this.orbitAngle) * ORBIT_RADIUS;
        const tz = p.z + Math.sin(this.orbitAngle) * ORBIT_RADIUS;
        const bob = Math.sin(this.flap * 0.35) * 0.18;
        this.hold(tx, ALTITUDE + bob, tz);
        this.faceTowards(tx - t.x, tz - t.z);
        if (this.stateTimer <= 0) {
          this.state = 'windup';
          this.stateTimer = 0.45;
        }
        break;
      }

      case 'windup': {
        this.stateTimer -= delta;
        // Fold in and rise slightly — the tell before the dive.
        this.hold(t.x, Math.min(ALTITUDE + 0.9, level + delta * 4), t.z);
        this.faceTowards(dx, dz);
        if (this.stateTimer <= 0) {
          this.state = 'dive';
          this.stateTimer = 1.1;
          this.diveDir.set(dx / flat, 0, dz / flat);
          ctx.audio.fire('scatter');
        }
        break;
      }

      case 'dive': {
        this.stateTimer -= delta;
        const speed = 15;
        const nx = t.x + this.diveDir.x * speed * delta;
        const nz = t.z + this.diveDir.z * speed * delta;
        const ny = Math.max(0.9, level - 9 * delta);
        this.hold(nx, ny, nz);
        this.faceTowards(this.diveDir.x, this.diveDir.z);
        this.figure.root.rotation.x = -0.5;
        if (flat < 1.5 && ny < 1.6) {
          ctx.damagePlayer(18);
          ctx.vfx.spawn(new THREE.Vector3(t.x, ny, t.z), '#54f0a8', 2.2, 0.35);
          this.state = 'climb';
          this.stateTimer = 1.0;
        } else if (this.stateTimer <= 0) {
          this.state = 'climb';
          this.stateTimer = 1.0;
        }
        break;
      }

      case 'climb': {
        this.stateTimer -= delta;
        this.figure.root.rotation.x = 0.25;
        const ny = Math.min(ALTITUDE, level + 7 * delta);
        this.hold(t.x + this.diveDir.x * 3 * delta, ny, t.z + this.diveDir.z * 3 * delta);
        if (this.stateTimer <= 0) {
          this.figure.root.rotation.x = 0;
          this.state = 'orbit';
          this.stateTimer = 2.6 + Math.random() * 1.4;
          // Re-enter the orbit from wherever it ended up, not from a stale angle.
          this.orbitAngle = Math.atan2(t.z - p.z, t.x - p.x);
        }
        break;
      }
    }

    // Keep the collider under the mesh no matter which state wrote the position.
    const after = this.body.translation();
    this.group.position.set(after.x, after.y - this.capsuleFoot, after.z);
  }

  private faceTowards(dx: number, dz: number): void {
    this.forward.set(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
    this.setYaw(Math.atan2(dx, dz));
  }
}
