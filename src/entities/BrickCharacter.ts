import * as THREE from 'three';

export type BrickPalette = {
  skin: string;
  torso: string;
  legs: string;
  accent: string;
};

export type BrickBuild = {
  torsoW: number;
  torsoH: number;
  legL: number;
  armL: number;
  headScale: number;
  shoulder: number;
};

export type BrickFigureOpts = {
  boss?: boolean;
  shield?: boolean;
  /** Proportions. Chassis rebuilds change the silhouette, not just the palette. */
  build?: BrickBuild;
};

/**
 * Articulated rig.
 *
 * The limbs hang off pivot Groups placed at the shoulder / hip, with the limb geometry
 * offset downward inside the pivot. Rotating the pivot therefore swings the limb from the
 * joint instead of spinning it about its own centre — without this the figure can only slide
 * around as a single rigid lump, which is what it did before.
 */
export type BrickRig = {
  /** Proportions this figure was built with; the animator scales its offsets by these. */
  build: BrickBuild;
  /** Everything except the legs — bobs and leans as one unit. */
  body: THREE.Group;
  armL: THREE.Group;
  /** Holds the gun, so it swings less than the free arm. */
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  head: THREE.Object3D;
};

/** Local-space y offsets, kept in one place so the rig and the animator agree. */
export const RIG = {
  shoulderY: 1.35,
  hipY: 0.74,
  headY: 1.58,
} as const;

