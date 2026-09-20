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
import { BossAgent, type BossArchetype, type BossContext } from '../entities/BossAgent';
import { ENEMY_PALETTE, PLAYER_PALETTE } from '../entities/BrickCharacter';
import { WorldPickup } from '../entities/WorldPickup';
import type { LevelBuildResult } from '../levels/LevelFactory';
import { createMap1, createMap2, createMap3 } from '../levels/Maps';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { disposeObject3D } from '../utils/dispose';
import { CombatSystem } from '../systems/CombatSystem';
import { ExplosionVfx } from '../systems/ExplosionVfx';
import { CanvasHud } from '../systems/CanvasHud';
import { ColliderDebug } from '../systems/ColliderDebug';
import { AudioSystem } from '../systems/AudioSystem';
import { TpsCamera } from '../systems/TpsCamera';
import { WeaponLoadout } from '../systems/WeaponLoadout';
import { PICKUPS, type PickupId } from '../data/pickups';
import type { WeaponId } from '../data/weapons';

const BASE_SPEED = 7.2;
const ENEMY_SPEED = 3.4;

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
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.12, 140);
  private readonly composer: EffectComposer;
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
  private mapIndex: 1 | 2 | 3 = 1;
  private bossSpawned = false;
  private buffs: Buffs = { haste: 0, doubleDamage: 0, decoy: 0, scan: 0 };
  private mapAdvanceTimer = 0;
  private advancing = false;
  private viewW = 0;
  private viewH = 0;
  private boss: BossAgent | null = null;
  private readonly pendingAdds: BrickAgent[] = [];
  private readonly climaxAt = new THREE.Vector3();
  private climaxLeft = 0;
  private climaxTimer = 0;
  private climaxStarted = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = 1.15;
    this.input = new TpsInput(canvas);
    const hudCanvas = document.querySelector<HTMLCanvasElement>('#hud-canvas');
    if (!hudCanvas) throw new Error('Missing #hud-canvas element.');
    this.hud = new CanvasHud(hudCanvas);

    // Neon only reads as neon if the emissive trim actually bleeds. OutputPass applies tone
    // mapping and the sRGB conversion, which the renderer skips when drawing to a target.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // High threshold so only genuinely emissive trim blooms — a low one turns the whole
    // pastel arena into haze. The design spec asks for "modest bloom".
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.55, 0.95));
    this.composer.addPass(new OutputPass());

    this.loop = new Loop(
      (dt) => this.update(dt),
      () => this.render(),
    );
    void this.boot(1);
  }

  private async boot(map: 1 | 2 | 3): Promise<void> {
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
    const sky = map === 3 ? '#ffb7c8' : map === 2 ? '#d7c2ff' : '#6eb6ea';
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(sky, 48, 110);

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
    this.vfx.warmUp(this.renderer, this.camera);

    this.ready = true;
    this.advancing = false;
    this.hud.setHintVisible(true);
    this.hud.setUnlockVisible(false);
    this.syncViewport();
    this.publishDiagnostics();
  }

  private setupLights(): void {
    const hemi = new THREE.HemisphereLight('#ffffff', '#7ec8ff', 1.15);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight('#fff7e8', 1.35);
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
    this.scene.add(neonFill);
    const pink = new THREE.PointLight('#ff2d6a', 1.6, 35);
    pink.position.set(10, 5, 8);
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

  private createLevel(map: 1 | 2 | 3): LevelBuildResult {
    const phys = this.physics;
    if (!phys) throw new Error('Physics not ready');
    if (map === 2) return createMap2(phys);
    if (map === 3) return createMap3(phys);
    return createMap1(phys);
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

    const count = 3 + index + (this.mapIndex - 1);
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const pos = new THREE.Vector3(
        op.center.x + Math.cos(ang) * (op.radius * 0.65),
        1.0,
        op.center.z + Math.sin(ang) * (op.radius * 0.65),
      );
      const shield = i % 3 === 2;
      const enemy = new BrickAgent(phys, ENEMY_PALETTE, pos, 'enemy', shield ? 70 : 55, {
        shieldTrooper: shield,
      });
      this.enemies.push(enemy);
      this.scene.add(enemy.group);
    }
  }

  private spawnBoss(center: THREE.Vector3): void {
    const phys = this.physics;
    if (!phys) return;
    this.bossSpawned = true;

    const archetype: BossArchetype =
      this.mapIndex === 1 ? 'loader' : this.mapIndex === 2 ? 'carrier' : 'guardian';
    const boss = new BossAgent(phys, archetype, new THREE.Vector3(center.x, 3.2, center.z));
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
      const add = new BrickAgent(phys, ENEMY_PALETTE, pos, 'enemy', 50);
      this.enemies.push(add);
      this.scene.add(add.group);
    }

    // Unlock a mid-tier gun when boss appears
    this.loadout.unlock('grenade');
    this.loadout.unlock('rail');
    this.hud.setBoss({ name: boss.displayName, hp: boss.hp, maxHp: boss.maxHp, phase: boss.phase });
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
    }
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
      const p = new WorldPickup(id, spots[i]!.clone());
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
    if (!this.ready || this.advancing) {
      this.publishDiagnostics();
      return;
    }

    this.vfx.update(delta);
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
    if (digit) this.loadout.selectByKey(digit);
    const cycle = this.input.consumeCycle();
    if (cycle) this.loadout.cycle(cycle);

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
        this.syncAll();
        this.updateCamera();
      } catch (err) {
        console.error('[win-idle]', err);
      }
      this.hudRefresh();
      this.publishDiagnostics();
      return;
    }

    this.player.setWeaponColor(this.loadout.current.muzzleColor);

    const speed = BASE_SPEED * (this.buffs.haste > 0 ? 1.45 : 1);
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
      if (shot.explosionAt) this.audio.explosion(shot.explosionScale ?? 1);
    }

    this.collectPickups();
    this.physics!.step(delta);
    this.syncAll();
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
        this.loadout.refillAmmo(30);
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
        this.hud.flashStatus(isNew ? 'Neon shard — skin unlocked' : 'Neon shard collected');
        this.audio.fanfare();
        break;
      }
    }
  }

  private updateEnemies(delta: number): void {
    if (!this.input.isPointerLocked) {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (e instanceof BossAgent) e.parkPosition();
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
        e.applyMoveVelocity((dx / dist) * ENEMY_SPEED, (dz / dist) * ENEMY_SPEED, ENEMY_SPEED);
        e.setYaw(Math.atan2(dx, dz));
      } else {
        e.applyMoveVelocity(0, 0, ENEMY_SPEED);
        if (!decoy && this.player.alive) this.damagePlayer(18 * delta);
      }
    }

    // Adds summoned mid-loop are appended afterwards so the iteration stays stable.
    if (this.pendingAdds.length) {
      for (const add of this.pendingAdds) {
        this.enemies.push(add);
        this.scene.add(add.group);
      }
      this.pendingAdds.length = 0;
    }
  }

  private bossContext(): BossContext {
    return {
      player: this.player,
      vfx: this.vfx,
      audio: this.audio,
      damagePlayer: (amount) => this.damagePlayer(amount),
      spawnAdd: (position, shielded) => {
        if (!this.physics) return;
        this.pendingAdds.push(
          new BrickAgent(this.physics, ENEMY_PALETTE, position, 'enemy', shielded ? 70 : 50, {
            shieldTrooper: shielded,
          }),
        );
      },
      onPhaseChange: () => {
        this.hud.flashStatus(`${this.boss?.displayName ?? 'Boss'} — RAGE PHASE`);
        this.hud.hurt();
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

    const next = (this.mapIndex + 1) as 1 | 2 | 3;
    if (this.mapIndex < 3 && this.unlocks.canPlayMap(next)) {
      // Advance almost immediately; Enter/N still works.
      this.mapAdvanceTimer = 0.2;
      this.hud.setUnlockVisible(true, `${this.level.name} cleared\nLoading Map ${next}…`);
    } else if (this.mapIndex < 3) {
      // The free demo ends here — maps 2-3 are the paid product.
      this.mapAdvanceTimer = 0;
      this.hud.setUnlockVisible(
        true,
        'Demo complete\nFull campaign: maps 2-3\nPress B to purchase · R to replay',
      );
    } else {
      this.mapAdvanceTimer = 0;
      this.hud.setUnlockVisible(true, 'Campaign complete\nPress R to replay from Map 1');
    }
  }

  /** itch.io has no client-side ownership check — the purchase happens on the itch page. */
  private openPurchasePage(): void {
    window.open(PURCHASE_URL, '_blank', 'noopener,noreferrer');
  }

  private tryAdvanceMap(): void {
    if (this.advancing) return;
    // Allow advance when cleared (win) — map 1→2 and 2→3.
    if (!this.win) return;
    const next = (this.mapIndex + 1) as 1 | 2 | 3;
    if (next > 3) return;
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
    for (const b of this.level.blocks) {
      // 0.06 slack so a capsule resting on top of a solid is not ejected sideways.
      if (t.y + half + r <= b.y - b.hh + 0.06 || t.y - half - r >= b.y + b.hh - 0.06) continue;
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

  private syncAll(): void {
    if (this.player?.alive !== undefined) {
      try {
        this.player.syncMesh();
      } catch {
        /* body disposed mid-boot */
      }
    }
    for (const e of this.enemies) {
      try {
        e.syncMesh();
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

    let status = this.bossSpawned ? 'Defeat the Boss' : 'Clear the outpost';
    if (boss?.alive) {
      status = boss.phase === 2 ? 'RAGE PHASE' : 'Aim for the glowing core';
    }
    if (this.buffs.doubleDamage > 0) status += ' · OVERCHARGE';
    if (this.buffs.haste > 0) status += ' · HASTE';
    if (this.dead) status = 'Downed — press R to respawn';
    if (this.win) status = `${this.level.name} secured`;

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
      weaponName: w.name,
      ammoText: ammo === 'inf' ? '∞' : String(ammo),
      chargeRatio,
      objective: obj ? `Outpost ${obj.id}: ${obj.label}` : 'Mission complete',
      status,
      enemiesLeft: this.enemies.filter((e) => e.alive).length,
      mapName: this.level.name,
      unlockedKeys: this.loadout.unlockedKeys,
      currentKey: w.keyIndex,
    });
  }

  private restart(): void {
    if (this.win) {
      // Level already cleared: never respawn a wave here, that cancels the advance.
      const next = (this.mapIndex + 1) as 1 | 2 | 3;
      if (this.mapIndex >= 3 || !this.unlocks.canPlayMap(next)) void this.boot(1);
      else this.tryAdvanceMap();
      return;
    }
    this.dead = false;
    this.hud.setUnlockVisible(false);
    this.player.respawn(this.checkpoint.x, this.checkpoint.y, this.checkpoint.z);
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
