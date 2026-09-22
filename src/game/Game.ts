import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { TpsInput } from '../core/TpsInput';
import { PURCHASE_URL, UnlockStore } from '../commerce/UnlockStore';
import { BrickAgent, CAPSULE_HALF, CAPSULE_RADIUS } from '../entities/BrickAgent';
import { BossAgent, LEVEL_BOSS, type BossArchetype, type BossContext } from '../entities/BossAgent';
import { FlyerAgent, type FlyerContext } from '../entities/FlyerAgent';
import { ENEMY_PALETTE, PLAYER_PALETTE } from '../entities/BrickCharacter';
import { CHASSIS, DEFAULT_CHASSIS, nextChassis, unlockedChassis, type ChassisId } from '../data/chassis';
import { enemyForLevel } from '../data/enemies';
import { WorldPickup } from '../entities/WorldPickup';
import type { LevelBuildResult } from '../levels/LevelFactory';
import { createLevel as buildLevel, gradingFor } from '../levels/Maps';
import {
  CAMPAIGN_END,
  LEVELS,
  TOTAL_LEVELS,
  t as tr,
  type Lang,
  type Localized,
} from '../data/story';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { disposeObject3D } from '../utils/dispose';
import { CombatSystem } from '../systems/CombatSystem';
import { ExplosionVfx } from '../systems/ExplosionVfx';
import { BrickDebris } from '../systems/BrickDebris';
import { CanvasHud } from '../systems/CanvasHud';
import { ColliderDebug } from '../systems/ColliderDebug';
import { AudioSystem } from '../systems/AudioSystem';
import { TpsCamera } from '../systems/TpsCamera';
import { WeaponLoadout } from '../systems/WeaponLoadout';
import { PICKUPS, type PickupId } from '../data/pickups';
import type { WeaponId } from '../data/weapons';

const BASE_SPEED = 7.2;
const ENEMY_SPEED = 3.4;
/** With light damping this clears roughly 1.6m, enough to reach a deck edge directly. */
const JUMP_SPEED = 9;

