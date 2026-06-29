import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { globalEvents } from '../utils/EventEmitter';

/**
 * BossMonster - Final boss entity that must be defeated to reveal client logos.
 * Features health system, attack patterns, and death animation.
 */
export class BossMonster {
  private mesh: THREE.Group;
  private body: RAPIER.RigidBody;
  private sensor: RAPIER.Collider;

  // State
  private health: number = 100;
  private maxHealth: number = 100;
  private isDead: boolean = false;
  private isAggro: boolean = false;

  // Movement
  private moveSpeed: number = 3;
  private attackRange: number = 3;
  private attackCooldown: number = 0;
  private aggroRange: number = 15;

  // Animation state
  private hitFlashTimer: number = 0;

  // Materials
  private bodyMaterial: THREE.MeshStandardMaterial;
  private eyeMaterial: THREE.MeshStandardMaterial;
  private coreMaterial: THREE.MeshStandardMaterial;

  // Health bar (3D billboard)
  private healthBarGroup: THREE.Group;
  private healthBarFill: THREE.Mesh;

  private elapsedTime: number = 0;

  constructor(
    private scene: THREE.Scene,
    private world: RAPIER.World,
    position: THREE.Vector3,
    private camera?: THREE.Camera
  ) {
    this.mesh = new THREE.Group();

    // Boss body - large intimidating form
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x440044,
      emissive: 0x220022,
      metalness: 0.6,
      roughness: 0.4,
    });

    // Main body (large box)
    const bodyGeom = new THREE.BoxGeometry(2, 3, 1.5);
    const bodyMesh = new THREE.Mesh(bodyGeom, this.bodyMaterial);
    bodyMesh.position.y = 1.5;
    this.mesh.add(bodyMesh);

    // Head
    const headGeom = new THREE.BoxGeometry(1.2, 1, 1);
    const headMesh = new THREE.Mesh(headGeom, this.bodyMaterial);
    headMesh.position.y = 3.3;
    this.mesh.add(headMesh);

    // Eyes (two glowing red orbs)
    this.eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 2.0,
    });

    const eyeGeom = new THREE.SphereGeometry(0.15, 8, 8);
    const leftEye = new THREE.Mesh(eyeGeom, this.eyeMaterial);
    leftEye.position.set(-0.3, 3.4, 0.5);
    this.mesh.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeom, this.eyeMaterial);
    rightEye.position.set(0.3, 3.4, 0.5);
    this.mesh.add(rightEye);

    // Core energy (glowing center)
    this.coreMaterial = new THREE.MeshStandardMaterial({
      color: 0xff00ff,
      emissive: 0xff00ff,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.8,
    });

    const coreGeom = new THREE.SphereGeometry(0.4, 16, 16);
    const coreMesh = new THREE.Mesh(coreGeom, this.coreMaterial);
    coreMesh.position.y = 1.5;
    this.mesh.add(coreMesh);

    // Arms
    const armGeom = new THREE.BoxGeometry(0.5, 2, 0.5);
    const leftArm = new THREE.Mesh(armGeom, this.bodyMaterial);
    leftArm.position.set(-1.5, 1.5, 0);
    this.mesh.add(leftArm);

    const rightArm = new THREE.Mesh(armGeom, this.bodyMaterial);
    rightArm.position.set(1.5, 1.5, 0);
    this.mesh.add(rightArm);

    // Health bar
    this.healthBarGroup = new THREE.Group();

    const bgGeom = new THREE.PlaneGeometry(2.5, 0.25);
    const bgMat = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    const bg = new THREE.Mesh(bgGeom, bgMat);
    this.healthBarGroup.add(bg);

    const fillGeom = new THREE.PlaneGeometry(2.4, 0.18);
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0xff0044,
      side: THREE.DoubleSide,
    });
    this.healthBarFill = new THREE.Mesh(fillGeom, fillMat);
    this.healthBarFill.position.z = 0.01;
    this.healthBarGroup.add(this.healthBarFill);

    this.healthBarGroup.position.y = 4.5;
    this.healthBarGroup.visible = false;
    this.mesh.add(this.healthBarGroup);

    this.mesh.position.copy(position);
    this.scene.add(this.mesh);

    // Physics
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position.x, position.y, position.z);
    this.body = this.world.createRigidBody(bodyDesc);

    // Solid collider
    const colliderDesc = RAPIER.ColliderDesc.cuboid(1, 1.5, 0.75);
    this.world.createCollider(colliderDesc, this.body);

    // Sensor for aggro range
    const sensorDesc = RAPIER.ColliderDesc.ball(this.aggroRange)
      .setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    this.sensor = this.world.createCollider(sensorDesc, this.body);
  }

  /**
   * Update boss behavior each frame.
   */
  update(delta: number, playerPosition: THREE.Vector3): void {
    if (this.isDead) return;

    const distance = this.mesh.position.distanceTo(playerPosition);

    // Aggro check
    if (distance < this.aggroRange) {
      this.isAggro = true;
      this.healthBarGroup.visible = true;
    }

    // Handle attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= delta;
    }

    if (this.isAggro && !this.isDead) {
      // Face the player
      const direction = new THREE.Vector3()
        .subVectors(playerPosition, this.mesh.position)
        .normalize();

      const angle = Math.atan2(direction.x, direction.z);
      this.mesh.rotation.y = THREE.MathUtils.lerp(
        this.mesh.rotation.y,
        angle,
        4 * delta
      );

      // Move toward player if outside attack range
      if (distance > this.attackRange) {
        const moveX = direction.x * this.moveSpeed * delta;
        const moveZ = direction.z * this.moveSpeed * delta;
        const currentPos = this.body.translation();

        this.body.setNextKinematicTranslation({
          x: currentPos.x + moveX,
          y: currentPos.y,
          z: currentPos.z + moveZ,
        });

        // Sync mesh
        const pos = this.body.translation();
        this.mesh.position.set(pos.x, pos.y, pos.z);
      } else {
        // In attack range
        if (this.attackCooldown <= 0) {
          this.attackCooldown = 2.0; // Attack every 2 seconds
          globalEvents.emit('boss:attack_player');
        }
      }
    }

    // Health bar billboard
    if (this.camera) {
      this.healthBarGroup.quaternion.copy(this.camera.quaternion);
    } else {
      this.healthBarGroup.lookAt(
        this.mesh.position.x,
        this.mesh.position.y + 10,
        this.mesh.position.z + 10
      );
    }

    // Hit flash animation
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= delta;
      this.bodyMaterial.emissive.setHex(0xff0000);
      this.bodyMaterial.emissiveIntensity = 2.0;
    } else {
      this.bodyMaterial.emissive.setHex(0x220022);
      this.bodyMaterial.emissiveIntensity = 0.5;
    }

    this.elapsedTime += delta;
    const t = this.elapsedTime;

    // Idle breathing animation
    const breathe = Math.sin(t * 2.0) * 0.05;
    this.mesh.children[0].scale.y = 1 + breathe;

    // Eye pulse
    this.eyeMaterial.emissiveIntensity = 1.5 + Math.sin(t * 5.0) * 0.5;

    // Core pulse
    this.coreMaterial.emissiveIntensity = 0.8 + Math.sin(t * 3.0) * 0.4;
  }

  /**
   * Apply damage to the boss.
   */
  takeDamage(amount: number): void {
    if (this.isDead) return;

    this.health -= amount;
    this.hitFlashTimer = 0.15;

    // Update health bar
    const healthPercent = Math.max(0, this.health / this.maxHealth);
    this.healthBarFill.scale.x = healthPercent;
    this.healthBarFill.position.x = -(1 - healthPercent) * 1.2;

    if (this.health <= 0) {
      this.die();
    }
  }

  /**
   * Boss death sequence.
   */
  private die(): void {
    this.isDead = true;
    this.healthBarGroup.visible = false;

    // Death animation: collapse and fade
    const collapse = () => {
      this.mesh.scale.y *= 0.92;
      this.mesh.position.y -= 0.02;
      this.bodyMaterial.opacity *= 0.95;

      if (this.mesh.scale.y > 0.05) {
        requestAnimationFrame(collapse);
      } else {
        this.mesh.visible = false;
        globalEvents.emit('boss:defeated');
      }
    };

    this.bodyMaterial.transparent = true;
    collapse();
  }

  /**
   * Get boss position.
   */
  getPosition(): THREE.Vector3 {
    return this.mesh.position.clone();
  }

  /**
   * Get sensor handle for collision mapping.
   */
  getSensorHandle(): number {
    return this.sensor.handle;
  }

  /**
   * PRD: Strict dispose.
   */
  dispose(): void {
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
    this.scene.remove(this.mesh);
    this.world.removeRigidBody(this.body);
  }
}
