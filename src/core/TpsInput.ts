import * as THREE from 'three';

export class TpsInput {
  private readonly keys = new Set<string>();
  readonly mouse = new THREE.Vector2(
    typeof window !== 'undefined' ? window.innerWidth * 0.5 : 0,
    typeof window !== 'undefined' ? window.innerHeight * 0.5 : 0,
  );
  lookDx = 0;
  lookDy = 0;
  fireHeld = false;
  private fireQueued = false;
  private pointerLocked = false;
  private weaponDigit: number | null = null;
  private cycleDir: 1 | -1 | 0 = 0;
  private buyPressed = false;
  private nextMapPressed = false;
  private restartPressed = false;
  private debugTogglePressed = false;
  private mutePressed = false;

  private readonly onKeyDown = (e: KeyboardEvent) => {
    // keydown auto-repeats while a key is held, so only the first event counts as a press.
    const firstPress = !this.keys.has(e.code);
    this.keys.add(e.code);
    if (firstPress && e.code === 'KeyR') this.restartPressed = true;
    if (firstPress && e.code === 'F3') this.debugTogglePressed = true;
    if (firstPress && e.code === 'KeyM') this.mutePressed = true;
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.replace('Digit', ''));
      if (n >= 1 && n <= 6) this.weaponDigit = n;
    }
    if (e.code === 'KeyQ') this.cycleDir = -1;
    if (e.code === 'KeyE') this.cycleDir = 1;
    if (e.code === 'KeyB') this.buyPressed = true;
    if (e.code === 'KeyN' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      this.nextMapPressed = true;
    }
    if (e.code === 'Space' || e.code === 'KeyJ') this.fireQueued = true;
    if (
      [
        'Space',
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'F3',
      ].includes(e.code)
    ) {
      e.preventDefault();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    this.mouse.set(e.clientX, e.clientY);
    if (!this.pointerLocked) return;
    this.lookDx += e.movementX;
    this.lookDy += e.movementY;
  };

  private readonly onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) {
      this.fireHeld = true;
      this.fireQueued = true;
    }
  };

  private readonly onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.fireHeld = false;
  };

  private readonly onWheel = (e: WheelEvent) => {
    if (!this.pointerLocked) return;
    this.cycleDir = e.deltaY > 0 ? 1 : -1;
  };

  private readonly onLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this.onLockChange);
    canvas.addEventListener('click', () => {
      if (!this.pointerLocked) void canvas.requestPointerLock();
    });
  }

  consumeLook(): { dx: number; dy: number } {
    const dx = this.lookDx;
    const dy = this.lookDy;
    this.lookDx = 0;
    this.lookDy = 0;
    return { dx, dy };
  }

  consumeWeaponDigit(): number | null {
    const d = this.weaponDigit;
    this.weaponDigit = null;
    return d;
  }

  consumeCycle(): 1 | -1 | 0 {
    const d = this.cycleDir;
    this.cycleDir = 0;
    return d;
  }

  consumeBuy(): boolean {
    const v = this.buyPressed;
    this.buyPressed = false;
    return v;
  }

  consumeNextMap(): boolean {
    const v = this.nextMapPressed;
    this.nextMapPressed = false;
    return v;
  }

  readMovement(target: THREE.Vector2): THREE.Vector2 {
    target.set(0, 0);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) target.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) target.x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) target.y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) target.y -= 1;
    if (target.lengthSq() > 1) target.normalize();
    return target;
  }

  /** True for a click, a held button, or Space/J — survives mouseup-before-frame. */
  consumeFire(): boolean {
    const pressed =
      this.fireQueued ||
      this.fireHeld ||
      this.keys.has('Space') ||
      this.keys.has('KeyJ');
    this.fireQueued = false;
    return pressed;
  }

  /** True only for the frame R was first pressed — holding R does not re-trigger. */
  consumeRestart(): boolean {
    const v = this.restartPressed;
    this.restartPressed = false;
    return v;
  }

  /** F3 — dev toggle for the collider wireframe overlay. */
  consumeDebugToggle(): boolean {
    const v = this.debugTogglePressed;
    this.debugTogglePressed = false;
    return v;
  }

  /** M — mute. */
  consumeMute(): boolean {
    const v = this.mutePressed;
    this.mutePressed = false;
    return v;
  }

  get isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onLockChange);
  }
}
