import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { BrickAgent } from '../entities/BrickAgent';
import type { WeaponLoadout } from './WeaponLoadout';
import type { ExplosionVfx } from './ExplosionVfx';
import type { WeaponDef } from '../data/weapons';

export type FireResult = {
  hitAgents: BrickAgent[];
  explosionAt?: THREE.Vector3;
  explosionScale?: number;
  explosionColor?: string;
};

export class CombatSystem {
  private readonly muzzleFlash: THREE.PointLight;
  private flashTimer = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly tmp3 = new THREE.Vector3();
  private readonly tmp4 = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly loadout: WeaponLoadout,
    private readonly vfx: ExplosionVfx,
  ) {
    this.muzzleFlash = new THREE.PointLight('#7df9ff', 0, 12);
    scene.add(this.muzzleFlash);
  }

  /** A fresh CombatSystem is built on every map load — its light must not be left behind. */
  dispose(): void {
    this.scene.remove(this.muzzleFlash);
  }

  update(delta: number): void {
    this.loadout.update(delta);
    this.flashTimer = Math.max(0, this.flashTimer - delta);
    this.muzzleFlash.intensity = this.flashTimer > 0 ? 12 : 0;
  }

  tryFire(
    world: RAPIER.World,
    from: THREE.Vector3,
    dir: THREE.Vector3,
    shooter: BrickAgent,
    targets: BrickAgent[],
    fireHeld: boolean,
    delta: number,
    damageMul = 1,
  ): FireResult | null {
    if (!shooter.alive || !fireHeld) {
      this.loadout.charging = false;
      this.loadout.railCharge = 0;
      return null;
    }

    const weapon = this.loadout.current;
    // Start outside the capsule so the ray is not swallowed by the shooter.
    const origin = from.clone().addScaledVector(dir, 1.25);
    origin.y = Math.max(origin.y, from.y + 0.15);

    if (weapon.mode === 'rail') {
      return this.fireRail(world, origin, dir, shooter, targets, weapon, damageMul, delta);
    }

    if (this.loadout.cooldown > 0) return null;
    if (!this.loadout.tryConsumeAmmo()) return null;

    this.loadout.cooldown = weapon.fireRate;
    this.flash(origin, weapon.muzzleColor);

    switch (weapon.mode) {
      case 'hitscan':
        return this.fireHitscan(world, origin, dir, shooter, targets, weapon, damageMul, 1, 0);
      case 'scatter':
        return this.fireScatter(world, origin, dir, shooter, targets, weapon, damageMul);
      case 'grenade':
      case 'plasma':
        return this.fireAoe(world, origin, dir, shooter, targets, weapon, damageMul);
      case 'arc':
        return this.fireArc(world, origin, dir, shooter, targets, weapon, damageMul);
      default:
        return this.fireHitscan(world, origin, dir, shooter, targets, weapon, damageMul, 1, 0);
    }
  }

  private flash(from: THREE.Vector3, color: string): void {
    this.muzzleFlash.color.set(color);
    this.muzzleFlash.position.copy(from);
    this.flashTimer = 0.07;
  }

  private fireRail(
    world: RAPIER.World,
    from: THREE.Vector3,
    dir: THREE.Vector3,
    shooter: BrickAgent,
    targets: BrickAgent[],
    weapon: WeaponDef,
    damageMul: number,
    delta: number,
  ): FireResult | null {
    const need = weapon.chargeTime ?? 0.55;
    this.loadout.charging = true;
    this.loadout.railCharge += delta;
    if (this.loadout.railCharge < need) return null;
    if (this.loadout.cooldown > 0) return null;
    if (!this.loadout.tryConsumeAmmo()) return null;
    this.loadout.railCharge = 0;
    this.loadout.charging = false;
    this.loadout.cooldown = 0.85;
    this.flash(from, weapon.muzzleColor);
    const result = this.fireHitscan(world, from, dir, shooter, targets, weapon, damageMul, 1, 0, true);
    if (result.hitAgents.length) {
      const p = result.hitAgents[0]!.body.translation();
      this.vfx.spawn(new THREE.Vector3(p.x, p.y, p.z), weapon.muzzleColor, 1.2, 0.35);
    }
    return result;
  }

  private fireScatter(
    world: RAPIER.World,
    from: THREE.Vector3,
    dir: THREE.Vector3,
    shooter: BrickAgent,
    targets: BrickAgent[],
    weapon: WeaponDef,
    damageMul: number,
  ): FireResult {
    const pellets = weapon.pellets ?? 5;
    const spread = weapon.spread ?? 0.15;
    const hitSet = new Set<BrickAgent>();
    for (let i = 0; i < pellets; i++) {
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * spread;
      d.y += (Math.random() - 0.5) * spread * 0.6;
      d.z += (Math.random() - 0.5) * spread;
      d.normalize();
      const r = this.fireHitscan(world, from, d, shooter, targets, weapon, damageMul, 1, 0);
      for (const a of r.hitAgents) hitSet.add(a);
    }
    return { hitAgents: [...hitSet] };
  }

  private fireAoe(
    world: RAPIER.World,
    from: THREE.Vector3,
    dir: THREE.Vector3,
    shooter: BrickAgent,
    targets: BrickAgent[],
    weapon: WeaponDef,
    damageMul: number,
  ): FireResult {
    const impact = this.rayImpactPoint(world, from, dir, weapon.range, shooter);
    const radius = weapon.aoeRadius ?? 3;
    const hitAgents: BrickAgent[] = [];
    for (const t of targets) {
      if (!t.alive || t === shooter) continue;
      const p = t.body.translation();
      const centre = this.tmp.set(p.x, p.y, p.z);
      const d = centre.distanceTo(impact);
      if (d > radius) continue;
      // A blast does not travel through walls — no damaging enemies behind cover.
      if (this.lineBlocked(world, impact, centre, shooter, t.body.collider(0) ?? undefined)) continue;
      this.applyDamage(t, weapon.damage * damageMul * (1 - d / radius * 0.4), weapon.pierceShield);
      hitAgents.push(t);
    }
    this.vfx.beam(from, impact, weapon.muzzleColor, 0.16, 0.5, true);
    this.vfx.spawn(impact, '#ff6a00', Math.max(2.6, radius), 0.55);
    return {
      hitAgents,
      explosionAt: impact,
      explosionScale: radius * 0.85,
      explosionColor: weapon.muzzleColor,
    };
  }

  private fireArc(
    world: RAPIER.World,
    from: THREE.Vector3,
    dir: THREE.Vector3,
    shooter: BrickAgent,
    targets: BrickAgent[],
    weapon: WeaponDef,
    damageMul: number,
  ): FireResult {
    const chain = weapon.chainCount ?? 3;
    const ordered = targets
      .filter((t) => t.alive && t !== shooter)
      .map((t) => {
        const p = t.body.translation();
        const to = this.tmp.set(p.x - from.x, p.y - from.y, p.z - from.z);
        const proj = to.dot(dir);
        const lat = to.clone().addScaledVector(dir, -proj).length();
        return { t, proj, lat, dist: to.length() };
      })
      .filter((x) => x.proj > 0 && x.proj < weapon.range && x.lat < 2.2)
      .sort((a, b) => a.dist - b.dist);

    const hitAgents: BrickAgent[] = [];
    let prev = from.clone();
    let prevAgent: BrickAgent | null = null;
    for (let i = 0; i < ordered.length && hitAgents.length < chain; i++) {
      const agent = ordered[i]!.t;
      const p = agent.body.translation();
      const hit = new THREE.Vector3(p.x, p.y + 0.4, p.z);
      // The arc must not jump through walls between links, and the previous link's body
      // must be excluded or the ray starts inside it.
      const ignore = prevAgent?.body.collider(0) ?? undefined;
      if (this.lineBlocked(world, prev, hit, shooter, ignore)) continue;
      prevAgent = agent;
      const step = hitAgents.length;
      this.applyDamage(agent, weapon.damage * damageMul * (1 - step * 0.15), weapon.pierceShield);
      hitAgents.push(agent);
      this.vfx.beam(prev, hit, weapon.muzzleColor, 0.16, 0.42, false);
      this.vfx.spawn(hit, weapon.muzzleColor, 0.85, 0.28);
      prev = hit;
    }
    return { hitAgents };
  }

  private fireHitscan(
    world: RAPIER.World,
    from: THREE.Vector3,
    dir: THREE.Vector3,
    shooter: BrickAgent,
    targets: BrickAgent[],
    weapon: WeaponDef,
    damageMul: number,
    _pellets: number,
    _spread: number,
    pierce = false,
  ): FireResult {
    const wallDist = this.rayWallDistance(world, from, dir, weapon.range, shooter);
    let best: BrickAgent | null = null;
    let bestDist = wallDist;
    for (const t of targets) {
      if (!t.alive || t === shooter) continue;
      const p = t.body.translation();
      const to = this.tmp2.set(p.x - from.x, p.y - from.y, p.z - from.z);
      const proj = to.dot(dir);
      if (proj < 0 || proj > bestDist + (pierce ? 2 : 0.3)) continue;
      const closest = from.clone().addScaledVector(dir, proj);
      if (closest.distanceTo(new THREE.Vector3(p.x, p.y, p.z)) > 1.8) continue;
      if (proj < bestDist || pierce) {
        bestDist = pierce ? Math.min(bestDist, proj) : proj;
        best = t;
        if (!pierce) break;
      }
    }
    const hitAgents: BrickAgent[] = [];
    if (best) {
      this.applyDamage(best, weapon.damage * damageMul, weapon.pierceShield || pierce);
      hitAgents.push(best);
      const p = best.body.translation();
      const hit = new THREE.Vector3(p.x, p.y, p.z);
      this.spawnTracer(from, hit, weapon.muzzleColor, pierce);
      this.vfx.spawn(hit, weapon.muzzleColor, pierce ? 1.4 : 0.9, 0.28);
    } else {
      const end = from.clone().addScaledVector(dir, wallDist);
      this.spawnTracer(from, end, weapon.muzzleColor, pierce);
      this.vfx.spawn(end, weapon.muzzleColor, 0.55, 0.18);
    }
    return { hitAgents };
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3, color: string, fat = false): void {
    this.vfx.beam(from, to, color, fat ? 0.35 : 0.22, fat ? 1.0 : 0.9, fat);
  }

  private applyDamage(target: BrickAgent, amount: number, pierceShield: boolean): void {
    if (target.hasShield && !pierceShield) {
      target.absorbShield(amount);
      return;
    }
    target.takeDamage(amount);
  }

  /**
   * True when static world geometry sits between `from` and `to`.
   * The ray stops short of the target so a body never occludes itself.
   */
  private lineBlocked(
    world: RAPIER.World,
    from: THREE.Vector3,
    to: THREE.Vector3,
    shooter: BrickAgent,
    ignore?: RAPIER.Collider,
  ): boolean {
    const delta = this.tmp3.subVectors(to, from);
    const dist = delta.length();
    if (dist < 0.6) return false;
    delta.multiplyScalar(1 / dist);
    const origin = this.tmp4.copy(from).addScaledVector(delta, 0.2);
    const ray = new RAPIER.Ray(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: delta.x, y: delta.y, z: delta.z },
    );
    // The origin often sits right on the target's own surface (an impact point), so both the
    // shooter and the body being tested must be excluded or `solid` reports a hit at toi 0.
    const exclude = shooter.body.collider(0) ?? undefined;
    const predicate = (c: RAPIER.Collider) => c !== exclude && c !== ignore;
    return Boolean(
      world.castRay(ray, dist - 0.5, true, undefined, undefined, undefined, undefined, predicate),
    );
  }

  private rayWallDistance(
    world: RAPIER.World,
    from: THREE.Vector3,
    dir: THREE.Vector3,
    range: number,
    shooter: BrickAgent,
  ): number {
    const ray = new RAPIER.Ray(
      { x: from.x, y: from.y, z: from.z },
      { x: dir.x, y: dir.y, z: dir.z },
    );
    const exclude = shooter.body.collider(0) ?? undefined;
    const hit = world.castRay(ray, range, true, undefined, undefined, exclude);
    return hit ? hit.timeOfImpact : range;
  }

  private rayImpactPoint(
    world: RAPIER.World,
    from: THREE.Vector3,
    dir: THREE.Vector3,
    range: number,
    shooter: BrickAgent,
  ): THREE.Vector3 {
    const d = this.rayWallDistance(world, from, dir, range, shooter);
    return from.clone().addScaledVector(dir, Math.max(1, d));
  }
}
