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

  if (kind === 'loader' || kind === 'behemoth' || kind === 'colossus' || kind === 'hauler' || kind === 'welder') {
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

  if (kind === 'carrier' || kind === 'warden' || kind === 'wyrm') {
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

  // guardian / sentinel — an obelisk holding a shielded floating core.
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
