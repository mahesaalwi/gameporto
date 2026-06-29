import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import RAPIER from '@dimforge/rapier3d-compat';

export type TreasureType = 'about' | 'expertise' | 'tools' | 'experience';

/**
 * TreasureBox - Interactive collectible that reveals portfolio data.
 * Uses a Rapier sensor collider to detect player proximity.
 */
export class TreasureBox {
  private mesh: THREE.Group;
  private body: RAPIER.RigidBody;
  private sensor: RAPIER.Collider;
  
  private opened: boolean = false;
  private contentType: TreasureType;
  private closeTimer: number = 0;
  private lidTargetRotationX: number = 0;
  private bobOffset: number;
  private particleSystem?: THREE.Points;
  private innerCore?: THREE.Mesh;
  private glowMaterial?: THREE.MeshStandardMaterial;
  private mixer: THREE.AnimationMixer | null = null;
  private openAction: THREE.AnimationAction | null = null;

  // Color map for different content types
  private static readonly COLORS: Record<TreasureType, number> = {
    about: 0x00f0ff,
    expertise: 0xff00aa,
    tools: 0x00ff88,
    experience: 0xffaa00,
  };

  constructor(
    private scene: THREE.Scene,
    private world: RAPIER.World,
    position: THREE.Vector3,
    type: TreasureType,
    model: THREE.Group | null = null,
    meshTargets: THREE.Object3D[] = []
  ) {
    this.contentType = type;
    this.bobOffset = Math.random() * Math.PI * 2; // Random start phase

    const color = TreasureBox.COLORS[type];

    this.mesh = new THREE.Group();

    if (model) {
      // Use provided GLB model
      // We must use SkeletonUtils to properly clone skinned meshes
      const clonedModel = SkeletonUtils.clone(model);
      
      // Auto scale if needed
      const bbox = new THREE.Box3().setFromObject(clonedModel);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      if (size.x > 2) {
        const scale = 1.0 / size.x;
        clonedModel.scale.set(scale, scale, scale);
      }
      
      this.mesh.add(clonedModel);

      // Setup animations if present
      if (model.userData.animations && model.userData.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(clonedModel);
        const clip = model.userData.animations[0];
        this.openAction = this.mixer.clipAction(clip);
        this.openAction.loop = THREE.LoopOnce;
        this.openAction.clampWhenFinished = true;
      }
    } else {
      // Fallback: Procedural Chest base
      const baseGeometry = new THREE.BoxGeometry(1, 0.7, 0.7);
      this.glowMaterial = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.4,
        metalness: 0.8,
        roughness: 0.2,
      });
      const baseMesh = new THREE.Mesh(baseGeometry, this.glowMaterial);
      baseMesh.castShadow = true;
      baseMesh.receiveShadow = true;
      this.mesh.add(baseMesh);

