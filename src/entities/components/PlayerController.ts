import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from '../../core/InputManager';
import { PlayerState } from './PlayerState';
import { GAME_CONSTANTS } from '../../data/constants';

/**
 * PlayerController
 * Manages the physics body, collider, and character controller for the Player.
 */
export class PlayerController {
  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private characterController: RAPIER.KinematicCharacterController;

  // Directions
  public cameraForward: THREE.Vector3 = new THREE.Vector3(0, 0, -1);
  public cameraRight: THREE.Vector3 = new THREE.Vector3(1, 0, 0);
  public worldMoveDir: THREE.Vector3 = new THREE.Vector3();
  public desiredTranslation: THREE.Vector3 = new THREE.Vector3();

  // Settings
  private TERMINAL_VELOCITY = GAME_CONSTANTS.PLAYER.TERMINAL_VELOCITY;
  private GRAVITY = GAME_CONSTANTS.PLAYER.GRAVITY;
  private JUMP_IMPULSE = GAME_CONSTANTS.PLAYER.JUMP_IMPULSE;

  constructor(
    private world: RAPIER.World,
    private input: InputManager,
    private state: PlayerState,
    initialPos: { x: number, y: number, z: number } = { x: 0, y: GAME_CONSTANTS.PLAYER.SPAWN_Y, z: 0 }
  ) {
    // Physics body - dynamic capsule
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(initialPos.x, initialPos.y, initialPos.z);
    this.body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.4)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    this.collider = this.world.createCollider(colliderDesc, this.body);

    // Character controller for slope/stair handling
    this.characterController = this.world.createCharacterController(0.01);
    this.characterController.enableAutostep(0.3, 0.2, true);
    this.characterController.enableSnapToGround(0.3);
    this.characterController.setApplyImpulsesToDynamicBodies(true);
  }

  public setCameraDirections(forward: THREE.Vector3, right: THREE.Vector3): void {
    this.cameraForward.copy(forward);
    this.cameraRight.copy(right);
  }

  public getColliderHandle(): number {
    return this.collider.handle;
  }

  public getPosition(): RAPIER.Vector {
    return this.body.translation();
  }

  public update(delta: number): void {
    const movement = this.input.getMovement();
    this.worldMoveDir.set(0, 0, 0);

    if (!this.state.isKnockedDown) {
      if (Math.abs(movement.z) > 0.01 || Math.abs(movement.x) > 0.01) {
        // Forward/backward relative to camera
        this.worldMoveDir.addScaledVector(this.cameraForward, -movement.z);
        // Left/right relative to camera
        this.worldMoveDir.addScaledVector(this.cameraRight, movement.x);
        this.worldMoveDir.normalize();
      }
    }

    // Handle Sprinting
    this.state.currentSpeed = this.input.isSprintPressed() ? this.state.baseSpeed * 2.0 : this.state.baseSpeed;

    // Handle Jumping & Gravity (Fix for Tunneling Bug)
    if (!this.state.grounded) {
      this.state.velocityY += this.GRAVITY * delta;
      // Apply Terminal Velocity to prevent falling too fast and tunneling
      if (this.state.velocityY < this.TERMINAL_VELOCITY) {
        this.state.velocityY = this.TERMINAL_VELOCITY;
      }
    } else {
      this.state.velocityY = -0.1; // Small downward force to stick to slopes
      if (this.input.isJumpPressed() && !this.state.isKnockedDown) {
        this.state.velocityY = this.JUMP_IMPULSE;
        this.state.grounded = false;
        
        if (!this.state.currentAction || this.state.currentAction !== 'jump') {
           // We will handle animation trigger in the Facade
        }
      }
    }

    // Desired translation this frame
    this.desiredTranslation.x = this.worldMoveDir.x * this.state.currentSpeed * delta;
    this.desiredTranslation.y = this.state.velocityY * delta;
    this.desiredTranslation.z = this.worldMoveDir.z * this.state.currentSpeed * delta;

    // Use character controller to compute corrected movement
    this.characterController.computeColliderMovement(
      this.collider,
      this.desiredTranslation as RAPIER.Vector3
    );

    const correctedMovement = this.characterController.computedMovement();
    const currentPos = this.body.translation();

    // Apply corrected position
    this.body.setNextKinematicTranslation({
      x: currentPos.x + correctedMovement.x,
      y: currentPos.y + correctedMovement.y,
      z: currentPos.z + correctedMovement.z,
    });

    this.state.grounded = this.characterController.computedGrounded();
  }
}
