import * as THREE from 'three';

/**
 * Ten boss silhouettes.
 *
 * Behaviour reuses three rigs — a ground charger, an air kiter, and a stationary guard —
 * but every boss gets its own body, so no two fights look alike. Ten state machines would
 * be ten times the surface area for the same gameplay; ten *looks* on three rigs is the
 * difference the player actually sees.
 */
export type BossArchetype =
  | 'loader' | 'carrier' | 'guardian'
  | 'hauler' | 'warden' | 'welder'
  | 'behemoth' | 'sentinel' | 'wyrm' | 'colossus';

/** Which of the three behaviour rigs an archetype drives. */
export const ARCHETYPE_KIND: Record<BossArchetype, 'loader' | 'carrier' | 'guardian'> = {
  loader: 'loader', hauler: 'loader', welder: 'loader', behemoth: 'loader', colossus: 'loader',
  carrier: 'carrier', warden: 'carrier', wyrm: 'carrier',
  guardian: 'guardian', sentinel: 'guardian',
};

/** Which silhouette builder to run for an archetype. */
type FigureShape = 'loader' | 'carrier' | 'guardian' | 'hauler' | 'warden'
  | 'welder' | 'behemoth' | 'sentinel' | 'wyrm' | 'colossus';

export type BossFigure = {
  root: THREE.Group;
  /** Materials that heat up when the boss enters its rage phase. */
  armour: THREE.MeshStandardMaterial[];
  /** The weak-spot mesh — hidden while the boss is guarding. */
  core: THREE.Mesh;
  coreMat: THREE.MeshStandardMaterial;
  /** Decorative parts that spin. */
  spin: THREE.Object3D[];
};

const plastic = (color: string, roughness = 0.3, metalness = 0.25) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

const glow = (color: string, intensity = 0.8) =>
  new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.3,
    metalness: 0.15,
  });

