# Neon Brick War — Implementation Plan (Phase 0 Vertical Slice)

> **For agentic workers:** Use task-by-task execution. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship a playable browser TPS vertical slice: brick soldier, over-shoulder aim, Rapier capsule collision (no soft-clip), one gun, map-1 blockout outposts, restart.

**Architecture:** Vite + TS modules under `src/` — `core` (loop), `physics` (Rapier), `entities` (player/enemies), `systems` (combat/camera/input), `levels` (map1), `ui`, `commerce` (stub).

**Tech Stack:** Three.js, `@dimforge/rapier3d-compat`, Vite, TypeScript.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-18-neon-brick-war-design.md`
- Brick figures only; no official LEGO IP
- Colliders ≠ visual meshes; capsule vs building/character required
- Desktop WASD + mouse look first; commerce stub for free map1

---

## File map (Phase 0)

| Path | Responsibility |
|------|----------------|
| `src/main.ts` | Boot, RAPIER.init, start loop |
| `src/core/GameApp.ts` | State: menu / playing / dead / win |
| `src/physics/PhysicsWorld.ts` | World, fixed step, debug drawers |
| `src/entities/BrickCharacter.ts` | Mesh + capsule body sync |
| `src/systems/PlayerController.ts` | Move, look, jump |
| `src/systems/TpsCamera.ts` | Over-shoulder + wall pull-in |
| `src/systems/CombatSystem.ts` | Hitscan pulse pistol |
| `src/levels/Map1Docks.ts` | Blockout + outposts + bounds |
| `src/ui/Hud.ts` | HP, ammo, objective |
| `src/commerce/UnlockStore.ts` | localStorage stub |

---

## Task 1: Scaffold + deps

- [x] Create Three.js Vite scaffold in `neon-brick-war`
- [x] Add `@dimforge/rapier3d-compat`
- [x] `npm install` + `npm run build` smoke

## Task 2: Physics + capsule player

- [x] PhysicsWorld with gravity + fixed 1/60 step
- [x] BrickCharacter visual (procedural brick figure)
- [x] Capsule controller; walls as box colliders
- [x] Prove: cannot walk through boxes; characters push apart

## Task 3: TPS camera + pulse pistol

- [x] Pointer lock mouse look, over-shoulder offset
- [x] Camera ray pull-in vs static world
- [x] Pulse pistol hitscan + muzzle flash + damage

## Task 4: Map1 blockout loop

- [x] Three outpost zones A→B→C with simple enemies
- [x] Checkpoint on outpost clear
- [x] Death → respawn; clear C → win toast
- [x] HUD objective text

## Task 5: Verify

- [x] `npm run build` passes
- [x] Manual or browser: move, shoot, no soft-clip, restart

## Later phases (not this plan)

- Full 6 weapons, 8 pickups, 3 maps, bosses, paid unlock, cosmetics, itch zip