      // Lid (top part)
      const lidGeometry = new THREE.BoxGeometry(1.05, 0.3, 0.75);
      const lidMaterial = new THREE.MeshStandardMaterial({
        color: 0x222244,
        emissive: color,
        emissiveIntensity: 0.2,
        metalness: 0.9,
        roughness: 0.1,
      });
      const lidMesh = new THREE.Mesh(lidGeometry, lidMaterial);
      lidMesh.position.y = 0.5;
      lidMesh.castShadow = true;
      lidMesh.receiveShadow = true;
      this.mesh.add(lidMesh);
    }

    // Lock emblem (small glowing sphere)
    const lockGeometry = new THREE.SphereGeometry(0.12, 8, 8);
    const lockMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: color,
      emissiveIntensity: 1.5,
    });
    const lockMesh = new THREE.Mesh(lockGeometry, lockMaterial);
    lockMesh.position.set(0, 0.3, 0.36);
    this.mesh.add(lockMesh);

    // Inner glowing core (hidden inside, visible when open)
    const coreGeo = new THREE.OctahedronGeometry(0.2, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: color,
      emissiveIntensity: 4.0,
      wireframe: true,
    });
    this.innerCore = new THREE.Mesh(coreGeo, coreMat);
    this.innerCore.position.set(0, 0.4, 0);
    this.mesh.add(this.innerCore);

    // Holographic label
    this.createHolographicLabel(type, color);

    this.mesh.position.copy(position);
    
    // ATUR UKURAN TREASURE BOX DI SINI (Ganti angka 1.5 jadi lebih besar/kecil)
    this.mesh.scale.setScalar(1.5); 
    
    this.scene.add(this.mesh);

    // Create particles
    this.createParticles(color);

    // Raycast to find exact ground level at this X, Z
    let groundY = position.y;
    const ray = new RAPIER.Ray({ x: position.x, y: 1000, z: position.z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, 2000, true);
    if (hit) {
      groundY = 1000 - hit.timeOfImpact + 0.35; // 0.35 is slightly above the chest halfHeight
    }

    // Physics - fixed body so it stays exactly on the terrain
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(position.x, groundY, position.z);
    this.body = this.world.createRigidBody(bodyDesc);

    // Apply Normal Alignment from PRD using THREE.Raycaster
    if (meshTargets.length > 0) {
      const threeRaycaster = new THREE.Raycaster();
      const origin = new THREE.Vector3(position.x, groundY + 10, position.z);
      const direction = new THREE.Vector3(0, -1, 0);
      threeRaycaster.set(origin, direction);
      
      const hits = threeRaycaster.intersectObjects(meshTargets, false);
      if (hits.length > 0 && hits[0].face) {
        const hit = hits[0];
        const worldNormal = hit.face!.normal.clone();
        worldNormal.transformDirection(hit.object.matrixWorld);

        // Ensure normal points upwards (avoids upside-down orientation on double-sided meshes)
        if (worldNormal.y < 0) {
          worldNormal.negate();
        }

        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(up, worldNormal);
        
        // Apply quaternion to visual mesh
        this.mesh.quaternion.copy(quaternion);
      }
    }

    // Solid collider for the chest itself
    const chestColliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.35);
    this.world.createCollider(chestColliderDesc, this.body);

    // Sensor collider for detection (radius 1.5 to ensure it triggers when touching)
    const sensorDesc = RAPIER.ColliderDesc.ball(1.5)
      .setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    this.sensor = this.world.createCollider(sensorDesc, this.body);
  }

  /**
   * Create a holographic text label floating above the chest.
   */
  private createHolographicLabel(type: TreasureType, color: number): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, 256, 64);

    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.fillText(`[ ${type.toUpperCase()} ]`, 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const labelMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.8,
    });
    const label = new THREE.Sprite(labelMaterial);
    label.position.y = 1.5;
    label.scale.set(2, 0.5, 1);
    this.mesh.add(label);
  }

  /**
   * Create floating neon particles around the chest.
   */
  private createParticles(color: number): void {
    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 3;
      positions[i * 3 + 1] = Math.random() * 2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 3;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: color,
      size: 0.08,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });

    this.particleSystem = new THREE.Points(geometry, material);
    this.mesh.add(this.particleSystem);
  }

  /**
   * Update animation each frame.
   */
  update(delta: number): void {
    const time = Date.now() * 0.001 + this.bobOffset;
    const pos = this.body.translation();

    if (this.opened) {
      // Countdown to close
      if (this.closeTimer > 0) {
        this.closeTimer -= delta;
        if (this.closeTimer <= 0) {
          this.close();
        }
      }
      
      // When opened, stick directly to the physics body without bobbing, 
      // but keep rotating to look magical.
      this.mesh.position.set(pos.x, pos.y, pos.z);
      this.mesh.rotation.y += delta * 1.5; // Spin faster when open
      
      if (this.innerCore) {
        this.innerCore.rotation.x += delta * 2;
        this.innerCore.rotation.y += delta * 3;
        this.innerCore.scale.setScalar(1.0 + Math.sin(time * 10) * 0.1);
      }
      
    } else {
      // Floating bob animation when closed
      this.mesh.position.set(pos.x, pos.y + Math.sin(time * 2) * 0.15, pos.z);
      this.mesh.rotation.y += delta * 0.5; // Slow spin
      
      if (this.innerCore) {
        this.innerCore.rotation.y += delta;
        this.innerCore.scale.setScalar(0.5); // Shrink when closed
      }
    }

    if (this.mixer) {
      this.mixer.update(delta);
    }

    // Pulse glow if procedural fallback exists
    if (this.glowMaterial) {
      this.glowMaterial.emissiveIntensity = this.opened ? 1.0 + Math.sin(time * 5) * 0.5 : 0.4 + Math.sin(time * 3) * 0.2;
    }

    // Smoothly animate lid rotation (fallback only)
    if (!this.mixer) {
      const lid = this.mesh.children.length > 2 ? this.mesh.children[1] : null; // Safe fallback check
      if (lid instanceof THREE.Mesh && lid.geometry instanceof THREE.BoxGeometry) {
        // Lerp lid rotation towards target
        lid.rotation.x += (this.lidTargetRotationX - lid.rotation.x) * 10 * delta;
        
        // Slightly shift lid position when open
        const targetY = this.opened ? 0.7 : 0.5;
        const targetZ = this.opened ? -0.2 : 0;
        lid.position.y += (targetY - lid.position.y) * 10 * delta;
        lid.position.z += (targetZ - lid.position.z) * 10 * delta;
      }
    }

    // Rotate particles
    if (this.particleSystem) {
      this.particleSystem.rotation.y += delta * (this.opened ? 1.5 : 0.3);
    }
  }

  /**
   * Mark chest as opened (visual feedback).
   */
  open(): void {
    if (this.opened) return;
    
    this.opened = true;
    this.closeTimer = 6.0; // Stay open for 6 seconds, then reset
    this.lidTargetRotationX = -Math.PI / 2.5; // Open lid target

    if (this.openAction) {
      this.openAction.reset();
      this.openAction.timeScale = 1.0;
      this.openAction.play();
    }
  }

  /**
   * Close the chest to make it reusable.
   */
  close(): void {
    this.opened = false;
    this.lidTargetRotationX = 0; // Close lid target

    if (this.openAction) {
      // Play in reverse to close
      this.openAction.paused = false;
      this.openAction.timeScale = -1.0;
    }
  }

  /**
   * Check if this treasure has been opened.
   */
  isOpened(): boolean {
    return this.opened;
  }

  /**
   * Get the portfolio data type this chest contains.
   */
  getContentType(): TreasureType {
    return this.contentType;
  }

  /**
   * Get the visual mesh group.
   */
  getMesh(): THREE.Group {
    return this.mesh;
  }

  /**
   * Get the sensor collider handle for collision mapping.
   */
  getSensorHandle(): number {
    return this.sensor.handle;
  }

  /**
   * PRD: Strict dispose.
   */
  dispose(): void {
    // Cleanup animation mixer
    if (this.mixer) {
      this.mixer.stopAllAction();
    }

    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
      if (child instanceof THREE.Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      }
      if (child instanceof THREE.Points) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    this.scene.remove(this.mesh);
    this.world.removeRigidBody(this.body);
  }
}
