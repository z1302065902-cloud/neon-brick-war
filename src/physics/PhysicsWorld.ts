import RAPIER from '@dimforge/rapier3d-compat';

export class PhysicsWorld {
  readonly world: RAPIER.World;
  private accumulator = 0;
  private readonly fixedDt = 1 / 60;

  private constructor(world: RAPIER.World) {
    this.world = world;
  }

  static async create(gravityY = -18): Promise<PhysicsWorld> {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: gravityY, z: 0 });
    return new PhysicsWorld(world);
  }

  step(deltaSeconds: number): void {
    this.accumulator += Math.min(deltaSeconds, 0.05);
    while (this.accumulator >= this.fixedDt) {
      this.world.step();
      this.accumulator -= this.fixedDt;
    }
  }

  addStaticBox(
    hx: number,
    hy: number,
    hz: number,
    x: number,
    y: number,
    z: number,
  ): RAPIER.Collider {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z),
    );
    return this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz), body);
  }

  addGround(halfW: number, halfD: number, y = 0): RAPIER.Collider {
    // Thicker slab so capsules don't sink through under gravity / CCD edge cases.
    return this.addStaticBox(halfW, 0.6, halfD, 0, y - 0.6, 0);
  }

  dispose(): void {
    this.world.free();
  }
}
