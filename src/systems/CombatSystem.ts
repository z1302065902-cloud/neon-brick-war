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
  /** Set when the shot landed on a boss weak spot — drives distinct feedback. */
  weakHit?: boolean;
  /** Set when this shot is what broke a shield. */
  shieldBreak?: boolean;
};

export class CombatSystem {
  private readonly muzzleFlash: THREE.PointLight;
  private flashTimer = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly tmp3 = new THREE.Vector3();
  private readonly tmp4 = new THREE.Vector3();
  private readonly tmp5 = new THREE.Vector3();
  private readonly tmp6 = new THREE.Vector3();

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
    // Only static geometry stops a blast. Bodies do not: a grenade that damaged just the
    // frontmost enemy of a cluster is not an area weapon, and the blast wave realistically
    // wraps around a person.
    const bodies = this.agentColliderSet(targets);
    const hitAgents: BrickAgent[] = [];
    let shieldBreak = false;
    for (const t of targets) {
      if (!t.alive || t === shooter) continue;
      const p = t.body.translation();
      const centre = this.tmp.set(p.x, p.y, p.z);
      const d = centre.distanceTo(impact);
      if (d > radius) continue;
      // A blast does not travel through walls — no damaging enemies behind cover.
      if (this.lineBlocked(world, impact, centre, shooter, undefined, bodies)) continue;
      const broke = this.applyDamage(
        t,
        weapon.damage * damageMul * (1 - d / radius * 0.4),
        weapon.pierceShield,
        impact,
      );
      if (broke) shieldBreak = true;
      hitAgents.push(t);
    }
    this.vfx.beam(from, impact, weapon.muzzleColor, 0.16, 0.5, true);
    this.vfx.spawn(impact, '#ff6a00', Math.max(2.6, radius), 0.55);
    return {
      hitAgents,
      explosionAt: impact,
      explosionScale: radius * 0.85,
      explosionColor: weapon.muzzleColor,
      shieldBreak,
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
        // Measured to the capsule axis, same as hitscan, so a bolt aimed at the chest or
        // head still counts instead of arcing past above the collider centre.
        const lat = this.rayToBodyDistance(from, dir, t, proj);
        return { t, proj, lat, dist: to.length() };
      })
      // Chain tolerance also scales off the body, slightly more generously than hitscan
      // since lightning is meant to arc onto nearby targets.
      .filter((x) => x.proj > 0 && x.proj < weapon.range && x.lat < x.t.radius + 0.6)
      .sort((a, b) => a.dist - b.dist);

    // Lightning arcs over bodies — only walls break the chain.
    const bodies = this.agentColliderSet(targets);
    const hitAgents: BrickAgent[] = [];
    let shieldBreak = false;
    let prev = from.clone();
    for (let i = 0; i < ordered.length && hitAgents.length < chain; i++) {
      const agent = ordered[i]!.t;
      const p = agent.body.translation();
      const hit = new THREE.Vector3(p.x, p.y + 0.4, p.z);
      // The arc must not jump through walls between links.
      if (this.lineBlocked(world, prev, hit, shooter, undefined, bodies)) continue;
      const step = hitAgents.length;
      const broke = this.applyDamage(
        agent,
        weapon.damage * damageMul * (1 - step * 0.15),
        weapon.pierceShield,
        prev,
      );
      if (broke) shieldBreak = true;
      hitAgents.push(agent);
      this.vfx.beam(prev, hit, weapon.muzzleColor, 0.16, 0.42, false);
      this.vfx.spawn(hit, weapon.muzzleColor, 0.85, 0.28);
      prev = hit;
    }
    return { hitAgents, shieldBreak };
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
    // Everything the ray passes near, nearest first.
    const candidates: { t: BrickAgent; proj: number }[] = [];
    for (const t of targets) {
      if (!t.alive || t === shooter) continue;
      const p = t.body.translation();
      const to = this.tmp2.set(p.x - from.x, p.y - from.y, p.z - from.z);
      const proj = to.dot(dir);
      if (proj < 0 || proj > weapon.range) continue;
      // Tolerance is sized off the body rather than a flat constant. The old 1.8m was 6.4x
      // a grunt's 0.28m capsule, so shots that visibly missed still connected.
      // The 0.45m of slack covers the gap between the collider (1.46 tall) and the visible
      // figure (1.90 tall) so aiming at the head reads as a hit.
      if (this.rayToBodyDistance(from, dir, t, proj) > t.radius + 0.45) continue;
      candidates.push({ t, proj });
    }
    candidates.sort((a, b) => a.proj - b.proj);

    /*
     * Occlusion is resolved per body rather than against one global "wall distance".
     * The old approach cast a single ray that did not exclude the targets, so a centred
     * shot hit the victim's *own* capsule and then failed `proj < bestDist` — meaning
     * accurately aimed shots did nothing while sloppy ones connected. Every hitscan weapon
     * in the game was affected.
     */
    /*
     * Occlusion is resolved per body rather than against one global "wall distance".
     * The old approach cast a single ray that did not exclude the targets, so a centred
     * shot hit the victim's *own* capsule and then failed `proj < bestDist` — meaning
     * accurately aimed shots did nothing while sloppy ones connected. Every hitscan weapon
     * in the game was affected.
     *
     * Rails keep going: because candidates are already nearest-first, stopping at the first
     * visible body is a one-liner. Running the same loop to the end is what makes the rail
     * rifle actually pierce a line of enemies, which is the design spec's stated promise.
     */
    const hitAgents: BrickAgent[] = [];
    let weakHit = false;
    let shieldBreak = false;
    let reach = weapon.range;
    const budget = pierce ? (weapon.pierceBodies ?? 1) : 1;
    // Bodies this shot has already passed through stop being occluders — otherwise the first
    // enemy in a line blocks the sight-line to the second and the rail silently stops at one.
    const pierced = new Set<number>();
    for (const c of candidates) {
      if (c.proj > reach) break;
      const p = c.t.body.translation();
      const centre = new THREE.Vector3(p.x, p.y, p.z);
      if (this.lineBlocked(world, from, centre, shooter, c.t.body.collider(0) ?? undefined, pierced)) continue;

      let amount = weapon.damage * damageMul;
      // A boss weak spot only counts when the ray actually passes through it.
      const wp = c.t.weakPoint;
      if (wp && this.rayDistanceTo(from, dir, wp.position) <= wp.radius) {
        amount *= wp.multiplier;
        weakHit = true;
      }
      if (this.applyDamage(c.t, amount, weapon.pierceShield || pierce, from)) shieldBreak = true;
      hitAgents.push(c.t);
      const h = c.t.body.collider(0);
      if (h) pierced.add(h.handle);
      const hit = new THREE.Vector3(p.x, p.y, p.z);
      this.spawnTracer(from, hit, weapon.muzzleColor, pierce);
      this.vfx.spawn(hit, weakHit ? '#54f0a8' : weapon.muzzleColor, weakHit ? 2.2 : pierce ? 1.4 : 0.9, weakHit ? 0.4 : 0.28);

      if (hitAgents.length >= budget) {
        reach = c.proj;
        break;
      }
    }

    if (hitAgents.length === 0) {
      const wallDist = this.rayWallDistance(world, from, dir, weapon.range, shooter);
      const end = from.clone().addScaledVector(dir, wallDist);
      this.spawnTracer(from, end, weapon.muzzleColor, pierce);
      this.vfx.spawn(end, weapon.muzzleColor, 0.55, 0.18);
    } else if (pierce) {
      // Carry the rail's tracer out to whatever actually stopped it.
      const stop = this.rayWallDistance(world, from, dir, weapon.range, shooter);
      this.spawnTracer(from, from.clone().addScaledVector(dir, stop), weapon.muzzleColor, true);
    }
    return { hitAgents, weakHit, shieldBreak };
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3, color: string, fat = false): void {
    this.vfx.beam(from, to, color, fat ? 0.35 : 0.22, fat ? 1.0 : 0.9, fat);
  }

  /** Collider handles for every agent, so blasts and arcs can ignore bodies entirely. */
  private agentColliderSet(targets: BrickAgent[]): Set<number> {
    const set = new Set<number>();
    for (const t of targets) {
      const c = t.body.collider(0);
      if (c) set.add(c.handle);
    }
    return set;
  }

  /**
   * Shortest distance from the ray to the target's capsule axis.
   *
   * Measuring to the capsule *centre* instead would make head and chest shots miss: the
   * collider stops at y≈1.46 while the figure is 1.9 tall, so a shot aimed at the head
   * passes ~0.85m above the centre. Sampling the axis is what lets the tolerance stay tight
   * without punishing good aim.
   */
  private rayToBodyDistance(
    from: THREE.Vector3,
    dir: THREE.Vector3,
    target: BrickAgent,
    proj: number,
  ): number {
    const p = target.body.translation();
    const half = Math.max(0, target.standHeight - target.radius);
    const closest = this.tmp5.copy(from).addScaledVector(dir, proj);
    let best = Infinity;
    for (let i = 0; i <= 4; i++) {
      const y = p.y - half + (half * 2 * i) / 4;
      best = Math.min(best, closest.distanceTo(this.tmp6.set(p.x, y, p.z)));
    }
    return best;
  }

  /** Shortest distance from `point` to the ray `from + t*dir`. */
  private rayDistanceTo(from: THREE.Vector3, dir: THREE.Vector3, point: THREE.Vector3): number {
    const to = this.tmp.set(point.x - from.x, point.y - from.y, point.z - from.z);
    const proj = to.dot(dir);
    return to.addScaledVector(dir, -proj).length();
  }

  /** Returns true when this hit is what broke the target's shield. */
  private applyDamage(
    target: BrickAgent,
    amount: number,
    pierceShield: boolean,
    from: THREE.Vector3,
  ): boolean {
    // Directional armour (boss front plates) scales the hit before shields see it.
    const scaled = amount * target.damageScaleFrom(from);
    if (target.hasShield && !pierceShield) {
      target.absorbShield(scaled);
      return !target.hasShield;
    }
    target.takeDamage(scaled);
    return false;
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
    ignoreSet?: Set<number>,
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
    // `solid: false` so a ray whose origin happens to sit inside a shape reports nothing
    // instead of a toi-0 hit. With `solid: true` any origin inside the shooter's own capsule
    // (or on an impact point) reads as "blocked" and silently swallows the shot.
    // The shooter and the body under test are excluded on top of that.
    const exclude = shooter.body.collider(0) ?? undefined;
    const predicate = (c: RAPIER.Collider) =>
      c !== exclude && c !== ignore && !(ignoreSet?.has(c.handle) ?? false);
    return Boolean(
      world.castRay(ray, dist - 0.5, false, undefined, undefined, undefined, undefined, predicate),
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