/** Procedural toy-brick figure (original style — not LEGO IP). */
export function createBrickFigure(palette: BrickPalette, opts: BrickFigureOpts = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = 'BrickFigure';

  const plastic = (color: string, roughness = 0.26, metalness = 0.08) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: 1 });

  const glow = (color: string, intensity = 1.2) =>
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.35,
      metalness: 0.2,
    });

  const b: BrickBuild = opts.build ?? {
    torsoW: 1, torsoH: 1, legL: 1, armL: 1, headScale: 1, shoulder: 1,
  };

  const skinMat = plastic(palette.skin, 0.32);
  const torsoMat = plastic(palette.torso, 0.28);
  const legMat = plastic(palette.legs, 0.34);
  // Kept modest: with bloom in the pipeline a hot emissive turns the chest plate into a blob.
  const accentMat = glow(palette.accent, opts.boss ? 1.0 : 0.7);

  // Body group carries everything that bobs and leans.
  const body = new THREE.Group();
  root.add(body);

  // Head
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * b.headScale, 0.32 * b.headScale, 0.44 * b.headScale, 18), skinMat);
  head.position.y = RIG.headY * b.legL;
  head.castShadow = true;
  body.add(head);

  const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 14), skinMat);
  stud.position.y = RIG.headY * b.legL + 0.27 * b.headScale;
  stud.castShadow = true;
  body.add(stud);

  // Simple face (printed-plate look)
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.28, 0.16),
    new THREE.MeshBasicMaterial({ color: '#1a1020' }),
  );
  face.position.set(0, RIG.headY * b.legL, 0.165);
  body.add(face);
  const eyeL = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), new THREE.MeshBasicMaterial({ color: '#111' }));
  eyeL.position.set(-0.07 * b.headScale, RIG.headY * b.legL + 0.04, 0.17);
  body.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.07 * b.headScale;
  body.add(eyeR);

  // Torso with chest plate
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66 * b.torsoW, 0.58 * b.torsoH, 0.38), torsoMat);
  torso.position.y = 1.12 * b.legL + (0.58 * (b.torsoH - 1)) / 2;
  torso.castShadow = true;
  body.add(torso);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.4 * b.torsoW, 0.28, 0.08), accentMat);
  chest.position.set(0, 1.18 * b.legL + (0.58 * (b.torsoH - 1)) / 2, 0.2);
  body.add(chest);

  const neonTrim = new THREE.Mesh(new THREE.BoxGeometry(0.68 * b.torsoW, 0.07, 0.4), accentMat);
  neonTrim.position.y = 1.34 * b.legL + (0.58 * (b.torsoH - 1)) / 2;
  body.add(neonTrim);

  // Backpack / jetpack brick
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.18), plastic(palette.legs, 0.4, 0.2));
  pack.position.set(0, 1.15 * b.legL + (0.58 * (b.torsoH - 1)) / 2, -0.28);
  pack.castShadow = true;
  body.add(pack);
  const packGlow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.06), accentMat);
  packGlow.position.set(0, 1.15 * b.legL + (0.58 * (b.torsoH - 1)) / 2, -0.38);
  body.add(packGlow);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.36), legMat);
  hips.position.y = RIG.hipY * b.legL;
  hips.castShadow = true;
  body.add(hips);

  // ---- arms (pivot at the shoulder) ----
  const gunMat = new THREE.MeshBasicMaterial({ color: '#00e5ff' });
  const arms: Record<'L' | 'R', THREE.Group> = { L: new THREE.Group(), R: new THREE.Group() };
  for (const side of [-1, 1] as const) {
    const key = side === -1 ? 'L' : 'R';
    const pivot = arms[key];
    pivot.position.set(side * 0.44 * b.shoulder, RIG.shoulderY * b.legL, 0);
    body.add(pivot);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5 * b.armL, 0.2), torsoMat);
    arm.position.y = -0.25 * b.armL;
    arm.castShadow = true;
    pivot.add(arm);

    const hand = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.18, 12), skinMat);
    hand.position.y = -0.57 * b.armL;
    hand.castShadow = true;
    pivot.add(hand);
  }

  // The gun lives in the right arm so it follows the swing.
  const gun = new THREE.Group();
  gun.name = 'Gun';
  gun.position.set(0.28, -0.23 * b.armL, -0.05);
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.95), gunMat);
  gunBody.castShadow = true;
  gun.add(gunBody);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.28), new THREE.MeshBasicMaterial({ color: '#ff2d6a' }));
  muzzle.position.z = 0.58;
  gun.add(muzzle);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.16), plastic('#1b2436', 0.4, 0.3));
  grip.position.set(0, -0.28, -0.15);
  gun.add(grip);
  arms.R.add(gun);
  root.userData.gunMat = gunMat;

  // ---- legs (pivot at the hip) ----
  const legs: Record<'L' | 'R', THREE.Group> = { L: new THREE.Group(), R: new THREE.Group() };
  for (const side of [-1, 1] as const) {
    const key = side === -1 ? 'L' : 'R';
    const pivot = legs[key];
    pivot.position.set(side * 0.17 * b.torsoW, RIG.hipY * b.legL, 0);
    body.add(pivot);

    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.56 * b.legL, 0.26), legMat);
    leg.position.y = -0.28 * b.legL;
    leg.castShadow = true;
    pivot.add(leg);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.32), plastic('#0a0e16', 0.5));
    boot.position.set(0, -0.58 * b.legL, 0.04);
    pivot.add(boot);
  }

  if (opts.shield) {
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.08), glow('#7df9ff', 0.9));
    shield.position.set(-0.55 * b.shoulder, 1.1 * b.legL, 0.15);
    shield.rotation.y = 0.25;
    body.add(shield);
  }

  if (opts.boss) {
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), accentMat);
    crown.position.y = RIG.headY * b.legL + 0.4 * b.headScale;
    body.add(crown);
    const pauldronL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.28), plastic(palette.torso, 0.3, 0.25));
    pauldronL.position.set(-0.55 * b.shoulder, 1.4 * b.legL, 0);
    body.add(pauldronL);
    const pauldronR = pauldronL.clone();
    pauldronR.position.x = 0.55 * b.shoulder;
    body.add(pauldronR);
  }

  const rig: BrickRig = {
    build: b,
    body,
    armL: arms.L,
    armR: arms.R,
    legL: legs.L,
    legR: legs.R,
    head,
  };
  root.userData.rig = rig;
  return root;
}

export const PLAYER_PALETTE: BrickPalette = {
  skin: '#f2c9a0',
  torso: '#2de2ff',
  legs: '#0d1b2a',
  accent: '#5ef0ff',
};

export const ENEMY_PALETTE: BrickPalette = {
  skin: '#d4a574',
  torso: '#ff2d6a',
  legs: '#2a1018',
  accent: '#ff6b9d',
};

export const BOSS_PALETTE: BrickPalette = {
  skin: '#c4a882',
  torso: '#ffb703',
  legs: '#1b1b2f',
  accent: '#fb8500',
};
