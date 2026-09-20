import * as THREE from 'three';

type Burst = {
  mesh: THREE.Mesh;
  light: THREE.PointLight;
  ring: THREE.Mesh;
  shards: THREE.Mesh[];
  shardVel: THREE.Vector3[];
  life: number;
  maxLife: number;
  scale: number;
};

type Flyer = {
  root: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  speed: number;
  life: number;
  flames: THREE.Mesh[];
  /** Materials that take the firing weapon's colour, so each gun traces differently. */
  tint: THREE.MeshBasicMaterial[];
  missile: boolean;
};

/**
 * Colourful solid tracers + bullet/missile silhouettes.
 * No additive white bloom (that reads as smoke).
 *
 * Both bursts and projectiles are pooled. Building a mesh, a geometry and a material per
 * shot not only churns the GPU, it also makes three.js compile a fresh shader program on
 * the first shot of a burst — which showed up as a ~150ms freeze mid-firefight.
 */
export class ExplosionVfx {
  private readonly bursts: Burst[] = [];
  private readonly pool: Burst[] = [];
  private readonly flyers: Flyer[] = [];
  private readonly flyerPools: { round: Flyer[]; missile: Flyer[] } = { round: [], missile: [] };
  private readonly streaks: { meshes: THREE.Object3D[]; life: number; maxLife: number }[] = [];

  constructor(private readonly scene: THREE.Scene) {
    for (let i = 0; i < 20; i++) this.pool.push(this.makeBurst());
    for (let i = 0; i < 12; i++) this.flyerPools.round.push(this.makeFlyer(false));
    for (let i = 0; i < 5; i++) this.flyerPools.missile.push(this.makeFlyer(true));
  }

  /**
   * Pre-compile every pooled material. Without this, the very first shot of a session
   * stalls while three.js builds the flyer's shader program.
   */
  warmUp(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const hidden: THREE.Object3D[] = [];
    const show = (o: THREE.Object3D) => {
      if (!o.visible) {
        o.visible = true;
        hidden.push(o);
      }
    };
    for (const b of this.pool) {
      show(b.mesh);
      show(b.ring);
      for (const s of b.shards) show(s);
    }
    for (const f of [...this.flyerPools.round, ...this.flyerPools.missile]) show(f.root);
    renderer.compile(this.scene, camera);
    for (const o of hidden) o.visible = false;
  }

