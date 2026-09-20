import * as THREE from 'three';

export type BrickPalette = {
  skin: string;
  torso: string;
  legs: string;
  accent: string;
};

export type BrickFigureOpts = {
  boss?: boolean;
  shield?: boolean;
};

/** Procedural toy-brick figure (original style — not LEGO IP). */
export function createBrickFigure(palette: BrickPalette, opts: BrickFigureOpts = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = 'BrickFigure';

  const plastic = (color: string, roughness = 0.26, metalness = 0.08) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      envMapIntensity: 1,
    });

  const glow = (color: string, intensity = 1.2) =>
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.35,
      metalness: 0.2,
    });

  const skinMat = plastic(palette.skin, 0.32);
  const torsoMat = plastic(palette.torso, 0.28);
  const legMat = plastic(palette.legs, 0.34);
  // Kept modest on purpose: with bloom in the pipeline a hot emissive turns the chest
  // plate and gun into one white blob.
  const accentMat = glow(palette.accent, opts.boss ? 1.0 : 0.7);

  // Head
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.44, 18), skinMat);
  head.position.y = 1.58;
  head.castShadow = true;
  root.add(head);

  const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 14), skinMat);
  stud.position.y = 1.85;
  stud.castShadow = true;
  root.add(stud);

  // Simple face (printed-plate look)
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.28, 0.16),
    new THREE.MeshBasicMaterial({ color: '#1a1020' }),
  );
  face.position.set(0, 1.58, 0.165);
  root.add(face);
  const eyeL = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), new THREE.MeshBasicMaterial({ color: '#111' }));
  eyeL.position.set(-0.07, 1.62, 0.17);
  root.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.07;
  root.add(eyeR);

  // Torso with chest plate
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.58, 0.38), torsoMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  root.add(torso);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.08), accentMat);
  chest.position.set(0, 1.18, 0.2);
  root.add(chest);

  const neonTrim = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.07, 0.4), accentMat);
  neonTrim.position.y = 1.34;
  root.add(neonTrim);

  // Backpack / jetpack brick
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.18), plastic(palette.legs, 0.4, 0.2));
  pack.position.set(0, 1.15, -0.28);
  pack.castShadow = true;
  root.add(pack);
  const packGlow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.06), accentMat);
  packGlow.position.set(0, 1.15, -0.38);
  root.add(packGlow);

  // Arms + hands
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), torsoMat);
    arm.position.set(side * 0.44, 1.1, 0);
    arm.castShadow = true;
    root.add(arm);
    const hand = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.18, 12), skinMat);
    hand.position.set(side * 0.44, 0.78, 0);
    hand.castShadow = true;
    root.add(hand);
  }

  // Chunks of gun sit on the camera-facing right side so TPS view can see them.
  const gunMat = new THREE.MeshBasicMaterial({ color: '#00e5ff' });
  const gun = new THREE.Group();
  gun.name = 'Gun';
  gun.position.set(0.72, 1.12, -0.05);
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.95), gunMat);
  gunBody.castShadow = true;
  gun.add(gunBody);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.28), new THREE.MeshBasicMaterial({ color: '#ff2d6a' }));
  muzzle.position.z = 0.58;
  gun.add(muzzle);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.16), plastic('#1b2436', 0.4, 0.3));
  grip.position.set(0, -0.28, -0.15);
  gun.add(grip);
  root.add(gun);
  root.userData.gunMat = gunMat;

  // Legs
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.56, 0.26), legMat);
    leg.position.set(side * 0.17, 0.46, 0);
    leg.castShadow = true;
    root.add(leg);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.32), plastic('#0a0e16', 0.5));
    boot.position.set(side * 0.17, 0.16, 0.04);
    root.add(boot);
  }

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.36), legMat);
  hips.position.y = 0.74;
  hips.castShadow = true;
  root.add(hips);

  if (opts.shield) {
    const shield = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.7, 0.08),
      glow('#7df9ff', 0.9),
    );
    shield.position.set(-0.55, 1.1, 0.15);
    shield.rotation.y = 0.25;
    root.add(shield);
  }

  if (opts.boss) {
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), accentMat);
    crown.position.y = 1.98;
    root.add(crown);
    const pauldronL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.28), plastic(palette.torso, 0.3, 0.25));
    pauldronL.position.set(-0.55, 1.4, 0);
    root.add(pauldronL);
    const pauldronR = pauldronL.clone();
    pauldronR.position.x = 0.55;
    root.add(pauldronR);
  }

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
