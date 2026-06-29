import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { InputManager } from '../core/InputManager';
import { globalEvents } from '../utils/EventEmitter';
import { PlayerState } from './components/PlayerState';
import { PlayerController } from './components/PlayerController';
import { PlayerAnimator } from './components/PlayerAnimator';
import { GAME_CONSTANTS } from '../data/constants';


/**
 * Player - Main character entity Facade.
 * Combines State, Controller (Physics), and Animator.
 */
export class Player {
  private mesh: THREE.Group;
  private cameraPivot: THREE.Object3D;

  // Sub-components
  public state: PlayerState;
  public controller: PlayerController;
  public animator: PlayerAnimator;

  // Power-up VFX
  private powerUpAuraLight: THREE.PointLight | null = null;

  private auraMixer: THREE.AnimationMixer | null = null;
  private _lastFacingAngle: number = Math.PI;

  // Pre-allocated objects for update loop
  private _facingQuat: THREE.Quaternion = new THREE.Quaternion();
  private _surfaceNormalQuat: THREE.Quaternion = new THREE.Quaternion();
  private _upVec: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
  private _raycaster: THREE.Raycaster = new THREE.Raycaster();
  private _rayOrigin: THREE.Vector3 = new THREE.Vector3();
  private _rayDown: THREE.Vector3 = new THREE.Vector3(0, -1, 0);

  constructor(
    private scene: THREE.Scene,
    private world: RAPIER.World,
    private input: InputManager,
    model: THREE.Group | null = null,
    private spawnPos?: THREE.Vector3,
    private meshTargets: THREE.Object3D[] = []
  ) {
    this.mesh = new THREE.Group();

    // 1. Initialize State
    this.state = new PlayerState(1.0);

    const initialPos = this.spawnPos ? { x: this.spawnPos.x, y: this.spawnPos.y, z: this.spawnPos.z } : { x: 0, y: GAME_CONSTANTS.PLAYER.SPAWN_Y, z: 0 };

    // 2. Initialize Controller (Physics)
    this.controller = new PlayerController(this.world, this.input, this.state, initialPos);

    // 3. Initialize Animator
    this.animator = new PlayerAnimator(this.state);

    if (model) {
      // PRD: Fix mixamo bone name mismatches to prevent T-Pose
      model.traverse((child) => {
        if (child.type === 'Bone' || child.type === 'SkinnedMesh' || child.type === 'Object3D') {
          child.name = child.name.replace(/mixamorig:/g, 'mixamorig_');
        }
      });

      // Kalo lu mau ngubah ukuran karakter secara visual, lu bisa tambahin scale di this.mesh:
      // this.mesh.scale.setScalar(1.5); // contoh biar 50% lebih gede

      this.mesh.add(model);
      this.animator.initMixer(model);
      this.animator.mapMixamoBones(model);

      // Setup Aura Mixer
      const aura = model.getObjectByName('SpawnAura');
      if (aura && aura.userData.animations && aura.userData.animations.length > 0) {
        this.auraMixer = new THREE.AnimationMixer(aura);
        const clip = aura.userData.animations[0];
        const action = this.auraMixer.clipAction(clip);
        action.play();
        aura.visible = false; // Hide initially
      }
    } else {
      this.createFallbackMesh();
    }

    this.mesh.position.set(0, 0, 0);
    // Face the treasure boxes (away from the camera) by default
    this.mesh.rotation.y = Math.PI;
    this.scene.add(this.mesh);

    // Camera pivot at chest height
    this.cameraPivot = new THREE.Object3D();
    this.cameraPivot.position.set(0, 0, 0);
    this.mesh.add(this.cameraPivot);

    this.setupEventListeners();
  }

