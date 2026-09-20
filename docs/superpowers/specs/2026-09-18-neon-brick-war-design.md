# Neon Brick War — Design Spec

**Date:** 2026-09-18  
**Status:** Draft for user review  
**Stack:** Vite + TypeScript + Three.js + Rapier3D  

## 1. Product

**Name (working):** Neon Brick War（霓虹积木战争）  
**Platform:** Browser (itch.io HTML5), desktop primary; touch fallback optional later  
**Genre:** Third-person shooter, linear war campaign  

**Player fantasy:** Control a polished brick-style soldier, over-the-shoulder aim through neon battlefields, swap flashy weapons, clear outposts, defeat bosses, unlock the next map.

**Visual direction:** Neon sci-fi battlefield + toy-brick characters (plastic specular, clear joints, neon trim). Original brick-figure style only — no official LEGO trademarks, minifig assets, or logos.

## 2. Scope (v1 shippable)

| Content | Count |
|---------|-------|
| Maps | 3 (linear unlock) |
| Weapons | 6 |
| Pickups | 8 |
| Bosses | 1 per map |
| Enemy archetypes | 3 (rusher / ranged / shield) + boss |

**Out of scope for v1:** vehicles, destructible buildings, multiplayer, full ragdoll cloth, pay-to-win combat stats.

## 3. Core loop

1. Enter mission with over-shoulder free look.  
2. Advance outposts A → B → C (clear enemies / hold points).  
3. Pick up weapons and items mid-mission; gun feel must be distinct.  
4. Boss fight → win → unlock next map.  
5. Death → reload at nearest checkpoint (not full mission restart).

Session target per map: about 15–25 minutes for a first clear.

## 4. Architecture

| Module | Responsibility |
|--------|----------------|
| `GameApp` | Boot, scene flow, pause |
| `World` | Three.js scene, lights, modest bloom |
| `PhysicsWorld` | Rapier world, fixed timestep, debug colliders |
| `CharacterController` | Capsule move, ground stick, wall slide |
| `Combat` | Hitscan / projectiles, damage, knockback |
| `Level` | Outposts, spawns, boss, checkpoints, bounds |
| `VFX` / `Audio` | Muzzle, explosions, hit feedback, BGM |
| `Commerce` | Unlock gates, skins, itch purchase state |

Render meshes and collision shapes are always separate assets.

## 5. Collision & bounds (hard acceptance)

1. **Buildings:** Simplified colliders only (boxes / convex hulls). Capsule must not enter solids.  
2. **Ground:** Static collider; no sinking or floating skate.  
3. **Character ↔ character:** Capsule vs capsule; soft push allowed; no overlapping through.  
4. **Map bounds:** Invisible walls + height clamp; out-of-bounds snaps to last safe point.  
5. **Bullets / grenades:** Separate tests vs static world and characters; no shooting through walls.  
6. **Camera:** Pull-in on world collision so the camera does not clip through walls.  
7. Dev toggle: wireframe colliders; any soft-clip is a failed test.

Player and enemy use the same controller rules.

## 6. Maps

| # | Theme | Path | Boss | Monetization |
|---|-------|------|------|--------------|
| 1 | Neon docks | Gate → warehouse → crane deck | Armored loader | Free |
| 2 | Cyber streets | Alleys → skybridge → ad tower | Drone carrier | Paid unlock |
| 3 | Core reactor | Perimeter → coolant hall → core | Core guardian | Paid unlock |

Checkpoints: 2–3 per map.

## 7. Weapons

1. Pulse pistol — default, mid fire rate, accurate  
2. Scatter SMG — close-range high damage  
3. Rail rifle — charge, pierces shields  
4. Grenade launcher — AoE explosion  
5. Arc gun — chain lightning  
6. Plasma cannon — slow, huge blast, scarce ammo  

## 8. Pickups

Medkit, shield battery, haste boots, ammo crate, EMP grenade, decoy drone, vision scan, temporary double damage.

## 9. Boss cadence

Expose weak point → rage phase with new attack → neon explosion climax → drop unique skin or next-map key.

## 10. Commercialization (required at launch)

| Layer | Content |
|-------|---------|
| Free | Full map 1 including boss |
| Paid unlock | Maps 2–3 + campaign ending |
| Cosmetics | Brick soldier paints / weapon neon skins (visual only) |
| itch | PWYW or fixed price; unlock stored in `localStorage` (simple integrity check later) |

**Forbidden:** forced ads to fire; pay-to-win damage/HP.

## 11. Audio / VFX budget

Muzzle flash, impact sparks, grenade boom, shield break, boss intro sting; one BGM loop per map.

## 12. Asset policy

- Hero characters: polished low-poly brick figures (plastic look). Prefer CC0 / purchased brick-style kits or original models — never official LEGO kits.  
- Environments: modular neon kits, instanced repeats.  
- Collision proxies authored alongside art.

## 13. Build order (implementation later)

1. Vertical slice: map 1 blockout + capsule controller + one gun + no soft-clip proof.  
2. Combat + 3 enemy types + checkpoint.  
3. Boss 1 + VFX/SFX pass.  
4. Commerce gate stub + maps 2–3 content.  
5. Cosmetics pack + itch package + QA.

## 14. Success criteria

- Player can clear map 1 without clipping into buildings or through other characters.  
- Six guns feel distinct; explosions readable on neon backgrounds.  
- Free/paid gate works on a fresh browser profile.  
- itch HTML zip runs offline after load.

## 15. Reference games (mechanics only)

- Ravenfield — large war maps, weapon variety (scale down for web).  
- Browser TPS (e.g. Gears-style web titles) — over-shoulder campaign pacing.  
- Colorful TPS (e.g. Battle Splash) — high-saturation readability.  

Copy systems and pacing; do not copy art, names, or IP.