/** Tall enough that the collider below has something to wrap. Feet sit at y = 0. */
export function createBossFigure(kind: FigureShape): BossFigure {
  const root = new THREE.Group();
  root.name = 'BossFigure';
  const armour: THREE.MeshStandardMaterial[] = [];
  const spin: THREE.Object3D[] = [];

  const add = (mesh: THREE.Mesh, track = true) => {
    mesh.castShadow = true;
    root.add(mesh);
    if (track && mesh.material instanceof THREE.MeshStandardMaterial) armour.push(mesh.material);
    return mesh;
  };

  if (kind === 'loader') {
    // 装甲装卸机 — squat tracked hauler, front plate is the armour, back vent is the seam.
    const trackMat = plastic('#20262f', 0.55, 0.4);
    for (const side of [-1, 1]) {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.46, 1.62), trackMat);
      track.position.set(side * 0.78, 0.24, 0);
      add(track, false);
      for (let i = -1; i <= 1; i++) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.56, 12), plastic('#3a4250', 0.5, 0.5));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * 0.78, 0.24, i * 0.5);
        add(wheel, false);
      }
    }

    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.72, 1.42), plastic('#d8a13a', 0.34, 0.3));
    hull.position.y = 0.95;
    add(hull);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 1.2), plastic('#8a6520', 0.45, 0.35));
    deck.position.y = 1.36;
    add(deck);

    // The front plate. Directional armour lives here.
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.84, 1.0, 0.3), plastic('#f0c65a', 0.28, 0.35));
    plate.position.set(0, 1.02, 0.86);
    plate.rotation.x = -0.12;
    add(plate);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 1.0, 10), plastic('#6f5a2a', 0.4, 0.45));
      arm.position.set(side * 0.72, 1.15, 0.62);
      arm.rotation.x = -1.0;
      add(arm);
      const claw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.36), plastic('#c9973a', 0.35, 0.4));
      claw.position.set(side * 0.72, 1.05, 1.14);
      add(claw);
    }

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.42, 0.6), plastic('#b8862c', 0.36, 0.3));
    head.position.set(0, 1.68, 0.16);
    add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.08), glow('#ff7a18', 1.0));
    visor.position.set(0, 1.7, 0.48);
    root.add(visor);

    for (const side of [-1, 1]) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 10), plastic('#4a4034', 0.5, 0.5));
      stack.position.set(side * 0.62, 1.68, -0.5);
      add(stack, false);
    }

    // Weak spot: an exposed vent on the back, away from the armour plate.
    const coreMat = glow('#ff2d6a', 1.5);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.5, 0.16), coreMat);
    core.position.set(0, 1.0, -0.76);
    root.add(core);
    return { root, armour, core, coreMat, spin };
  }

  if (kind === 'carrier') {
    // 无人机母舰 — hovering hexagonal hull, rotors on top, core slung underneath.
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.0, 0.52, 6), plastic('#7b3fa0', 0.32, 0.35));
    hull.position.y = 1.32;
    add(hull);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.92, 0.34, 6), plastic('#a35fd0', 0.3, 0.35));
    deck.position.y = 1.72;
    add(deck);

    const rimMat = glow('#c77dff', 0.9);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 0.08, 6), rimMat);
    rim.position.y = 1.06;
    root.add(rim);

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.11, 0.2), plastic('#5b2f78', 0.4, 0.4));
      arm.position.set(Math.cos(a) * 0.85, 1.6, Math.sin(a) * 0.85);
      arm.rotation.y = -a;
      add(arm);

      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 10), plastic('#3d2050', 0.45, 0.5));
      hub.position.set(Math.cos(a) * 1.55, 1.64, Math.sin(a) * 1.55);
      add(hub, false);

      const rotor = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.03, 0.09), plastic('#e2c6ff', 0.3, 0.3));
      rotor.position.set(Math.cos(a) * 1.55, 1.72, Math.sin(a) * 1.55);
      root.add(rotor);
      spin.push(rotor);
    }

    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.6, 8), plastic('#5b2f78', 0.4, 0.4));
    pylon.position.y = 0.9;
    add(pylon);

    // Weak spot: the slung core, visible from below and behind.
    const coreMat = glow('#54f0a8', 1.5);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), coreMat);
    core.position.y = 0.62;
    root.add(core);
    return { root, armour, core, coreMat, spin };
  }

  /*
   * Dedicated silhouettes. The three rigs above were doing duty for all ten bosses, which
   * meant several levels fielded visually identical opponents. Each of these is now its own
   * body so a boss can be named from across the arena.
   */

  // 重型搬运机 — a wide container lifter on four legs, crate on its back.
  if (kind === 'hauler') {
    const legMat = plastic('#2a3340', 0.5, 0.45);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.0, 0.34), legMat);
      leg.position.set(sx * 1.0, 0.5, sz * 0.75);
      add(leg, false);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.2, 0.62), plastic('#171d26', 0.55));
      foot.position.set(sx * 1.0, 0.1, sz * 0.75);
      add(foot, false);
    }
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.36, 1.9), plastic('#3f6f9e', 0.44, 0.35));
    bed.position.y = 1.18;
    add(bed);
    // the container it carries — top-heavy, so the silhouette reads as a hauler
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 1.5), plastic('#5f9fd0', 0.4, 0.3));
    crate.position.set(0, 1.92, -0.1);
    add(crate);
    for (let i = 0; i < 3; i++) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 1.6), glow('#2de2ff', 0.7));
      band.position.set(0, 1.6 + i * 0.36, -0.1);
      root.add(band);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.7), plastic('#4a7fae', 0.36, 0.3));
    head.position.set(0, 1.7, 0.95);
    add(head);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.08), glow('#2de2ff', 1.2));
    eye.position.set(0, 1.72, 1.3);
    root.add(eye);
    const coreMat = glow('#ff2d6a', 1.5);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.16), coreMat);
    core.position.set(0, 1.9, -0.92);
    root.add(core);
    return { root, armour, core, coreMat, spin };
  }

  // 轨道焊接机 — a gantry frame with a swinging welding arm.
  if (kind === 'welder') {
    const railMat = plastic('#3a2f26', 0.5, 0.5);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.1, 2.4), railMat);
      rail.position.set(side * 1.15, 1.05, 0);
      add(rail, false);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.34, 0.5), plastic('#c25a1e', 0.42, 0.4));
    beam.position.y = 2.2;
    add(beam);
    const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), plastic('#e07a2a', 0.36, 0.35));
    carriage.position.set(0, 1.75, 0);
    add(carriage);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 1.1, 10), railMat);
    arm.position.set(0, 1.1, 0.2);
    arm.rotation.x = -0.35;
    add(arm);
    const torch = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 8), glow('#ffb703', 1.4));
    torch.position.set(0, 0.6, 0.42);
    torch.rotation.x = -0.35;
    root.add(torch);
    spin.push(torch);
    const coreMat = glow('#ff2d6a', 1.5);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.16), coreMat);
    core.position.set(0, 1.8, -0.4);
    root.add(core);
    return { root, armour, core, coreMat, spin };
  }

  // 熔渣巨像 / 城墙巨像 — a hulking torso on stubby legs, deliberately massive.
  if (kind === 'behemoth' || kind === 'colossus') {
    const mass = kind === 'colossus' ? 1.25 : 1.0;
    const legMat = plastic('#2c2320', 0.55, 0.4);
    for (const side of [-1, 1]) {
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.62 * mass, 1.15, 0.7 * mass), legMat);
      thigh.position.set(side * 0.62 * mass, 0.58, 0);
      add(thigh, false);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.95 * mass, 0.26, 1.15 * mass), plastic('#14100e', 0.6));
      foot.position.set(side * 0.62 * mass, 0.13, 0.1);
      add(foot, false);
    }
    const torso = new THREE.Mesh(new THREE.BoxGeometry(2.0 * mass, 1.25, 1.3 * mass), plastic('#b06a2a', 0.42, 0.35));
    torso.position.y = 1.75;
    add(torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(1.3 * mass, 0.6, 0.2), glow('#ffb703', 0.9));
    chest.position.set(0, 1.95, 0.72 * mass);
    root.add(chest);
    for (const side of [-1, 1]) {
      const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.75 * mass, 0.7, 1.0 * mass), plastic('#8a4f1e', 0.45, 0.35));
      pauldron.position.set(side * 1.3 * mass, 2.05, 0);
      add(pauldron);
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.62 * mass, 0.62 * mass, 0.62 * mass), plastic('#d08238', 0.4, 0.35));
      fist.position.set(side * 1.35 * mass, 1.05, 0.15);
      add(fist);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.8 * mass, 0.6 * mass, 0.75 * mass), plastic('#8a4f1e', 0.4, 0.35));
    head.position.y = 2.7;
    add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.66 * mass, 0.16, 0.08), glow('#ff2d6a', 1.3));
    visor.position.set(0, 2.72, 0.4 * mass);
    root.add(visor);
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 6), glow('#ffb703', 0.8));
      horn.position.set(side * 0.42 * mass, 3.15, 0);
      horn.rotation.z = side * -0.45;
      root.add(horn);
    }
    const coreMat = glow('#ff2d6a', 1.6);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.8 * mass, 0.6, 0.18), coreMat);
    core.position.set(0, 1.75, -0.78 * mass);
    root.add(core);
    return { root, armour, core, coreMat, spin };
  }

  // 信号典狱长 — a broadcast tower with a ring of antennae.
  if (kind === 'warden') {
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.6, 8), plastic('#5b2f78', 0.34, 0.35));
    hull.position.y = 1.4;
    add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 1.5, 8), plastic('#7b3fa0', 0.36, 0.35));
    mast.position.y = 2.4;
    add(mast);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rod = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.3, 0.09), plastic('#c77dff', 0.3, 0.3));
      rod.position.set(Math.cos(a) * 0.95, 1.7, Math.sin(a) * 0.95);
      rod.rotation.z = Math.cos(a) * 0.5;
      rod.rotation.x = -Math.sin(a) * 0.5;
      root.add(rod);
      spin.push(rod);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow('#c77dff', 1.5));
      tip.position.set(Math.cos(a) * 1.35, 2.3, Math.sin(a) * 1.35);
      root.add(tip);
    }
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), glow('#ff2d6a', 0.8));
    dish.position.y = 3.3;
    dish.rotation.x = Math.PI;
    root.add(dish);
    const coreMat = glow('#54f0a8', 1.5);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.44, 1), coreMat);
    core.position.y = 0.72;
    root.add(core);
    return { root, armour, core, coreMat, spin };
  }

  // 冷却长蛇 — a segmented serpent, coiling in the air.
  if (kind === 'wyrm') {
    const segMat = plastic('#2f7f8a', 0.32, 0.35);
    const headSeg = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.7, 1.0), plastic('#54f0a8', 0.3, 0.35));
    headSeg.position.set(0, 1.6, 0.85);
    add(headSeg);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.28, 0.5), plastic('#1d5a5f', 0.4, 0.35));
    jaw.position.set(0, 1.42, 1.35);
    add(jaw);
    const eyeMat = glow('#54f0a8', 1.6);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), eyeMat);
      eye.position.set(side * 0.26, 1.78, 1.12);
      root.add(eye);
    }
    // six body segments trailing back and up
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.7 - i * 0.06, 0.62 - i * 0.05, 0.7 - i * 0.05), segMat);
      seg.position.set(0, 1.6 + i * 0.22, 0.2 - i * 0.62);
      add(seg);
      if (i > 0 && i % 2 === 0) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(1.3 - i * 0.1, 0.08, 0.4), glow('#2de2ff', 0.7));
        fin.position.set(0, 1.75 + i * 0.22, 0.2 - i * 0.62);
        root.add(fin);
      }
    }
    const coreMat = glow('#54f0a8', 1.5);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 1), coreMat);
    core.position.set(0, 1.35, 0.55);
    root.add(core);
    return { root, armour, core, coreMat, spin };
  }

  // 档案哨卫 — a stacked archive pillar with rotating data rings.
  if (kind === 'sentinel') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.9), plastic('#16303f', 0.44, 0.4));
    base.position.y = 0.25;
    add(base);
    for (let i = 0; i < 5; i++) {
      const w = 1.35 - Math.abs(i - 2) * 0.16;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.42, w), i % 2 ? plastic('#2f5a70', 0.36, 0.4) : plastic('#3d7288', 0.36, 0.4));
      slab.position.y = 0.72 + i * 0.44;
      add(slab);
    }
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85 + i * 0.16, 0.045, 8, 26), glow(i === 1 ? '#c77dff' : '#2de2ff', 0.9));
      ring.position.y = 1.4 + i * 0.6;
      ring.rotation.x = Math.PI / 2 + (i - 1) * 0.4;
      root.add(ring);
      spin.push(ring);
    }
    const capMat = glow('#2de2ff', 1.1);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.8, 6), capMat);
    cap.position.y = 3.4;
    root.add(cap);
    const coreMat = glow('#c77dff', 1.6);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), coreMat);
    core.position.y = 2.0;
    root.add(core);
    return { root, armour, core, coreMat, spin };
  }

  // guardian — an obelisk holding a shielded floating core.
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.44, 2.2), plastic('#2b1b3a', 0.45, 0.4));
  base.position.y = 0.22;
  add(base);
  const step = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 1.6), plastic('#3d2752', 0.42, 0.4));
  step.position.y = 0.58;
  add(step);

  const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.5, 1.0), plastic('#5a3a78', 0.34, 0.4));
  pillar.position.y = 1.5;
  add(pillar);

  const collarMat = glow('#ff2d6a', 0.9);
  const collar = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.16, 1.24), collarMat);
  collar.position.y = 2.22;
  root.add(collar);

  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.7), plastic('#452c60', 0.4, 0.4));
    fin.position.set(side * 0.66, 1.6, 0);
    fin.rotation.z = side * 0.16;
    add(fin);
  }

  // Two counter-rotating rings guard the core.
  for (let i = 0; i < 2; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.78 - i * 0.12, 0.05, 8, 26),
      glow(i === 0 ? '#c77dff' : '#ff2d6a', 0.85),
    );
    ring.position.y = 2.72;
    ring.rotation.x = Math.PI / 2 + (i === 0 ? 0.35 : -0.35);
    root.add(ring);
    spin.push(ring);
  }

  const coreMat = glow('#ff2d6a', 1.6);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.44, 1), coreMat);
  core.position.y = 2.72;
  root.add(core);
  return { root, armour, core, coreMat, spin };
}
