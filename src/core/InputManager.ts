/**
 * InputManager - Handles keyboard, mouse, and touch input.
 * Supports both desktop keyboard/mouse and programmatic input from MobileControls.
 * PRD: Mouse orbit for camera, touch right-side for mobile camera.
 */
export class InputManager {
  private keysPressed: Set<string> = new Set();
  private actionPressed: boolean = false;

  // Mobile joystick input (overridden by MobileControls)
  private mobileAxis: { x: number; y: number } = { x: 0, y: 0 };
  private isMobileInput: boolean = false;

  // Mouse delta for camera orbit (GTA 5 style)
  private mouseDelta: { x: number; y: number } = { x: 0, y: 0 };
  private pointerLocked: boolean = false;

  // Mobile camera touch (right side of screen)
  private mobileCameraTouchId: number | null = null;
  private mobileCameraLastPos: { x: number; y: number } = { x: 0, y: 0 };

  // Bound handlers for proper cleanup
  private boundOnKeyDown: (e: KeyboardEvent) => void;
  private boundOnKeyUp: (e: KeyboardEvent) => void;
  private boundOnMouseMove: (e: MouseEvent) => void;
  private boundOnPointerLockChange: () => void;
  private boundOnCanvasClick: (e: MouseEvent) => void;
  private boundOnTouchStart: (e: TouchEvent) => void;
  private boundOnTouchMove: (e: TouchEvent) => void;
  private boundOnTouchEnd: (e: TouchEvent) => void;
  private boundOnWindowBlur: () => void;

  private canvas: HTMLElement | null = null;

  constructor() {
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnKeyUp = this.onKeyUp.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnPointerLockChange = this.onPointerLockChange.bind(this);
    this.boundOnCanvasClick = this.onCanvasClick.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnTouchStart = this.onTouchStart.bind(this);
    this.boundOnTouchMove = this.onTouchMove.bind(this);
    this.boundOnTouchEnd = this.onTouchEnd.bind(this);
    this.boundOnWindowBlur = this.onWindowBlur.bind(this);

    window.addEventListener('keydown', this.boundOnKeyDown);
    window.addEventListener('keyup', this.boundOnKeyUp);
    window.addEventListener('blur', this.boundOnWindowBlur);
    document.addEventListener('mousemove', this.boundOnMouseMove);
    document.addEventListener('mousedown', this.boundOnMouseDown);
    document.addEventListener('pointerlockchange', this.boundOnPointerLockChange);
  }

  /**
   * Attach to a canvas/renderer element for pointer lock and touch events.
   */
  attachToCanvas(canvas: HTMLElement): void {
    this.canvas = canvas;
    canvas.addEventListener('click', this.boundOnCanvasClick);
    canvas.addEventListener('touchstart', this.boundOnTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.boundOnTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.boundOnTouchEnd);
  }

  private jumpPressed: boolean = false;
  private sprintPressed: boolean = false;
  private _isPunching: boolean = false;
  private _isKicking: boolean = false;
  private _isDropKicking: boolean = false;

  // ──────────── Keyboard ────────────

  private onKeyDown(e: KeyboardEvent): void {
    this.keysPressed.add(e.code);
    this.keysPressed.add(e.key.toLowerCase()); // Robust fallback
    if (e.code === 'KeyE' || e.key.toLowerCase() === 'e') {
      this.actionPressed = true;
    }
    if (e.code === 'Space' || e.key === ' ') {
      this.jumpPressed = true;
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.key === 'Shift') {
      this.sprintPressed = true;
    }
    if (e.code === 'Tab') {
      this._isDropKicking = true;
      e.preventDefault(); // Prevent focus switching
    }
    if (e.code === 'KeyR' || e.key.toLowerCase() === 'r') {
      this._isPunching = true;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keysPressed.delete(e.code);
    this.keysPressed.delete(e.key.toLowerCase());
    if (e.code === 'KeyE' || e.key.toLowerCase() === 'e') {
      this.actionPressed = false;
    }
    if (e.code === 'Space' || e.key === ' ') {
      this.jumpPressed = false;
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.key === 'Shift') {
      this.sprintPressed = false;
    }
  }

  private onWindowBlur(): void {
    this.keysPressed.clear();
    this.sprintPressed = false;
    this.jumpPressed = false;
    this.actionPressed = false;
    this._isDropKicking = false;
    this._isPunching = false;
    this._isKicking = false;
  }

  // ──────────── Mouse (Desktop Camera Orbit) ────────────

  private onMouseMove(e: MouseEvent): void {
    if (!this.pointerLocked) return;
    this.mouseDelta.x += e.movementX;
    this.mouseDelta.y += e.movementY;
  }

  private onPointerLockChange(): void {
    this.pointerLocked = document.pointerLockElement === this.canvas;
  }

  private boundOnMouseDown: (e: MouseEvent) => void;

  private onCanvasClick(_e: MouseEvent): void {
    if (!this.pointerLocked && this.canvas) {
      this.canvas.requestPointerLock();
    }
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.pointerLocked) return;
    if (e.button === 0) { // Left click
      this._isPunching = true;
    } else if (e.button === 2) { // Right click
      this._isKicking = true;
    }
  }

  // ──────────── Touch (Mobile Camera Orbit) ────────────