  private createFallbackMesh(): void {
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x003344,
      metalness: 0.7,
      roughness: 0.3,
    });
    const bodyGeometry = new THREE.CapsuleGeometry(0.4, 0.8, 8, 16);
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.position.y = 0.8;
    this.mesh.add(bodyMesh);

    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xff00aa,
      emissive: 0xff00aa,
      emissiveIntensity: 0.5,
    });
    const headGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMesh = new THREE.Mesh(headGeometry, headMaterial);
    headMesh.position.y = 1.6;
    this.mesh.add(headMesh);
  }

  private setupEventListeners(): void {
    globalEvents.on('powerup:collected', () => {
      // Handled globally or dynamically 
    });
  }

  public getMesh(): THREE.Object3D { return this.mesh; }

  public setCameraDirections(forward: THREE.Vector3, right: THREE.Vector3): void {
    this.controller.setCameraDirections(forward, right);
  }

  public takeDamage(amount: number): void {
    if (this.state.isKnockedDown) return;
    console.log(`Player took ${amount} damage!`);

    if (this.animator.actions['stand_up']) {
      this.state.isKnockedDown = true;
      this.animator.playAnimation('stand_up');
    }
  }

  private handleCombatInput(): void {
    if (this.state.isKnockedDown) return;

    // R key / Punch — infinite alternating combo
    if (this.input.consumePunch()) {
      if (!this.state.isAttacking && this.state.attackCooldown <= 0) {
        this.executeAttack('punch');
      } else if (this.state.isAttacking && this.state.attackCooldown < 0.85) {
        // Infinite alternate combo: punch ↔ elbow_punch
        const nextAttack = this.state.lastAttackType === 'punch' ? 'elbow_punch' : 'punch';
        this.state.isAttacking = false;
        this.state.resetTimers();
        this.animator.stopAction(this.state.lastAttackType);
        this.executeAttack(nextAttack as any);
      }
    }
    // Kick
    else if (this.input.consumeKick() && this.state.attackCooldown <= 0) {
      this.executeAttack('kick');
    }
    // Drop Kick (TAB) — spammable
    else if (this.input.consumeDropKick()) {
      if (!this.state.isAttacking && this.state.attackCooldown <= 0) {
        this.executeDropKick();
      } else if (this.state.isAttacking && this.state.attackCooldown < 1.0) {
        // Allow spamming drop kick (cancel early)
        this.state.isAttacking = false;
        this.state.isFullBodyAttacking = false;
        this.state.resetTimers();
        this.executeDropKick();
      }
    }
  }

  private executeAttack(type: 'punch' | 'kick' | 'elbow_punch'): void {
    this.state.isAttacking = true;
    this.state.lastAttackType = type;
    this.state.attackCooldown = 0.5;

    if (this.animator.actions[type]) {
      const action = this.animator.actions[type];
      const clipDuration = action.getClip().duration / action.timeScale;
      this.state.attackCooldown = clipDuration;

      if (type === 'punch' || type === 'elbow_punch') {
        // Upper-body only — layers on top of walk/run
        this.state.isFullBodyAttacking = false;
        this.animator.playUpperBodyAction(type);

        // Forward dash
        const fwd = this.controller.cameraForward.clone();
        this.state.velocityY = this.state.velocityY; // Keep vertical
        // Apply horizontal impulse via worldMoveDir
        this.controller.worldMoveDir.copy(fwd).multiplyScalar(4.0);

        // Camera shake + impact effect
        setTimeout(() => {
          const pos = this.getPosition();
          globalEvents.emit('effect:hit', {
            position: pos.clone().add(new THREE.Vector3(0, 1.2, 0)).add(fwd.multiplyScalar(1.0)),
            type: 'impact'
          });
          globalEvents.emit('camera:shake', 0.2);
        }, 200);

        this.state.resetTimers();
        this.state.attackTimeoutId = setTimeout(() => {
          this.state.isAttacking = false;
          this.animator.stopAction(type, true);
        }, (clipDuration * 1000) - 150) as unknown as number;

      } else {
        // Full body (kick)
        this.state.isFullBodyAttacking = true;
        this.animator.playAnimation(type, 0.1);

        this.state.resetTimers();
        this.state.attackTimeoutId = setTimeout(() => {
          this.state.isAttacking = false;
          this.state.isFullBodyAttacking = false;
        }, (clipDuration * 1000) - 150) as unknown as number;
      }

      globalEvents.emit('player:attack', type);
    } else {
      // Procedural fallback
      this.state.startProceduralAnimation(type as any);
      this.state.resetTimers();
      this.state.attackTimeoutId = setTimeout(() => {
        this.state.isAttacking = false;
      }, this.state.proceduralDuration * 1000) as unknown as number;
      globalEvents.emit('player:attack', type);
    }
  }

  private executeDropKick(): void {
    this.state.isAttacking = true;
    this.state.isFullBodyAttacking = true;
    this.state.lastAttackType = 'drop_kick';

    if (this.animator.actions['drop_kick']) {
      const action = this.animator.actions['drop_kick'];
      const clipDuration = action.getClip().duration / action.timeScale;
      this.state.attackCooldown = clipDuration;

      this.animator.playAnimation('drop_kick', 0.15);

      // Physical impulse
      this.state.velocityY = 4.0;
      this.state.grounded = false;

      // Heavy impact effect & shake
      setTimeout(() => {
        const pos = this.getPosition();
        const fwd = this.controller.cameraForward.clone();
        globalEvents.emit('effect:hit', {
          position: pos.clone().add(new THREE.Vector3(0, 0.5, 0)).add(fwd.multiplyScalar(1.5)),
          type: 'impact'
        });
        globalEvents.emit('camera:shake', 0.5);
      }, 350);

      // Sequence into roll after drop kick
      this.state.resetTimers();
      this.state.attackTimeoutId = setTimeout(() => {
        this.animator.playAnimation('roll', 0.1);

        const rollAction = this.animator.actions['roll'];
        const rollDuration = rollAction ? rollAction.getClip().duration / rollAction.timeScale : 0.8;

        this.state.attackTimeoutId = setTimeout(() => {
          this.state.isAttacking = false;
          this.state.isFullBodyAttacking = false;
        }, rollDuration * 1000 - 100) as unknown as number;
      }, (clipDuration * 1000) - 400) as unknown as number;

      globalEvents.emit('player:attack', 'drop_kick');
    } else {
      this.state.resetTimers();
      this.state.attackTimeoutId = setTimeout(() => {
        this.state.isAttacking = false;
        this.state.isFullBodyAttacking = false;
      }, 500) as unknown as number;
    }
  }

  private createPowerUpVFX(color: number = 0xff00aa): void {
    if (!this.powerUpAuraLight) {
      this.powerUpAuraLight = new THREE.PointLight(color, 0, 4);
      this.mesh.add(this.powerUpAuraLight);
    } else {
      this.powerUpAuraLight.color.setHex(color);
    }
    this.powerUpAuraLight.intensity = 5;

    // Fade out logic inside update loop
  }


  public getCameraTarget(): THREE.Object3D { return this.cameraPivot; }

  public getPosition(): THREE.Vector3 {
    const p = this.controller.getPosition(); return new THREE.Vector3(p.x, p.y, p.z);
  }

  public getColliderHandle(): number {
    return this.controller.getColliderHandle();
  }

  public getDamageMultiplier(): number {
    return this.state.damageMultiplier;
  }

  public activatePowerUp(colorHex: number = 0xff00aa, duration: number = 10.0, dmgBoost: number = 1.0): void {
    this.state.isPoweredUp = true;
    this.state.damageMultiplier = dmgBoost;
    this.state.powerUpTimer = duration;
    this.createPowerUpVFX(colorHex);
  }

  public dispose(): void {
    if (this.powerUpAuraLight && this.powerUpAuraLight.parent) {
      this.powerUpAuraLight.parent.remove(this.powerUpAuraLight);
    }
    this.state.resetTimers();
  }

  update(delta: number): void {
    this.state.update(delta);
    if (this.auraMixer) this.auraMixer.update(delta);

    // Combat
    this.handleCombatInput();

    // Physics Update
    this.controller.update(delta);

    // Check for spawn landing (Init sequence)
    if (this.state.grounded && !this.state.hasSpawnLanded) {
      this.state.hasSpawnLanded = true;
      const aura = this.mesh.getObjectByName('SpawnAura');
      if (aura) {
        aura.visible = true;
        setTimeout(() => { aura.visible = false; }, 5000);
      }
      this.state.isFullBodyAttacking = true;
      this.animator.playAnimation('roll', 0.1);

      const rollAction = this.animator.actions['roll'];
      const rollDuration = rollAction ? rollAction.getClip().duration / rollAction.timeScale : 0.8;

      this.state.resetTimers();
      this.state.attackTimeoutId = setTimeout(() => {
        this.state.isAttacking = false;
        this.state.isFullBodyAttacking = false;
      }, rollDuration * 1000 - 100);
    }

    // Sync mesh position to Physics Controller
    // Karena model Arissa origin-nya di pinggang/pelvis (bukan di kaki), 
    // kita perlu naikin mesh-nya biar kakinya nyentuh tanah. 
    // Kalo diset pos.y - 0.9, pinggangnya bakal ada di tanah (nembus).
    const pos = this.controller.getPosition();
    this.mesh.position.set(pos.x, pos.y, pos.z);

    // Animation state machine
    this.updateAnimationState(delta);

    // Animation Update
    this.animator.update(delta);

    // Calculate facing angle based on raw input direction (for snappy turning) or preserve current facing direction
    const targetMoveSq = this.controller.targetMoveDir.lengthSq();
    let targetAngle = 0;

    // We store the target angle on the class to preserve it when standing still
    if (targetMoveSq > 0.001) {
      targetAngle = Math.atan2(this.controller.targetMoveDir.x, this.controller.targetMoveDir.z);
      this._lastFacingAngle = targetAngle;
    } else {
      targetAngle = this._lastFacingAngle || Math.PI; // Default facing
    }

    this._facingQuat.setFromAxisAngle(this._upVec, targetAngle);
    let finalQuat = this._facingQuat;

    // Normal Alignment from PRD
    if (this.meshTargets && this.meshTargets.length > 0) {
      this._rayOrigin.set(pos.x, pos.y + 10, pos.z);
      this._raycaster.set(this._rayOrigin, this._rayDown);

      const hits = this._raycaster.intersectObjects(this.meshTargets, false);
      if (hits.length > 0 && hits[0].face) {
        const hit = hits[0];
        const worldNormal = hit.face!.normal.clone();
        worldNormal.transformDirection(hit.object.matrixWorld);

        // Ensure normal points upwards (avoids upside-down orientation on double-sided meshes)
        if (worldNormal.y < 0) {
          worldNormal.negate();
        }

        this._surfaceNormalQuat.setFromUnitVectors(this._upVec, worldNormal);

        // Combine surface tilt with facing rotation
        finalQuat = this._surfaceNormalQuat.multiply(this._facingQuat);
      }
    }

    // Smoothly interpolate to the final quaternion
    this.mesh.quaternion.slerp(finalQuat, 8 * delta);

    // VFX update
    if (this.powerUpAuraLight && this.state.isPoweredUp) {
      this.powerUpAuraLight.intensity = Math.max(0, this.powerUpAuraLight.intensity - delta * 0.5);
    }
  }

  private updateAnimationState(delta: number): void {
    if (this.state.isKnockedDown) {
      this.animator.playAnimation('stand_up');
    } else if (this.state.proceduralState === 'none' && !this.state.isFullBodyAttacking && !this.state.isAttacking) {
      if (!this.state.grounded) {
        if (this.animator.actions['jump']) {
          this.animator.playAnimation('jump');
        }
      } else if (this.state.currentSpeed > 0.5) { // Smoothed moving threshold
        // Use threshold based on baseSpeed for smooth transitions
        if (this.state.currentSpeed > this.state.baseSpeed + 0.5) {
          this.animator.playAnimation('run', 0.3); // Slower crossfade for run
        } else {
          this.animator.playAnimation('walk', 0.2);
        }
      } else {
        this.animator.playAnimation('idle', 0.3); // Slower crossfade back to idle
      }
    }
  }
}
