export type ProceduralAnimType = 'none' | 'jump' | 'punch' | 'kick';

/**
 * PlayerState
 * Manages the logic variables, flags, and power-up timers for the Player.
 */
export class PlayerState {
  // Movement / Physics states
  public grounded: boolean = true;
  public velocityY: number = 0;
  public currentSpeed: number = 4;
  public baseSpeed: number = 4;

  // Animation states
  public currentAction: string | null = null;
  public proceduralState: ProceduralAnimType = 'none';
  public proceduralTimer: number = 0;
  public proceduralDuration: number = 0;
  public walkTime: number = 0;

  // Combat & Game states
  public isKnockedDown: boolean = false;
  public isAttacking: boolean = false;
  public isFullBodyAttacking: boolean = false;
  public attackCooldown: number = 0;
  public lastAttackType: string = '';
  public hasSpawnLanded: boolean = false;
  
  // Power-up states
  public isPoweredUp: boolean = false;
  public damageMultiplier: number = 1.0;
  public powerUpTimer: number = 0;

  // Timers
  public attackTimeoutId: number | null = null;

  constructor(baseSpeed: number = 4) {
    this.baseSpeed = baseSpeed;
    this.currentSpeed = baseSpeed;
  }

  public resetTimers(): void {
    if (this.attackTimeoutId) {
      clearTimeout(this.attackTimeoutId);
      this.attackTimeoutId = null;
    }
  }

  public update(delta: number): void {
    // Cooldown logic
    if (this.attackCooldown > 0) {
      this.attackCooldown -= delta;
      if (this.attackCooldown < 0) this.attackCooldown = 0;
    }

    // Power-up logic
    if (this.isPoweredUp) {
      this.powerUpTimer -= delta;
      if (this.powerUpTimer <= 0) {
        this.isPoweredUp = false;
        this.damageMultiplier = 1.0;
        this.powerUpTimer = 0;
      }
    }
  }

  public startProceduralAnimation(type: ProceduralAnimType): void {
    this.proceduralState = type;
    this.proceduralTimer = 0;
    switch (type) {
      case 'jump': this.proceduralDuration = 0.6; break;
      case 'punch': this.proceduralDuration = 0.35; break;
      case 'kick': this.proceduralDuration = 0.4; break;
      default: this.proceduralDuration = 0; break;
    }
  }
}
