import { InputManager } from '../core/InputManager';

/**
 * MobileControls - Touch-based virtual joystick and action buttons.
 * PRD: On-screen Virtual Joystick and Action Buttons via Touch Events.
 */
export class MobileControls {
  private container: HTMLDivElement;
  private joystickBase: HTMLDivElement;
  private joystickThumb: HTMLDivElement;
  private attackButton: HTMLButtonElement;

  private joystickActive: boolean = false;
  private joystickOrigin: { x: number; y: number } = { x: 0, y: 0 };
  private maxJoystickDistance: number = 50;

  // Bound handlers for cleanup
  private boundHandlers: {
    touchStart: (e: TouchEvent) => void;
    touchMove: (e: TouchEvent) => void;
    touchEnd: () => void;
    attackStart: (e: TouchEvent) => void;
  };

  constructor(private input: InputManager) {
    this.container = document.createElement('div');
    this.container.id = 'mobile-controls';
    this.container.style.cssText = `
      position: fixed;
      bottom: 0; left: 0;
      width: 100%; height: 200px;
      pointer-events: none;
      z-index: 500;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 0 1.5rem 1.5rem;
      box-sizing: border-box;
    `;

    // Virtual joystick
    this.joystickBase = document.createElement('div');
    this.joystickBase.style.cssText = `
      width: 120px; height: 120px;
      border-radius: 50%;
      background: rgba(0, 240, 255, 0.1);
      border: 2px solid rgba(0, 240, 255, 0.3);
      position: relative;
      pointer-events: all;
      touch-action: none;
    `;

    this.joystickThumb = document.createElement('div');
    this.joystickThumb.style.cssText = `
      width: 50px; height: 50px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(0, 240, 255, 0.6), rgba(0, 240, 255, 0.2));
      border: 2px solid rgba(0, 240, 255, 0.5);
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      transition: none;
    `;

    this.joystickBase.appendChild(this.joystickThumb);
    this.container.appendChild(this.joystickBase);

    // Attack button
    this.attackButton = document.createElement('button');
    this.attackButton.textContent = '⚔';
    this.attackButton.style.cssText = `
      width: 70px; height: 70px;
      border-radius: 50%;
      background: rgba(255, 0, 170, 0.2);
      border: 2px solid rgba(255, 0, 170, 0.4);
      color: #ff00aa;
      font-size: 1.5rem;
      pointer-events: all;
      touch-action: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 20px rgba(255, 0, 170, 0.2);
    `;
    this.container.appendChild(this.attackButton);

    document.body.appendChild(this.container);

    // Bind touch events
    this.boundHandlers = {
      touchStart: this.onJoystickStart.bind(this),
      touchMove: this.onJoystickMove.bind(this),
      touchEnd: this.onJoystickEnd.bind(this),
      attackStart: this.onAttack.bind(this),
    };

    this.joystickBase.addEventListener('touchstart', this.boundHandlers.touchStart, { passive: false });
    this.joystickBase.addEventListener('touchmove', this.boundHandlers.touchMove, { passive: false });
    this.joystickBase.addEventListener('touchend', this.boundHandlers.touchEnd);
    this.attackButton.addEventListener('touchstart', this.boundHandlers.attackStart, { passive: false });
  }

  private onJoystickStart(e: TouchEvent): void {
    e.preventDefault();
    this.joystickActive = true;
    const touch = e.touches[0];
    const rect = this.joystickBase.getBoundingClientRect();
    this.joystickOrigin.x = rect.left + rect.width / 2;
    this.joystickOrigin.y = rect.top + rect.height / 2;
    this.updateJoystick(touch.clientX, touch.clientY);
  }

  private onJoystickMove(e: TouchEvent): void {
    e.preventDefault();
    if (!this.joystickActive) return;
    const touch = e.touches[0];
    this.updateJoystick(touch.clientX, touch.clientY);
  }

  private onJoystickEnd(): void {
    this.joystickActive = false;
    this.joystickThumb.style.transform = 'translate(-50%, -50%)';
    this.input.clearMobileInput();
  }

  private updateJoystick(touchX: number, touchY: number): void {
    let dx = touchX - this.joystickOrigin.x;
    let dy = touchY - this.joystickOrigin.y;

    // Clamp distance
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > this.maxJoystickDistance) {
      dx = (dx / distance) * this.maxJoystickDistance;
      dy = (dy / distance) * this.maxJoystickDistance;
    }

    // Update thumb position
    this.joystickThumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    // Normalize to -1..1 and send to InputManager
    const normalX = dx / this.maxJoystickDistance;
    const normalY = dy / this.maxJoystickDistance;
    this.input.setMobileAxis(normalX, normalY);
  }

  private onAttack(e: TouchEvent): void {
    e.preventDefault();
    this.input.triggerAction();
    // Visual feedback
    this.attackButton.style.background = 'rgba(255, 0, 170, 0.5)';
    setTimeout(() => {
      this.attackButton.style.background = 'rgba(255, 0, 170, 0.2)';
    }, 150);
  }

  /**
   * PRD: Strict removeEventListener enforcement.
   */
  dispose(): void {
    this.joystickBase.removeEventListener('touchstart', this.boundHandlers.touchStart);
    this.joystickBase.removeEventListener('touchmove', this.boundHandlers.touchMove);
    this.joystickBase.removeEventListener('touchend', this.boundHandlers.touchEnd);
    this.attackButton.removeEventListener('touchstart', this.boundHandlers.attackStart);
    this.container.remove();
  }
}