type Buffs = {
  haste: number;
  doubleDamage: number;
  decoy: number;
  scan: number;
};

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly colliderDebug = new ColliderDebug(
    this.scene,
    new URLSearchParams(window.location.search).has('debug'),
  );
  private readonly audio = new AudioSystem();
  private readonly debris: BrickDebris;
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.12, 140);
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private hemi!: THREE.HemisphereLight;
  private key!: THREE.DirectionalLight;
  private fill!: THREE.PointLight;
  private rim!: THREE.PointLight;
  private readonly input: TpsInput;
  private readonly hud: CanvasHud;
  private readonly unlocks = new UnlockStore();
  private readonly tps = new TpsCamera(this.camera);
  private readonly loadout = new WeaponLoadout();
  private readonly loop: Loop;
  private readonly moveScratch = new THREE.Vector2();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly aimDir = new THREE.Vector3();
  private readonly muzzle = new THREE.Vector3();

  private physics: PhysicsWorld | null = null;
  private combat!: CombatSystem;
  private vfx!: ExplosionVfx;
  private level!: LevelBuildResult;
  private player!: BrickAgent;
  private enemies: BrickAgent[] = [];
  private pickups: WorldPickup[] = [];
  private ready = false;
  private win = false;
  private dead = false;
  private frame = 0;
  private elapsed = 0;
  private checkpoint = new THREE.Vector3();
  private mapIndex = 0;
  private bossSpawned = false;
  private buffs: Buffs = { haste: 0, doubleDamage: 0, decoy: 0, scan: 0 };
  private mapAdvanceTimer = 0;
  private advancing = false;
  private viewW = 0;
  private viewH = 0;
  private boss: BossAgent | null = null;
  private readonly pendingAdds: BrickAgent[] = [];
  private readonly climaxAt = new THREE.Vector3();
  private readonly flyerFeet = new THREE.Vector3();
  private climaxLeft = 0;
  private climaxTimer = 0;
  private climaxStarted = false;
  private playerRevealAt = -1;
  /** Bilingual UI: every display string routes through `tr(...)`. */
  private lang: Lang = 'en';
  private storyTimer = 0;
  private storyLines: Localized[] = [];
  private paused = false;
  /** Salvage from kills — the currency for chassis rebuilds. */
  private salvage = 0;
  private chassis: ChassisId = DEFAULT_CHASSIS;
  private baseSpeed = BASE_SPEED;
  private baseJump = JUMP_SPEED;
  /**
   * Completed campaign loops. Each one replays all ten levels with everything scaled up, so
   * the game never runs out of content — the campaign is a ramp, not a wall.
   */
  private cycle = 0;
  /** Walk-speed multiplier of the level's enemy type. */
  private enemySpeedScale = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = 1.15;
    this.input = new TpsInput(canvas);
    const hudCanvas = document.querySelector<HTMLCanvasElement>('#hud-canvas');
    if (!hudCanvas) throw new Error('Missing #hud-canvas element.');
    this.hud = new CanvasHud(hudCanvas);
    this.debris = new BrickDebris(this.scene);

    // Neon only reads as neon if the emissive trim actually bleeds. OutputPass applies tone
    // mapping and the sRGB conversion, which the renderer skips when drawing to a target.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // High threshold so only genuinely emissive trim blooms — a low one turns the whole
    // pastel arena into haze. The design spec asks for "modest bloom".
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.55, 0.95);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.loop = new Loop(
      (dt) => this.update(dt),
      () => this.render(),
    );
    void this.boot(0);
  }

  private async boot(map: number): Promise<void> {
    this.ready = false;
    this.win = false;
    this.dead = false;
    this.mapAdvanceTimer = 0;

    try {
      this.clearLevel();
    } catch (err) {
      console.warn('clearLevel', err);
      this.enemies = [];
      this.pickups = [];
    }

    // Drop the freed world handle so the loop never steps a dead world.
    if (this.physics) {
      try {
        this.physics.dispose();
      } catch (err) {
        console.warn('physics.dispose', err);
      }
      this.physics = null;
    }

    this.physics = await PhysicsWorld.create(-22);
    if (!this.vfx) this.vfx = new ExplosionVfx(this.scene);
    this.combat?.dispose();
    this.combat = new CombatSystem(this.scene, this.loadout, this.vfx);
    if (this.scene.children.filter((c) => c.type === 'HemisphereLight').length === 0) {
      this.setupLights();
    }

    this.mapIndex = map;
    this.level = this.createLevel(map);
    this.scene.add(this.level.group);
    // Level names come from the chapter table, so they follow the language toggle.
    this.level.name = tr(LEVELS[map]!.name, this.lang);
    const sky = LEVELS[map]!.sky;
    this.scene.background = new THREE.Color(sky);
    this.applyGrading(map, sky);

    this.player = new BrickAgent(
      this.physics,
      PLAYER_PALETTE,
      this.level.spawnPoint.clone(),
      'player',
      100,
    );
    this.player.body.setTranslation(
      {
        x: this.level.spawnPoint.x,
        y: this.player.standHeight,
        z: this.level.spawnPoint.z,
      },
      true,
    );
    this.player.syncMesh();
    this.scene.add(this.player.group);
    this.player.setGun('pulse', '#00e5ff', '#39414f');
    this.checkpoint.set(
      this.level.spawnPoint.x,
      this.player.standHeight,
      this.level.spawnPoint.z,
    );

    this.bossSpawned = false;
    this.boss = null;
    this.pendingAdds.length = 0;
    this.climaxLeft = 0;
    this.climaxStarted = false;
    this.playerRevealAt = -1;
    this.hud.setBoss(null);
    this.buffs = { haste: 0, doubleDamage: 0, decoy: 0, scan: 0 };
    this.loadout.unlock('pulse');
    if (map >= 1) this.loadout.unlock('scatter');
    if (map >= 2) {
      this.loadout.unlock('rail');
      this.loadout.unlock('grenade');
    }
    if (map >= 3) {
      this.loadout.unlock('arc');
      this.loadout.unlock('plasma');
    }

    this.spawnWaveForOutpost(0);
    this.spawnPickupsForMap();
    /*
     * Pre-compile every shader this level will need, before the player sees it.
     *
     * Without this the first frame of each level compiles material programs on demand,
     * which showed up on every device as a handful of ~50ms frames right at the transition.
     * The scene is fully built by this point, so compiling now is exactly the work that
     * would otherwise be paid mid-gameplay.
     */
    this.vfx.warmUp(this.renderer, this.camera);
    this.renderer.compile(this.scene, this.camera);
    this.audio.startMusic(map);

    this.ready = true;
    this.advancing = false;
    this.hud.setHintVisible(true);
    this.hud.setUnlockVisible(false);
    this.syncViewport();
    this.publishDiagnostics();
  }

  /**
   * Per-level colour grade. Lighting is the single biggest lever on how a level *feels*, so
   * every one of exposure, fog depth, key tint, fill colour and bloom strength is derived
   * from the chapter rather than fixed globally.
   */
  private applyGrading(map: number, sky: string): void {
    const g = gradingFor(map);
    this.renderer.toneMappingExposure = g.exposure;
    this.scene.fog = new THREE.Fog(sky, g.fogNear, g.fogFar);
    this.bloom.strength = g.bloom;
    if (!this.hemi) return;
    this.hemi.intensity = g.hemi;
    this.key.intensity = g.key;
    this.key.color.set(g.keyColor);
    this.fill.intensity = g.fill;
    this.fill.color.set(g.fillColor);
    this.rim.color.set(LEVELS[map]!.neonB);
    this.rim.intensity = 1.2 + (map / 9) * 1.2;
  }

  private setupLights(): void {
    const hemi = new THREE.HemisphereLight('#ffffff', '#7ec8ff', 1.15);
    this.hemi = hemi;
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight('#fff7e8', 1.35);
    this.key = key;
    key.position.set(-8, 16, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    // three.js defaults the shadow ortho frustum to ±5, which covers a 10×10 patch — on a
    // 56×56 arena that means shadows are effectively switched off. Fit it to the level.
    const shadowCam = key.shadow.camera;
    shadowCam.left = -34;
    shadowCam.right = 34;
    shadowCam.top = 34;
    shadowCam.bottom = -34;
    shadowCam.near = 1;
    shadowCam.far = 90;
    shadowCam.updateProjectionMatrix();
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    const neonFill = new THREE.PointLight('#1ec8ff', 2.2, 40);
    neonFill.position.set(0, 6, 0);
    this.fill = neonFill;
    this.scene.add(neonFill);
    const pink = new THREE.PointLight('#ff2d6a', 1.6, 35);
    pink.position.set(10, 5, 8);
    this.rim = pink;
    this.scene.add(pink);
  }

  private clearLevel(): void {
    const phys = this.physics;
    for (const e of this.enemies) {
      if (phys) e.dispose(phys);
      this.scene.remove(e.group);
    }
    this.enemies = [];
    for (const p of this.pickups) {
      this.scene.remove(p.group);
      disposeObject3D(p.group);
    }
    this.pickups = [];
    if (this.player) {
      if (phys) this.player.dispose(phys);
      this.scene.remove(this.player.group);
    }
    if (this.level) {
      this.scene.remove(this.level.group);
      disposeObject3D(this.level.group);
    }
  }

  /**
   * Difficulty multiplier for the current loop.
   *
   * Deliberately compounding but gentle — +30% per cycle on health, and enemy *count* grows
   * by one per loop rather than a percentage, because a wall of bullet-sponges stops being
   * fun long before a slightly bigger crowd does.
   */
  private get difficulty(): number {
    return 1 + this.cycle * 0.3;
  }

  /** Extra bodies per wave. Capped so the arena does not turn into a mosh pit. */
  private get extraEnemies(): number {
    return Math.min(5, this.cycle);
  }

  private createLevel(map: number): LevelBuildResult {
    const phys = this.physics;
    if (!phys) throw new Error('Physics not ready');
    return buildLevel(phys, map, this.lang);
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.combat?.dispose();
    this.clearLevel();
    this.physics?.dispose();
    this.audio.dispose();
    this.debris.dispose();
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
  }

  private spawnWaveForOutpost(index: number): void {
    const phys = this.physics;
    if (!phys) return;
    for (const e of this.enemies) {
      e.dispose(phys);
      this.scene.remove(e.group);
    }
    this.enemies = [];
    this.bossSpawned = false;

    const op = this.level.outposts[index];
    if (!op) return;

    // Final outpost → Boss (+ adds)
    if (index === this.level.outposts.length - 1) {
      this.spawnBoss(op.center);
      return;
    }

    // Level index is zero-based, so the old `+ (mapIndex - 1)` scaling made level 1 spawn
    // one enemy short of the intended three.
    const count = 3 + index + Math.floor(this.mapIndex / 2) + this.extraEnemies;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const pos = new THREE.Vector3(
        op.center.x + Math.cos(ang) * (op.radius * 0.65),
        1.0,
        op.center.z + Math.sin(ang) * (op.radius * 0.65),
      );
      // Every level fields its own enemy silhouette, not a recoloured copy of level 1.
      const def = enemyForLevel(this.mapIndex);
      const shield = def.trait === 'shielded' && i % 3 === 2;
      const hp = Math.round(55 * def.hpScale * this.difficulty * (shield ? 1.25 : 1));
      this.addEnemy(
        new BrickAgent(phys, def.palette, pos, 'enemy', hp, {
          shieldTrooper: shield,
          build: def.build,
          trait: def.trait,
        }),
      );
      this.enemySpeedScale = def.speedScale;
    }

    /*
     * Air cover. Flyers orbit above the fight instead of walking into it, so they change the
     * shape of the encounter rather than adding another body to the same shooting gallery.
     * Count climbs with the level and they only appear from the second wave onward, which
     * keeps the opening of a level about the ground push.
     */
    const flyers = index === 0
      ? 0
      : Math.min(5, Math.floor(this.mapIndex / 3) + 1 + Math.floor(this.cycle / 2));
    for (let i = 0; i < flyers; i++) {
      const ang = (i / Math.max(1, flyers)) * Math.PI * 2 + 0.7;
      this.addEnemy(
        new FlyerAgent(
          phys,
          new THREE.Vector3(
            op.center.x + Math.cos(ang) * 7,
            4.2,
            op.center.z + Math.sin(ang) * 7,
          ),
        ),
      );
    }
  }

  /** Every hostile goes through here so the brick-shatter hook is never missed. */
  private addEnemy(agent: BrickAgent): void {
    agent.onDied = (a) => {
      // The bricks *are* the corpse — leaving the intact figure visible as well would
      // double-render the death. Bosses burst later, at the end of their explosion climax.
      if (a.isBoss) return;
      const airborne = a instanceof FlyerAgent;
      this.debris.burst(a.group, { force: airborne ? 7.5 : 6 });
      a.group.visible = false;
      // Salvage is what makes the brick-rebuild a mechanic rather than an animation.
      this.salvage += a.isBoss ? 5 : 1;
    };
    this.enemies.push(agent);
    this.scene.add(agent.group);
  }

  private spawnBoss(center: THREE.Vector3): void {
    const phys = this.physics;
    if (!phys) return;
    this.bossSpawned = true;

    // Every level fields its own boss, cycling if the campaign loops.
    const archetype: BossArchetype = LEVEL_BOSS[this.mapIndex % LEVEL_BOSS.length]!;
    const boss = new BossAgent(phys, archetype, new THREE.Vector3(center.x, 3.2, center.z));
    // Bosses scale hardest — they are the level's wall, so they should feel it first.
    boss.hp = Math.round(boss.hp * this.difficulty * 1.15);
    this.boss = boss;
    this.enemies.push(boss);
    this.scene.add(boss.group);

    for (let i = 0; i < 2; i++) {
      const ang = i * Math.PI;
      const pos = new THREE.Vector3(
        center.x + Math.cos(ang) * 4,
        1.0,
        center.z + Math.sin(ang) * 4,
      );
      this.addEnemy(new BrickAgent(phys, ENEMY_PALETTE, pos, 'enemy', Math.round(50 * this.difficulty)));
    }

    // Unlock a mid-tier gun when boss appears
    this.loadout.unlock('grenade');
    this.loadout.unlock('rail');
    this.audio.bossSting();
    const bossName = tr(LEVELS[this.mapIndex]!.boss, this.lang);
    this.hud.flashStatus(tr([`${bossName} incoming`, `${bossName} 出现`], this.lang));
    this.hud.setBoss({ name: bossName, hp: boss.hp, maxHp: boss.maxHp, phase: boss.phase });
  }

  private maybeStartBossClimax(): void {
    const b = this.boss;
    if (!b || this.climaxStarted || b.alive) return;
    this.climaxStarted = true;

    // Killing the boss ends the fight. Without this the outpost can never clear while a
    // summoned minion is still standing, and the player is left staring at a dead boss and
    // a level that refuses to advance.
    for (const e of this.enemies) {
      if (e === b || !e.alive) continue;
      const p = e.body.translation();
      this.vfx.spawn(new THREE.Vector3(p.x, p.y, p.z), '#ff2d6a', 1.5, 0.4);
      e.takeDamage(99999);
    }

    const t = b.body.translation();
    this.climaxAt.set(t.x, t.y, t.z);
    this.climaxLeft = 9;
    this.climaxTimer = 0;
  }

  /**
   * Staged detonation for the boss climax (§9 "neon explosion climax"). Runs on a timer so
   * the blasts escalate over ~1.3s instead of landing as a single puff.
   */
  private tickBossClimax(delta: number): void {
    if (this.climaxLeft <= 0) return;
    this.climaxTimer -= delta;
    if (this.climaxTimer > 0) return;
    const progress = 1 - this.climaxLeft / 9;
    const spread = 1.2 + progress * 2.6;
    this.vfx.spawn(
      new THREE.Vector3(
        this.climaxAt.x + (Math.random() - 0.5) * spread,
        this.climaxAt.y + 0.4 + Math.random() * 1.8,
        this.climaxAt.z + (Math.random() - 0.5) * spread,
      ),
      progress > 0.66 ? '#fff4d0' : progress > 0.33 ? '#ffb703' : '#ff2d6a',
      1.6 + progress * 3.4,
      0.5,
    );
    this.audio.explosion(1 + progress);
    this.climaxLeft -= 1;
    this.climaxTimer = 0.14;
    if (this.climaxLeft === 0) {
      this.vfx.spawn(new THREE.Vector3(this.climaxAt.x, this.climaxAt.y + 1, this.climaxAt.z), '#ffe66d', 9, 1.0);
      this.audio.explosion(2);
      // The payoff of the whole cadence: the boss finally comes apart into bricks.
      if (this.boss) this.debris.burst(this.boss.group, { force: 12, spread: 1.4 });
      this.dropBossReward(this.climaxAt);
    }
  }

  /** §9 "drop unique skin or next-map key" — a shard the player has to walk over. */
  private dropBossReward(at: THREE.Vector3): void {
    const drop = new WorldPickup('shard', new THREE.Vector3(at.x, 0, at.z));
    this.pickups.push(drop);
    this.scene.add(drop.group);
  }

  /** Boss attacks never touch hp directly — they funnel through here for consistent feedback. */
  private damagePlayer(amount: number): void {
    if (!this.player.alive || this.dead) return;
    this.player.takeDamage(amount);
    this.hud.hurt();
    this.audio.hurt();
    if (this.player.hp <= 0) {
      this.player.alive = false;
      this.dead = true;
      // The player comes apart too — respawning is the rebuild, not a teleport.
      this.debris.burst(this.player.group, { force: 6.5 });
      this.player.group.visible = false;
    }
  }

  /**
   * Push a point out of any solid it lands inside.
   *
   * Pickup positions are fixed constants, but the arena around them is generated per level —
   * mushroom stems, crate stacks and deck legs all ended up walling pickups in, which made
   * them permanently uncollectable. Same axis-aligned push-out the player uses.
   */
  private freeSpot(x: number, z: number): { x: number; z: number } {
    const r = 0.95;
    const limit = Math.max(2, this.level.halfExtent - 2);
    let px = x;
    let pz = z;
    for (let pass = 0; pass < 24; pass++) {
      let moved = false;
      for (const b of this.level.blocks) {
        // Ramps are walkable and floating slabs are above head height; neither traps a pickup.
        if (b.ramp || b.y - b.hh > 1.6) continue;
        const dx = px - b.x;
        const dz = pz - b.z;
        const ox = b.hw + r - Math.abs(dx);
        const oz = b.hd + r - Math.abs(dz);
        if (ox <= 0 || oz <= 0) continue;
        if (ox < oz) px += dx >= 0 ? ox : -ox;
        else pz += dz >= 0 ? oz : -oz;
        moved = true;
      }
      if (!moved) break;
    }
    return {
      x: THREE.MathUtils.clamp(px, -limit, limit),
      z: THREE.MathUtils.clamp(pz, -limit, limit),
    };
  }

  private spawnPickupsForMap(): void {
    const ids: PickupId[] = [
      'medkit',
      'shield',
      'haste',
      'ammo',
      'emp',
      'decoy',
      'scan',
      'doubleDamage',
    ];
    const spots = [
      new THREE.Vector3(3, 0, 12),
      new THREE.Vector3(-5, 0, 0),
      new THREE.Vector3(8, 0, -4),
      new THREE.Vector3(-10, 0, 6),
      new THREE.Vector3(0, 0, 4),
      new THREE.Vector3(5, 0, 8),
      new THREE.Vector3(-3, 0, -12),
      new THREE.Vector3(12, 0, 10),
    ];
    ids.forEach((id, i) => {
      const spot = spots[i]!;
      const free = this.freeSpot(spot.x, spot.z);
      const p = new WorldPickup(id, new THREE.Vector3(free.x, spot.y, free.z));
      this.pickups.push(p);
      this.scene.add(p.group);
    });
  }

  private update(delta: number): void {
    this.frame += 1;
    this.elapsed += delta;
    this.syncViewport();
    // Consume unconditionally so a press during loading cannot linger into a later frame.
    const restartRequested = this.input.consumeRestart();
    if (this.input.consumeDebugToggle()) this.colliderDebug.toggle();
    if (this.input.consumeMute()) this.audio.toggleMute();
    if (this.input.consumeLang()) this.toggleLang();
    if (this.input.consumeFuse()) this.tryFuse();
    if (this.input.consumeChassis()) this.rebuildPlayer();
    if (this.input.consumeJump()) this.player.jump(this.baseJump);
    const vol = this.input.consumeVolume();
    if (vol) this.hud.showVolume(this.audio.nudgeVolume(vol));
    this.tickStory(delta);
    if (!this.ready || this.advancing) {
      this.publishDiagnostics();
      return;
    }

    /*
     * Pause. Unlocking the pointer (Esc) used to freeze only the enemies while the player
     * kept walking and shooting — a half-state that read as a bug. Holding the whole
     * simulation is both simpler and what the player expects from Esc.
     */
    this.paused = !this.input.isPointerLocked && !this.dead && !this.win;
    if (this.paused) {
      this.hud.setPaused(true);
      this.publishDiagnostics();
      return;
    }
    this.hud.setPaused(false);

    this.vfx.update(delta);
    this.debris.update(delta);
    if (this.playerRevealAt > 0 && this.elapsed >= this.playerRevealAt) {
      this.playerRevealAt = -1;
      this.player.group.visible = true;
    }
    this.maybeStartBossClimax();
    this.tickBossClimax(delta);
    this.tickBuffs(delta);

    const look = this.input.consumeLook();
    if (look.dx || look.dy) {
      this.tps.addLookDelta(look.dx, look.dy);
      this.hud.setHintVisible(false);
    }
    this.placeCrosshair();

    const digit = this.input.consumeWeaponDigit();
    if (digit && this.loadout.selectByKey(digit)) this.equipGun(this.loadout.current.id);
    const cycle = this.input.consumeCycle();
    if (cycle) { this.loadout.cycle(cycle); this.equipGun(this.loadout.current.id); }

    if (this.input.consumeBuy()) this.openPurchasePage();

    if (this.input.consumeNextMap()) {
      this.tryAdvanceMap();
      if (this.advancing || !this.ready) {
        this.publishDiagnostics();
        return;
      }
    }

    if (this.dead || this.win) {
      if (restartRequested) this.restart();
      if (this.advancing || !this.ready) {
        this.publishDiagnostics();
        return;
      }
      if (this.win && this.mapAdvanceTimer > 0) {
        this.mapAdvanceTimer -= delta;
        if (this.mapAdvanceTimer <= 0) {
          this.tryAdvanceMap();
          this.publishDiagnostics();
          return;
        }
      }
      if (!this.physics) {
        this.publishDiagnostics();
        return;
      }
      try {
        this.physics.step(delta);
        this.syncAll(delta);
        this.updateCamera();
      } catch (err) {
        console.error('[win-idle]', err);
      }
      this.hudRefresh();
      this.publishDiagnostics();
      return;
    }

    this.player.updateGround();
    this.player.setWeaponColor(this.loadout.current.muzzleColor);

    const speed = this.baseSpeed * (this.buffs.haste > 0 ? 1.45 : 1);
    this.input.readMovement(this.moveScratch);
    this.tps.forwardFlat(this.forward);
    this.tps.rightFlat(this.right);
    const wish = new THREE.Vector3()
      .addScaledVector(this.right, this.moveScratch.x)
      .addScaledVector(this.forward, this.moveScratch.y);
    if (wish.lengthSq() > 1e-6) wish.normalize();
    this.player.applyMoveVelocity(wish.x * speed, wish.z * speed, speed);
    if (wish.lengthSq() > 1e-4) this.player.setYaw(Math.atan2(wish.x, wish.z));
    else this.player.setYaw(this.tps.yawRadians + Math.PI);

    this.updateEnemies(delta);
    this.combat.update(delta);

    const pt = this.player.body.translation();
    this.muzzle.set(pt.x, pt.y + 0.35, pt.z);
    this.updateCamera();
    this.aimAtCrosshair();
    const dmgMul = this.buffs.doubleDamage > 0 ? 2 : 1;
    const shot = this.combat.tryFire(
      this.physics!.world,
      this.muzzle,
      this.aimDir,
      this.player,
      this.enemies,
      this.input.consumeFire(),
      delta,
      dmgMul,
    );
    if (shot) {
      this.audio.fire(this.loadout.current.id);
      this.hud.recoil(shot.hitAgents.length ? 0.55 : 1);
      if (shot.hitAgents.length) {
        this.hud.hitmarker();
        this.audio.hit();
      }
      if (shot.shieldBreak) this.audio.shieldBreak();
      if (shot.explosionAt) this.audio.explosion(shot.explosionScale ?? 1);
    }

    this.collectPickups();
    this.physics!.step(delta);
    this.syncAll(delta);
    this.updateCamera();
    this.checkOutposts();
    this.clampBounds();
    this.hudRefresh();
    this.publishDiagnostics();
  }

  private placeCrosshair(): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = this.input.isPointerLocked
      ? rect.width * 0.5
      : THREE.MathUtils.clamp(this.input.mouse.x - rect.left, 0, rect.width);
    const y = this.input.isPointerLocked
      ? rect.height * 0.5
      : THREE.MathUtils.clamp(this.input.mouse.y - rect.top, 0, rect.height);
    this.hud.setCrosshair(x, y);
    return { x, y };
  }

  /** Shots go through the crosshair, which tracks the mouse (or screen center when locked). */
  private aimAtCrosshair(): void {
    const rect = this.canvas.getBoundingClientRect();
    const { x, y } = this.placeCrosshair();
    const ndcX = (x / Math.max(1, rect.width)) * 2 - 1;
    const ndcY = -(y / Math.max(1, rect.height)) * 2 + 1;
    const hit = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(this.camera);
    this.aimDir.copy(hit).sub(this.camera.position);
    if (this.aimDir.lengthSq() < 1e-8) {
      this.aimDir.set(0, 0, -1);
      return;
    }
    this.aimDir.normalize();
    const far = this.camera.position.clone().addScaledVector(this.aimDir, 70);
    this.aimDir.copy(far).sub(this.muzzle);
    if (this.aimDir.lengthSq() < 1e-8) this.aimDir.set(0, 0, -1);
    else this.aimDir.normalize();
  }

  private tickBuffs(delta: number): void {
    for (const k of Object.keys(this.buffs) as (keyof Buffs)[]) {
      this.buffs[k] = Math.max(0, this.buffs[k] - delta);
    }
  }

  private collectPickups(): void {
    const pt = this.player.body.translation();
    for (const p of this.pickups) {
      if (!p.active) continue;
      const d = Math.hypot(p.group.position.x - pt.x, p.group.position.z - pt.z);
      if (d > 1.2) continue;
      p.collect();
      this.applyPickup(p.def.id);
      this.audio.pickup(Math.max(0, PICKUPS.findIndex((d) => d.id === p.def.id)));
    }
    for (const p of this.pickups) p.update(1 / 60, this.elapsed);
  }

  private applyPickup(id: PickupId): void {
    switch (id) {
      case 'medkit':
        this.player.heal(40);
        break;
      case 'shield':
        this.player.addShield(50);
        break;
      case 'haste':
        this.buffs.haste = 6;
        break;
      case 'ammo':
        this.loadout.refillAmmo(0.4);
        this.loadout.unlock('arc');
        break;
      case 'emp':
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (e.hasShield) e.absorbShield(999);
          e.takeDamage(e.isBoss ? 25 : 35);
        }
        {
          const t = this.player.body.translation();
          this.vfx.spawn(new THREE.Vector3(t.x, t.y, t.z), '#c77dff', 2.5, 0.5);
        }
        break;
      case 'decoy':
        this.buffs.decoy = 5;
        break;
      case 'scan':
        this.buffs.scan = 7;
        this.loadout.unlock('plasma');
        break;
      case 'doubleDamage':
        this.buffs.doubleDamage = 5;
        break;
      case 'shard': {
        const isNew = this.unlocks.grantCosmetic();
        this.hud.flashStatus(
          isNew
            ? tr(['NEON SHARD — SKIN UNLOCKED', '霓虹碎片 — 皮肤已解锁'], this.lang)
            : tr(['NEON SHARD COLLECTED', '已收集霓虹碎片'], this.lang),
        );
        this.audio.fanfare();
        break;
      }
    }
  }

  private updateEnemies(delta: number): void {
    if (!this.input.isPointerLocked) {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (e instanceof BossAgent || e instanceof FlyerAgent) e.parkPosition();
        else e.applyMoveVelocity(0, 0, ENEMY_SPEED);
      }
      return;
    }

    const pt = this.player.body.translation();
    const decoy = this.buffs.decoy > 0;
    const ctx = this.bossContext();

    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e instanceof BossAgent) {
        e.update(delta, ctx);
        continue;
      }
      if (e instanceof FlyerAgent) {
        e.update(delta, this.flyerContext());
        continue;
      }
      e.updateGround();
      const et = e.body.translation();
      let tx = pt.x;
      let tz = pt.z;
      if (decoy) {
        tx += 8;
        tz -= 6;
      }
      const dx = tx - et.x;
      const dz = tz - et.z;
      const dist = Math.hypot(dx, dz);

      if (dist > 1.1) {
        const sp = ENEMY_SPEED * this.enemySpeedScale;
        e.applyMoveVelocity((dx / dist) * sp, (dz / dist) * sp, sp);
        e.setYaw(Math.atan2(dx, dz));
      } else {
        e.applyMoveVelocity(0, 0, ENEMY_SPEED * this.enemySpeedScale);
        if (!decoy && this.player.alive) this.damagePlayer(18 * delta);
      }
    }

    // Adds summoned mid-loop are appended afterwards so the iteration stays stable.
    if (this.pendingAdds.length) {
      for (const add of this.pendingAdds) this.addEnemy(add);
      this.pendingAdds.length = 0;
    }
  }

  private flyerContext(): FlyerContext {
    const t = this.player.body.translation();
    this.flyerFeet.set(t.x, 0, t.z);
    return {
      playerFeet: this.flyerFeet,
      vfx: this.vfx,
      audio: this.audio,
      damagePlayer: (amount) => this.damagePlayer(amount),
    };
  }

  private bossContext(): BossContext {
    return {
      player: this.player,
      vfx: this.vfx,
      audio: this.audio,
      damagePlayer: (amount) => this.damagePlayer(amount),
      // Deferred: this runs inside the `this.enemies` loop, so it must not append there.
      spawnAdd: (position, shielded) => {
        if (!this.physics) return;
        this.pendingAdds.push(
          new BrickAgent(this.physics, ENEMY_PALETTE, position, 'enemy', shielded ? 70 : 50, {
            shieldTrooper: shielded,
          }),
        );
      },
      onPhaseChange: () => {
        this.hud.flashStatus(tr(['BOSS — RAGE PHASE', 'BOSS — 狂暴阶段'], this.lang));
        this.hud.hurt();
        this.audio.rageSting();
      },
    };
  }

  private checkOutposts(): void {
    const obj = this.level.outposts.find((o) => !o.cleared);
    if (!obj) {
      this.onMapCleared();
      return;
    }
    const alive = this.enemies.filter((e) => e.alive).length;
    if (alive === 0 && !obj.cleared) {
      obj.cleared = true;
      const pt = this.player.body.translation();
      this.checkpoint.set(pt.x, 1.0, pt.z);
      // Drop weapon unlock per outpost
      const unlocks: WeaponId[] = ['scatter', 'rail', 'grenade'];
      const idx = this.level.outposts.findIndex((o) => o.id === obj.id);
      if (unlocks[idx]) this.loadout.unlock(unlocks[idx]!);

      const nextIndex = this.level.outposts.findIndex((o) => !o.cleared);
      if (nextIndex >= 0) this.spawnWaveForOutpost(nextIndex);
      else this.onMapCleared();
    }
  }

  private onMapCleared(): void {
    if (this.win || this.advancing) return;
    this.win = true;
    this.audio.fanfare();

    try {
      const t = this.player.body.translation();
      this.vfx.spawn(new THREE.Vector3(t.x, t.y + 1, t.z), '#ffe66d', 3.2, 0.8);
    } catch {
      /* body may be mid-dispose */
    }

    const next = this.mapIndex + 1;
    if (next < TOTAL_LEVELS && this.unlocks.canPlayMap(next)) {
      // Auto-advance: the player never has to press anything to continue.
      this.mapAdvanceTimer = 2.4;
      this.storyLines = [...LEVELS[next]!.narration];
      this.storyTimer = 2.4;
      this.hud.setUnlockVisible(true, tr(['LEVEL CLEAR', '关卡完成'], this.lang));
    } else if (next < TOTAL_LEVELS) {
      // Free demo ends here — levels 6-10 are the paid half.
      this.mapAdvanceTimer = 0;
      this.hud.setUnlockVisible(
        true,
        tr(
          ['DEMO COMPLETE\nFULL CAMPAIGN: 5 MORE LEVELS\nPRESS B TO PURCHASE · R TO REPLAY',
             '试玩结束\n完整战役还有 5 关\n按 B 购买 · 按 R 重玩'],
          this.lang,
        ),
      );
    } else {
      /*
       * Campaign cleared — loop instead of stopping.
       *
       * The story reframes rather than repeats: the city reassembles and you go again, which
       * is exactly what the fiction has been saying the whole time. Gameplay-wise this is a
       * New Game+ ramp, so the ten levels are a pattern to master rather than a one-off.
       */
      this.cycle += 1;
      this.mapAdvanceTimer = 3.6;
      this.storyLines = [...CAMPAIGN_END];
      this.storyTimer = 3.6;
      this.hud.setUnlockVisible(
        true,
        this.lang === 'zh'
          ? `第 ${this.cycle + 1} 轮\n城市已重新拼合\n敌人强度 +${this.cycle * 30}%`
          : `CYCLE ${this.cycle + 1}\nTHE CITY REBUILDS ITSELF\nENEMIES +${this.cycle * 30}%`,
      );
    }
  }

  /** Restart the campaign from level 1 at the current cycle's difficulty. */
  private beginNextCycle(): void {
    this.advancing = true;
    this.mapAdvanceTimer = 0;
    this.win = false;
    this.ready = false;
    this.hud.setUnlockVisible(
      true,
      this.lang === 'zh' ? `正在重建城市… 第 ${this.cycle + 1} 轮` : `REBUILDING… CYCLE ${this.cycle + 1}`,
    );
    void this.boot(0)
      .then(() => {
        this.advancing = false;
        this.hud.setUnlockVisible(false);
      })
      .catch((err) => {
        console.error('Failed to start the next cycle', err);
        this.advancing = false;
        this.ready = true;
      });
  }

  /** Advances the story-card timer and publishes the current lines to the HUD. */
  private tickStory(delta: number): void {
    if (this.storyTimer > 0) {
      this.storyTimer = Math.max(0, this.storyTimer - delta);
      if (this.storyTimer === 0) this.storyLines = [];
    }
    this.hud.setStory(
      this.storyLines.map((l) => tr(l, this.lang)),
      this.storyLines.length ? (this.storyTimer > 3 ? 1 : this.storyTimer / 3) : 0,
    );
  }

  /**
   * Break two weapons down and rebuild them as one.
   *
   * The visual is the point: the held gun bursts into bricks, the bricks stream across to
   * the new weapon's position, and the fused gun appears where they land. Reusing the same
   * debris system as the character deaths is what makes fusion read as part of the same
   * brick world instead of a menu action.
   */
  private tryFuse(): void {
    if (!this.ready || this.advancing || this.dead) return;
    const combo = this.loadout.fusablePair();
    if (!combo) {
      this.hud.flashStatus(
        tr(['NO FUSION RECIPE FOR YOUR CURRENT GUNS', '当前两把武器没有合成配方'], this.lang),
      );
      return;
    }

    const pt = this.player.body.translation();
    const at = new THREE.Vector3(pt.x, pt.y - this.player.standHeight, pt.z);

    // The parts shatter where the player stands, then the result reassembles.
    this.debris.burst(this.player.group, { force: 5.5, spread: 0.7 });
    this.player.group.visible = false;
    this.playerRevealAt = this.elapsed + 0.6;
    this.debris.burst(this.player.group, { inward: true });

    this.loadout.fuse(combo);
    this.equipGun(combo.id);
    this.audio.fanfare();
    this.audio.explosion(1.1);
    this.vfx.spawn(new THREE.Vector3(at.x, at.y + 1, at.z), combo.muzzleColor, 4.2, 0.7);

    const name = this.lang === 'zh' ? combo.nameZh : combo.name;
    const blurb = tr(combo.blurb, this.lang);
    this.hud.flashStatus(
      tr([`FUSED: ${name}`, `已合成：${name}`], this.lang),
    );
    this.hud.setUnlockVisible(
      true,
      this.lang === 'zh' ? `已合成\n${name}\n${blurb}` : `WEAPONS FUSED\n${name}\n${blurb}`,
    );
    window.setTimeout(() => this.hud.setUnlockVisible(false), 2600);
  }

  /**
   * Rebuild the player as the next chassis they have salvaged enough for.
   *
   * The figure is shattered, a new one is constructed with different proportions, and the
   * bricks converge on it — the same beat as respawning, which is the point: in this world
   * changing what you are is the same operation as coming back.
   */
  private rebuildPlayer(): void {
    if (!this.ready || this.advancing || this.dead) return;
    const earned = unlockedChassis(this.salvage);
    const next = earned.find((c) => CHASSIS.findIndex((x) => x.id === c.id) > CHASSIS.findIndex((x) => x.id === this.chassis));
    if (!next) {
      const nxt = nextChassis(this.salvage);
      this.hud.flashStatus(
        nxt
          ? tr(
              [`NEED ${nxt.remaining} MORE SALVAGE FOR ${nxt.def.name[0].toUpperCase()}`,
               `还需 ${nxt.remaining} 个废料才能重建成 ${nxt.def.name[1]}`],
              this.lang,
            )
          : tr(['NO FURTHER CHASSIS', '已无可重建的机体'], this.lang),
      );
      return;
    }

    const t = this.player.body.translation();
    const at = new THREE.Vector3(t.x, t.y, t.z);
    this.debris.burst(this.player.group, { force: 5.5, spread: 0.7 });
    this.player.group.visible = false;

    // Swap the figure in place: same body, same position, new build and palette.
    const old = this.player;
    const rebuilt = new BrickAgent(
      this.physics!,
      next.palette,
      new THREE.Vector3(t.x, t.y, t.z),
      'player',
      next.maxHp,
      { build: next.build },
    );
    rebuilt.body.setTranslation({ x: t.x, y: t.y, z: t.z }, true);
    rebuilt.syncMesh();
    rebuilt.group.visible = false;
    this.scene.add(rebuilt.group);
    old.dispose(this.physics!);
    this.scene.remove(old.group);
    this.player = rebuilt;

    this.chassis = next.id;
    this.baseSpeed = BASE_SPEED * next.speed;
    this.baseJump = JUMP_SPEED * next.jump;
    this.equipGun(this.loadout.current.id);

    this.debris.burst(rebuilt.group, { inward: true });
    this.playerRevealAt = this.elapsed + 0.6;
    this.audio.fanfare();
    this.vfx.spawn(new THREE.Vector3(at.x, at.y + 1, at.z), next.palette.accent, 4, 0.7);
    const label = this.lang === 'zh' ? next.name[1] : next.name[0];
    this.hud.flashStatus(tr([`REBUILT: ${label}`, `已重建成：${label}`], this.lang));
    this.hud.setUnlockVisible(
      true,
      this.lang === 'zh'
        ? `机体重建\n${next.name[1]}\n${next.blurb[1]}`
        : `CHASSIS REBUILT\n${next.name[0]}\n${next.blurb[0]}`,
    );
    window.setTimeout(() => this.hud.setUnlockVisible(false), 2600);
  }

  /** Give the player's figure the visible gun for a weapon. */
  private equipGun(id: WeaponId): void {
    const w = this.loadout.current;
    this.player.setGun(id, w?.muzzleColor ?? '#00e5ff', '#39414f');
  }

  /** Language toggle — also rebuilds the level so objective labels follow. */
  private toggleLang(): void {
    this.lang = this.lang === 'en' ? 'zh' : 'en';
    this.hud.setLang(this.lang);
    // Keep the document language in step for screen readers and browser translation.
    document.documentElement.lang = this.lang === 'zh' ? 'zh-CN' : 'en';
    this.hud.flashStatus(this.lang === 'zh' ? '语言：中文' : 'LANGUAGE: ENGLISH');
    if (this.level) {
      const chapter = LEVELS[this.mapIndex]!;
      // The level name and every objective label are display text, so they follow the toggle.
      this.level.name = tr(chapter.name, this.lang);
      for (const o of this.level.outposts) {
        const idx = ['A', 'B', 'C'].indexOf(o.id);
        if (idx >= 0) o.label = tr(chapter.outposts[idx]!, this.lang);
      }
    }
    this.hud.setBoss(
      this.boss?.alive
        ? {
            name: tr(LEVELS[this.mapIndex]!.boss, this.lang),
            hp: this.boss.hp,
            maxHp: this.boss.maxHp,
            phase: this.boss.phase,
          }
        : null,
    );
  }

  /** itch.io has no client-side ownership check — the purchase happens on the itch page. */
  private openPurchasePage(): void {
    window.open(PURCHASE_URL, '_blank', 'noopener,noreferrer');
  }

  private tryAdvanceMap(): void {
    if (this.advancing) return;
    // Allow advance when cleared (win) — map 1→2 and 2→3.
    if (!this.win) return;
    // Past the last level, the loop restarts from the first with the new difficulty.
    if (this.mapIndex + 1 >= TOTAL_LEVELS) {
      this.beginNextCycle();
      return;
    }
    const next = this.mapIndex + 1;
    if (!this.unlocks.canPlayMap(next)) return;

    this.advancing = true;
    this.mapAdvanceTimer = 0;
    this.win = false;
    this.ready = false;
    this.hud.setUnlockVisible(true, `Loading Map ${next}…`);

    void this.boot(next)
      .then(() => {
        this.advancing = false;
        this.hud.setUnlockVisible(false);
      })
      .catch((err) => {
        console.error('Failed to load next map', err);
        this.advancing = false;
        this.ready = true;
        this.hud.setUnlockVisible(true, `Failed to load Map ${next}. Press R or N to retry.`);
      });
  }

  /**
   * Keep the player inside the arena and out of solids — horizontally only.
   * Vertical motion is left to Rapier so elevated geometry is actually walkable.
   */
  private clampBounds(): void {
    if (!this.physics || !this.player) return;
    const limit = this.level.halfExtent - 1.5;
    const t = this.player.body.translation();
    let x = t.x;
    let z = t.z;

    // Exact push-out against the arena's axis-aligned solids. Unlike the old 0.6m raycast
    // probe this also recovers a capsule that has ended up deep inside a building.
    const r = CAPSULE_RADIUS;
    const half = CAPSULE_HALF;
    const feet = t.y - half - r;
    for (const b of this.level.blocks) {
      // Ramps are sloped; this solver is axis-aligned and would read one as a wall.
      if (b.ramp) continue;
      // 0.06 slack so a capsule resting on top of a solid is not ejected sideways.
      if (t.y + half + r <= b.y - b.hh + 0.06 || feet >= b.y + b.hh - 0.06) continue;
      const dx = x - b.x;
      const dz = z - b.z;
      const overlapX = b.hw + r - Math.abs(dx);
      const overlapZ = b.hd + r - Math.abs(dz);
      if (overlapX <= 0.01 || overlapZ <= 0.01) continue;
      if (overlapX < overlapZ) x += dx >= 0 ? overlapX : -overlapX;
      else z += dz >= 0 ? overlapZ : -overlapZ;
    }

    x = THREE.MathUtils.clamp(x, -limit, limit);
    z = THREE.MathUtils.clamp(z, -limit, limit);

    if (Math.abs(t.x - x) > 1e-4 || Math.abs(t.z - z) > 1e-4) {
      this.player.body.setTranslation({ x, y: t.y, z }, true);
    }

    // Safety net: a fall through the world must never become a permanent softlock.
    if (t.y < -6) {
      this.player.respawn(this.checkpoint.x, this.checkpoint.y, this.checkpoint.z);
    }
  }

  private syncAll(delta: number): void {
    if (this.player?.alive !== undefined) {
      try {
        this.player.syncMesh();
        this.player.animate(delta);
      } catch {
        /* body disposed mid-boot */
      }
    }
    for (const e of this.enemies) {
      try {
        e.syncMesh();
        e.animate(delta);
      } catch {
        /* ignore disposed */
      }
    }
  }

  private updateCamera(): void {
    if (!this.physics || !this.player) return;
    const t = this.player.body.translation();
    // Feet on the ground plane for orbit pivot math.
    const pos = new THREE.Vector3(t.x, t.y - this.player.standHeight, t.z);
    const col = this.player.body.collider(0) ?? undefined;
    this.tps.update(pos, this.physics.world, col ?? undefined);
  }

  private hudRefresh(): void {
    const obj = this.level.outposts.find((o) => !o.cleared);
    const boss = this.boss;
    if (boss && boss.alive) {
      this.hud.setBoss({ name: boss.displayName, hp: boss.hp, maxHp: boss.maxHp, phase: boss.phase });
    } else {
      this.hud.setBoss(null);
    }

    let status = this.bossSpawned
      ? tr(['Defeat the Boss', '击败首领'], this.lang)
      : tr(['Clear the outpost', '清空据点'], this.lang);
    if (boss?.alive) {
      status = boss.phase === 2
        ? tr(['RAGE PHASE', '狂暴阶段'], this.lang)
        : tr(['Aim for the glowing core', '瞄准发光核心'], this.lang);
    }
    if (this.buffs.doubleDamage > 0) status += tr([' · OVERCHARGE', ' · 过载'], this.lang);
    if (this.buffs.haste > 0) status += tr([' · HASTE', ' · 加速'], this.lang);
    if (this.dead) status = tr(['Downed — press R to respawn', '已倒地 — 按 R 复活'], this.lang);
    if (this.win) status = tr([`${this.level.name} secured`, `${this.level.name} 已占领`], this.lang);

    const w = this.loadout.current;
    const ammo = this.loadout.ammoLeft();
    const chargeRatio =
      w.mode === 'rail' && this.loadout.charging
        ? Math.min(1, this.loadout.railCharge / (w.chargeTime ?? 0.55))
        : null;

    this.hud.update({
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      shield: this.player.shieldHp,
      weaponName: this.lang === 'zh' ? w.nameZh : w.name,
      ammoText: ammo === 'inf' ? '∞' : String(ammo),
      chargeRatio,
      objective: obj
        ? tr([`Outpost ${obj.id}: ${obj.label}`, `据点 ${obj.id}：${obj.label}`], this.lang)
        : tr(['Mission complete', '任务完成'], this.lang),
      status,
      enemiesLeft: this.enemies.filter((e) => e.alive).length,
      mapName: this.level.name,
      cycleLabel: this.cycle > 0
        ? (this.lang === 'zh' ? `第 ${this.cycle + 1} 轮` : `CYCLE ${this.cycle + 1}`)
        : '',
      unlockedKeys: this.loadout.unlockedKeys,
      currentKey: w.keyIndex,
    });
  }

  private restart(): void {
    if (this.win) {
      // Level already cleared: never respawn a wave here, that cancels the advance.
      const next = this.mapIndex + 1;
      if (next >= TOTAL_LEVELS) this.beginNextCycle();
      else if (!this.unlocks.canPlayMap(next)) void this.boot(0);
      else this.tryAdvanceMap();
      return;
    }
    this.dead = false;
    this.hud.setUnlockVisible(false);
    this.player.respawn(this.checkpoint.x, this.checkpoint.y, this.checkpoint.z);
    // Bricks converge on the spawn point, then the figure reappears.
    this.player.group.visible = false;
    this.debris.burst(this.player.group, { inward: true });
    this.playerRevealAt = this.elapsed + 0.55;
    const idx = this.level.outposts.findIndex((o) => !o.cleared);
    this.spawnWaveForOutpost(idx < 0 ? 0 : idx);
  }

  /** Keep the renderer, the post chain and the HUD canvas all in step with the viewport. */
  private syncViewport(): void {
    resizeRenderer(this.renderer, this.camera, 2);
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w !== this.viewW || h !== this.viewH) {
      this.viewW = w;
      this.viewH = h;
      this.composer.setSize(w, h);
    }
    this.hud.resize(
      this.canvas.clientWidth,
      this.canvas.clientHeight,
      Math.min(window.devicePixelRatio || 1, 2),
    );
  }

  private render(): void {
    if (this.physics && this.colliderDebug.enabled) this.colliderDebug.update(this.physics.world);
    this.composer.render();
    this.hud.render();
  }

  /** QA / automation hooks */
  debugForceClear(): void {
    for (const o of this.level.outposts) o.cleared = true;
    for (const e of this.enemies) {
      if (e.alive) e.takeDamage(9999);
    }
    this.onMapCleared();
  }

  debugFireTracer(missile = false): void {
    const pt = this.player.body.translation();
    const from = new THREE.Vector3(pt.x, pt.y + 0.55, pt.z);
    this.camera.getWorldDirection(this.aimDir);
    if (this.aimDir.lengthSq() < 1e-6) this.aimDir.set(0, 0, -1);
    else this.aimDir.normalize();
    const to = from.clone().addScaledVector(this.aimDir, missile ? 22 : 16);
    const color = missile ? '#ff9f43' : this.loadout.current.muzzleColor;
    this.vfx.beam(from, to, color, 0.28, 1.2, missile);
    if (missile) this.vfx.spawn(to, color, 2.8, 0.6);
  }

  get debugState() {
    return {
      mapIndex: this.mapIndex,
      win: this.win,
      ready: this.ready,
      mapAdvanceTimer: this.mapAdvanceTimer,
      cleared: this.level?.outposts.filter((o) => o.cleared).length ?? 0,
      outposts: this.level?.outposts.length ?? 0,
      enemiesAlive: this.enemies.filter((e) => e.alive).length,
    };
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    let pos = { x: 0, y: 0, z: 0 };
    try {
      const t = this.player?.body.translation();
      if (t) pos = { x: t.x, y: t.y, z: t.z };
    } catch {
      /* disposed */
    }
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.elapsed,
      score: this.level?.outposts.filter((o) => o.cleared).length ?? 0,
      targetScore: 3,
      complete: this.win,
      mapIndex: this.mapIndex,
      ready: this.ready,
      mapAdvanceTimer: this.mapAdvanceTimer,
      player: {
        position: pos,
        speed: 0,
      },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      },
    };
  }
}