  private onTouchStart(e: TouchEvent): void {
    // Right side of screen = camera orbit
    const screenMidX = window.innerWidth / 2;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.clientX > screenMidX && this.mobileCameraTouchId === null) {
        this.mobileCameraTouchId = touch.identifier;
        this.mobileCameraLastPos.x = touch.clientX;
        this.mobileCameraLastPos.y = touch.clientY;
        e.preventDefault();
      }
    }
  }

  private onTouchMove(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.mobileCameraTouchId) {
        const dx = touch.clientX - this.mobileCameraLastPos.x;
        const dy = touch.clientY - this.mobileCameraLastPos.y;
        // Scale touch delta to feel like mouse movement
        this.mouseDelta.x += dx * 2.0;
        this.mouseDelta.y += dy * 2.0;
        this.mobileCameraLastPos.x = touch.clientX;
        this.mobileCameraLastPos.y = touch.clientY;
        e.preventDefault();
      }
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.mobileCameraTouchId) {
        this.mobileCameraTouchId = null;
      }
    }
  }

  // ──────────── Public API ────────────

  /**
   * Get movement direction as normalized vector components.
   * Returns { x, z } where positive x = right, positive z = backward.
   */
  getMovement(): { x: number; z: number } {
    if (this.isMobileInput) {
      return { x: this.mobileAxis.x, z: this.mobileAxis.y };
    }

    let x = 0;
    let z = 0;

    if (this.keysPressed.has('KeyW') || this.keysPressed.has('w') || this.keysPressed.has('ArrowUp')) z -= 1;
    if (this.keysPressed.has('KeyS') || this.keysPressed.has('s') || this.keysPressed.has('ArrowDown')) z += 1;
    if (this.keysPressed.has('KeyA') || this.keysPressed.has('a') || this.keysPressed.has('ArrowLeft')) x -= 1;
    if (this.keysPressed.has('KeyD') || this.keysPressed.has('d') || this.keysPressed.has('ArrowRight')) x += 1;

    // Normalize diagonal movement
    const length = Math.sqrt(x * x + z * z);
    if (length > 0) {
      x /= length;
      z /= length;
    }

    return { x, z };
  }

  /**
   * Get accumulated mouse delta for camera orbit.
   */
  getMouseDelta(): { x: number; y: number } {
    return { x: this.mouseDelta.x, y: this.mouseDelta.y };
  }

  /**
   * Consume mouse delta (reset after camera reads it).
   */
  consumeMouseDelta(): void {
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
  }

  /**
   * Check if pointer is currently locked.
   */
  isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  /**
   * Check if action button was pressed (attack / interact).
   */
  isActionPressed(): boolean {
    return this.actionPressed;
  }

  /**
   * Consume action press (one-shot).
   */
  consumeAction(): boolean {
    if (this.actionPressed) {
      this.actionPressed = false;
      return true;
    }
    return false;
  }

  /**
   * Set mobile joystick axis (called from MobileControls).
   */
  setMobileAxis(x: number, y: number): void {
    this.isMobileInput = true;
    this.mobileAxis.x = x;
    this.mobileAxis.y = y;
  }

  /**
   * Clear mobile input (joystick released).
   */
  clearMobileInput(): void {
    this.isMobileInput = false;
    this.mobileAxis.x = 0;
    this.mobileAxis.y = 0;
  }

  /**
   * Trigger action from mobile button.
   */
  triggerAction(): void {
    this.actionPressed = true;
    // Auto-release after a short time
    setTimeout(() => {
      this.actionPressed = false;
    }, 100);
  }

  /**
   * Check if sprint button is pressed.
   */
  isSprintPressed(): boolean {
    return this.sprintPressed;
  }

  /**
   * Check if jump button is pressed.
   */
  isJumpPressed(): boolean {
    return this.jumpPressed;
  }

  /**
   * Consume punch input (resets to false after reading)
   */
  consumePunch(): boolean {
    const val = this._isPunching;
    this._isPunching = false;
    return val;
  }

  /**
   * Consume kick input (resets to false after reading)
   */
  consumeKick(): boolean {
    const val = this._isKicking;
    this._isKicking = false;
    return val;
  }

  consumeDropKick(): boolean {
    const val = this._isDropKicking;
    this._isDropKicking = false;
    return val;
  }

  /**
   * PRD: Strict removeEventListener enforcement.
   */
  dispose(): void {
    window.removeEventListener('keydown', this.boundOnKeyDown);
    window.removeEventListener('keyup', this.boundOnKeyUp);
    window.removeEventListener('blur', this.boundOnWindowBlur);
    document.removeEventListener('mousemove', this.boundOnMouseMove);
    document.removeEventListener('mousedown', this.boundOnMouseDown);
    document.removeEventListener('pointerlockchange', this.boundOnPointerLockChange);

    if (this.canvas) {
      this.canvas.removeEventListener('click', this.boundOnCanvasClick);
      this.canvas.removeEventListener('touchstart', this.boundOnTouchStart);
      this.canvas.removeEventListener('touchmove', this.boundOnTouchMove);
      this.canvas.removeEventListener('touchend', this.boundOnTouchEnd);
    }

    if (this.pointerLocked) {
      document.exitPointerLock();
    }

    this.keysPressed.clear();
  }
}