  private solidMat(color: THREE.ColorRepresentation, opacity = 1): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
    });
  }

  private makeBurst(): Burst {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), this.solidMat('#ff9f43'));
    mesh.visible = false;
    const light = new THREE.PointLight('#ff6b35', 0, 26);
    light.visible = false;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.95, 28),
      new THREE.MeshBasicMaterial({
        color: '#ffe66d',
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;

    const shards: THREE.Mesh[] = [];
    const shardVel: THREE.Vector3[] = [];
    const palette = ['#ff2d6a', '#ffe66d', '#7df9ff', '#54f0a8', '#c77dff', '#ff9f43'];
    for (let i = 0; i < 14; i++) {
      const shard = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.5 + Math.random() * 0.4),
        this.solidMat(palette[i % palette.length]!),
      );
      shard.visible = false;
      this.scene.add(shard);
      shards.push(shard);
      shardVel.push(new THREE.Vector3());
    }

    this.scene.add(mesh);
    this.scene.add(light);
    this.scene.add(ring);
    return { mesh, light, ring, shards, shardVel, life: 0, maxLife: 0.45, scale: 1 };
  }

  spawn(position: THREE.Vector3, color = '#ff9f43', scale = 1, duration = 0.5): void {
    const burst = this.pool.pop() ?? this.makeBurst();
    (burst.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    (burst.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
    burst.light.color.set(color);
    burst.mesh.position.copy(position);
    burst.light.position.copy(position);
    burst.mesh.scale.setScalar(0.75 * scale);
    burst.mesh.visible = true;
    burst.light.visible = true;
    burst.light.intensity = 20 * scale;
    (burst.ring.material as THREE.MeshBasicMaterial).color.set(color);
    (burst.ring.material as THREE.MeshBasicMaterial).opacity = 1;
    burst.ring.position.set(position.x, 0.1, position.z);
    burst.ring.scale.setScalar(scale);
    burst.ring.visible = true;

    for (let i = 0; i < burst.shards.length; i++) {
      const shard = burst.shards[i]!;
      const ang = (i / burst.shards.length) * Math.PI * 2;
      shard.position.copy(position);
      shard.rotation.set(Math.random() * 3, ang, Math.random() * 3);
      shard.scale.setScalar(0.9 + Math.random() * 0.6);
      (shard.material as THREE.MeshBasicMaterial).color.set(color);
      (shard.material as THREE.MeshBasicMaterial).opacity = 1;
      const sp = (8 + Math.random() * 12) * scale;
      burst.shardVel[i]!.set(Math.cos(ang) * sp, (0.5 + Math.random()) * sp, Math.sin(ang) * sp);
      shard.visible = true;
    }

    burst.life = duration;
    burst.maxLife = duration;
    burst.scale = scale;
    this.bursts.push(burst);
  }

  private metal(color: THREE.ColorRepresentation, roughness = 0.32): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      metalness: 0.82,
      roughness,
    });
  }

  /**
   * Flying projectile only — no full-path light beam.
   * missile=false → brass rifle round + short tracer.
   * missile=true → metal rocket, fins, orange exhaust.
   */
  beam(
    from: THREE.Vector3,
    to: THREE.Vector3,
    color = '#ff9f43',
    _radius = 0.12,
    _duration = 0.4,
    missile = false,
  ): void {
    const len = Math.max(1, to.clone().sub(from).length());
    this.spawnFlyer(from, to, missile, color, len);
  }

  private makeFlyer(missile: boolean): Flyer {
    const root = new THREE.Group();
    const flames: THREE.Mesh[] = [];
    const tint: THREE.MeshBasicMaterial[] = [];

    if (missile) {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.45, 14), this.metal('#6d7580', 0.38));
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.52, 14), this.metal('#3e4650', 0.45));
      nose.position.y = 0.92;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.07, 14), this.metal('#d4a017', 0.4));
      band.position.y = 0.22;
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.05, 14), this.metal('#8b1e1e', 0.5));
      stripe.position.y = -0.18;
      root.add(body, nose, band, stripe);
      for (let i = 0; i < 4; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.42), this.metal('#4a515a', 0.45));
        const a = (i / 4) * Math.PI * 2;
        fin.position.set(Math.cos(a) * 0.22, -0.62, Math.sin(a) * 0.22);
        fin.rotation.y = a;
        root.add(fin);
      }
      const flameSpec = [
        { r: 0.07, h: 0.22, y: -0.95, color: '#fff4d0' },
        { r: 0.11, h: 0.38, y: -1.18, color: '#ffb000' },
        { r: 0.16, h: 0.55, y: -1.48, color: '#ff5a00' },
      ];
      for (const spec of flameSpec) {
        const flame = new THREE.Mesh(
          new THREE.ConeGeometry(spec.r, spec.h, 10),
          this.solidMat(spec.color),
        );
        flame.rotation.x = Math.PI;
        flame.position.y = spec.y;
        flames.push(flame);
        root.add(flame);
        tint.push(flame.material as THREE.MeshBasicMaterial);
      }
      const exhaust = new THREE.PointLight('#ff7a18', 6, 7);
      exhaust.position.y = -1.2;
      root.add(exhaust);
    } else {
      const jacketMat = this.metal('#c47a32', 0.22);
      jacketMat.emissive.set('#5a2a08');
      jacketMat.emissiveIntensity = 0.25;
      const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.48, 12), jacketMat);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 12), this.metal('#8d5524', 0.25));
      tip.position.y = 0.32;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.05, 0.12, 12), this.metal('#e0b84a', 0.3));
      base.position.y = -0.28;
      // The tracer carries the weapon's colour — this is what makes six guns read differently.
      const tracer = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.008, 1.15, 8),
        this.solidMat('#ff5a00'),
      );
      tracer.position.y = -0.9;
      flames.push(tracer);
      tint.push(tracer.material as THREE.MeshBasicMaterial);
      root.add(jacket, tip, base, tracer);
      root.scale.setScalar(2.4);
    }

    root.visible = false;
    this.scene.add(root);
    return {
      root,
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      t: 0,
      speed: 1,
      life: 0,
      flames,
      tint,
      missile,
    };
  }

  private spawnFlyer(
    from: THREE.Vector3,
    to: THREE.Vector3,
    missile: boolean,
    color: string,
    pathLen: number,
  ): void {
    const kind = missile ? 'missile' : 'round';
    const flyer = this.flyerPools[kind].pop() ?? this.makeFlyer(missile);

    for (const mat of flyer.tint) mat.color.set(color);

    const dir = to.clone().sub(from).normalize();
    flyer.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    flyer.root.position.copy(from);
    flyer.root.visible = true;
    flyer.from.copy(from);
    flyer.to.copy(to);
    flyer.t = 0;

    const travel = missile
      ? Math.min(0.62, 0.32 + pathLen * 0.01)
      : Math.min(0.2, 0.09 + pathLen * 0.0035);
    flyer.speed = 1 / travel;
    flyer.life = travel + 0.04;
    this.flyers.push(flyer);
  }

  update(delta: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!;
      b.life -= delta;
      const t = 1 - Math.max(0, b.life) / b.maxLife;
      b.mesh.scale.setScalar((0.8 + t * 4) * b.scale);
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t);
      b.light.intensity = (1 - t) * 20 * b.scale;
      b.ring.scale.setScalar((1 + t * 10) * b.scale);
      (b.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t);
      for (let s = 0; s < b.shards.length; s++) {
        const shard = b.shards[s]!;
        if (!shard.visible) continue;
        const vel = b.shardVel[s]!;
        shard.position.addScaledVector(vel, delta);
        vel.y -= 20 * delta;
        shard.rotation.x += 10 * delta;
        shard.rotation.y += 8 * delta;
        (shard.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t);
      }
      if (b.life <= 0) {
        b.mesh.visible = false;
        b.light.visible = false;
        b.light.intensity = 0;
        b.ring.visible = false;
        for (const shard of b.shards) shard.visible = false;
        this.bursts.splice(i, 1);
        this.pool.push(b);
      }
    }

    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const st = this.streaks[i]!;
      st.life -= delta;
      const t = 1 - Math.max(0, st.life) / st.maxLife;
      for (const obj of st.meshes) {
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const mat = child.material as THREE.MeshBasicMaterial;
            mat.opacity = Math.max(0, 1 - t);
          }
        });
      }
      if (st.life <= 0) {
        for (const obj of st.meshes) {
          this.scene.remove(obj);
          obj.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              (child.material as THREE.Material).dispose();
            }
          });
        }
        this.streaks.splice(i, 1);
      }
    }

    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i]!;
      f.t = Math.min(1, f.t + delta * f.speed);
      f.life -= delta;
      f.root.position.lerpVectors(f.from, f.to, f.t);
      const pulse = 0.82 + Math.sin(performance.now() * 0.05) * 0.18;
      for (const flame of f.flames) flame.scale.set(pulse, 1, pulse);
      if (f.t >= 1 || f.life <= 0) {
        f.root.visible = false;
        this.flyers.splice(i, 1);
        this.flyerPools[f.missile ? 'missile' : 'round'].push(f);
      }
    }
  }
}
