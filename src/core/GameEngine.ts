import * as THREE from 'three';

import RAPIER from '@dimforge/rapier3d-compat';
import { CustomChaseCamera } from './CustomChaseCamera';
import { InputManager } from './InputManager';
import { AssetLoader } from './AssetLoader';
import { AnimationManager } from './AnimationManager';
import { Player } from '../entities/Player';
import { GAME_CONSTANTS } from '../data/constants';
import { CyberCity } from '../world/CyberCity';
import { NeonLighting } from '../world/NeonLighting';
import { TreasureBox } from '../entities/TreasureBox';
import { BossMonster } from '../entities/BossMonster';
import { UIManager } from '../ui/UIManager';
import { MobileControls } from '../ui/MobileControls';
import { CloudSystem } from '../world/CloudSystem';
import { globalEvents } from '../utils/EventEmitter';

/**
 * GameEngine - Main orchestrator for the game loop, rendering, and physics.
 * Manages the Three.js scene, Rapier physics world, and all game entities.
 */
export class GameEngine {
  // Three.js core
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private clock: THREE.Clock = new THREE.Clock();

  // Physics
  private physicsWorld!: RAPIER.World;
  private eventQueue!: RAPIER.EventQueue;

  // Systems
  private chaseCamera!: CustomChaseCamera;
  private inputManager!: InputManager;
  private assetLoader!: AssetLoader;
  private animationManager!: AnimationManager;
  private uiManager!: UIManager;
  private mobileControls: MobileControls | null = null;

  // Entities
  private player!: Player;
  private cyberCity!: CyberCity;
  private neonLighting!: NeonLighting;
  private cloudSystem!: CloudSystem;
  private treasureBoxes: TreasureBox[] = [];
  private boss!: BossMonster;

  // State
  private animationFrameId: number = 0;
  private isRunning: boolean = false;
  private isBossAreaActive: boolean = false;
  private bossDefeated: boolean = false;

  private readonly FIXED_TIMESTEP = 1 / 60;
  private physicsAccumulator = 0;

  // Collider-to-entity map for collision resolution
  private colliderEntityMap: Map<number, { type: string; entity: TreasureBox | BossMonster }> = new Map();

  constructor(private container: HTMLElement) { }

  /**
   * Initialize all engine systems. Must be called before start().
   */
  async init(): Promise<void> {
    // Initialize Rapier WASM
    await RAPIER.init();

    // Create physics world with gravity
    const { x, y, z } = GAME_CONSTANTS.PHYSICS.GRAVITY;
    const gravity = new RAPIER.Vector3(x, y, z);
    this.physicsWorld = new RAPIER.World(gravity);
    this.eventQueue = new RAPIER.EventQueue(true);

    // Setup Three.js renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // PRD: Hard limit pixel ratio to prevent 4K rendering on retina
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.shadowMap.enabled = true;       // Enable for character shadow
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadow edges
    this.container.appendChild(this.renderer.domElement);

    // Create scene - Natural daytime sky color
    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x87CEEB); // Light Sky Blue
    this.scene.background = skyColor;

    // Note: Removed RoomEnvironment because hand-painted textures should not reflect studio lighting.
    // The environment property is left undefined so materials remain purely matte.
    // No fog so the whole map is visible to the horizon

    // Initialize systems
    this.inputManager = new InputManager();
    this.assetLoader = new AssetLoader();
    this.animationManager = new AnimationManager(this.assetLoader);

    // Attach input manager to renderer canvas for pointer lock + touch events
    this.inputManager.attachToCanvas(this.renderer.domElement);

    // Initialize GTA 5 style chase camera
    this.chaseCamera = new CustomChaseCamera(this.renderer, this.inputManager);

    this.uiManager = new UIManager();

    // Mobile detection
    if (this.isMobile()) {
      this.mobileControls = new MobileControls(this.inputManager);
    }

    // Build world - lighting and clouds
    this.neonLighting = new NeonLighting(this.scene);
    this.cloudSystem = new CloudSystem(this.scene);

    // Build world - async GLB map loading
    this.cyberCity = new CyberCity(this.scene, this.physicsWorld);
    await this.cyberCity.init(this.assetLoader);

    // PRD: Calculate accurate player spawn height based on terrain
    // TENTUKAN POSISI JATUH (X dan Z) DI SINI:
    const spawnX = 0;
    const spawnZ = 0;

    // Update query pipeline to ensure newly added map colliders are hit by raycast
    this.physicsWorld.step();

    // Raycast dinyalain biar kakinya napak persis di daratan. 
    // Ditembak dari Y=1000 biar nggak nembus kalo pulaunya tinggi banget.
    const ray = new RAPIER.Ray({ x: spawnX, y: 1000, z: spawnZ }, { x: 0, y: -1, z: 0 });
    const hit = this.physicsWorld.castRay(ray, 2000, true);
    console.log('[GameEngine] Raycast hit:', hit ? `Hit at ${1000 - hit.timeOfImpact}` : 'No hit');
    // Tambah 2.0 dari titik tabrakan biar ada jarak aman ekstra.
    // Kalo daratannya miring, spawn terlalu ngepas (0.91) bisa bikin ujung kapsul nyangkut di tanah.
    const spawnY = hit ? (1000 - hit.timeOfImpact + 2.0) : 10;

    const spawnPos = new THREE.Vector3(spawnX, spawnY, spawnZ);

    // Enhance GLB materials with neon lighting
    const mapGroup = this.cyberCity.getMapGroup();
    if (mapGroup) {
      this.neonLighting.enhanceGLBMaterials(mapGroup);
    }

    // Set camera collision objects from loaded map
    this.chaseCamera.setCollisionObjects(this.cyberCity.getCollidableMeshes());

    let playerModel: THREE.Group | null = null;
    try {
      const modelPath = GAME_CONSTANTS.ASSETS.MODELS.PLAYER;
      playerModel = await this.assetLoader.loadModel(modelPath);

      // Load additional animations using AnimationManager
      const customClips = await this.animationManager.loadPlayerAnimations();
      if (!playerModel.userData.animations) playerModel.userData.animations = [];
      playerModel.userData.animations.push(...customClips);

      // SMART PLAYER SCALING:
      // Mixamo FBX can be in cm (160) or meters (1.6). SkinnedMesh Box3 can also glitch to Infinity.
      playerModel.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(playerModel);
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();

      let scale = 0.01; // fallback
      if (!box.isEmpty()) {
        box.getSize(size);
        box.getCenter(center);
        playerModel.position.set(-center.x, -box.min.y, -center.z);

        // If size is reasonable (not glitching to thousands), auto scale it to 1.6m tall
        if (size.y > 0.1 && size.y < 500) {
          scale = 1.6 / size.y;
          console.log(`[GameEngine] Player size is ${size.y}, auto-scaling by ${scale}`);
        } else {
          console.log(`[GameEngine] Player size glitched or massive (${size.y}), using fallback scale 0.01`);
        }
      } else {
        playerModel.position.set(0, 0, 0);
      }

      const wrapper = new THREE.Group();
      wrapper.add(playerModel);
      wrapper.scale.setScalar(scale);

      // Align character feet precisely to the bottom of the physics capsule.
      // The capsule has halfHeight 0.5 and radius 0.4, so its bottom is 0.9 units below the center.
      // We also add a visual offset to prevent models from clipping into the ground.
      const yOffset = -GAME_CONSTANTS.PLAYER.CAPSULE_BOTTOM_OFFSET + (GAME_CONSTANTS.PLAYER.MODEL_Y_OFFSET || 0);
      wrapper.position.set(0, yOffset, 0);

      if (playerModel.userData.animations && playerModel.userData.animations.length > 0) {
        if (modelPath.includes('kgirls') || modelPath.includes('scene')) {
          const animations = playerModel.userData.animations as THREE.AnimationClip[];
          const processedAnims: THREE.AnimationClip[] = [];

          // kgirls.glb and scene.gltf have one combined clip Take 001 (16.8s)
          const masterClip = animations[0];
          const fps = 30;

          // Use safer, shorter slices to prevent overlap (idle running glitch)
          const clipData = [
            { name: 'idle', start: 0, end: 2 },
            { name: 'walk', start: 3.5, end: 4.8 },
            { name: 'run', start: 5.5, end: 6.8 },
            { name: 'punch', start: 7.5, end: 9 },
            { name: 'kick', start: 9.5, end: 11 }
          ];

          for (const data of clipData) {
            const startFrame = Math.floor(data.start * fps);
            const endFrame = Math.floor(data.end * fps);
            const subClip = THREE.AnimationUtils.subclip(masterClip, data.name, startFrame, endFrame, fps);
            processedAnims.push(subClip);
          }

          wrapper.userData.animations = processedAnims;
          wrapper.userData.masterClip = masterClip;
        } else {
          // Arissa or other models with proper animations
          wrapper.userData.animations = playerModel.userData.animations;
        }
      } else {
        wrapper.userData.animations = [];
      }
      try {
        const aura = await this.assetLoader.loadModel(GAME_CONSTANTS.ASSETS.MODELS.AURA);
        aura.name = 'SpawnAura';

        // Aura scaling & positioning
        aura.scale.set(2, 2, 2); // Make it slightly larger
        aura.position.set(0, 0, 0); // Center at feet

        // Fix effect materials (common for GLB effect files)
        aura.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.frustumCulled = false; // Always render
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach(mat => {
                mat.transparent = true;
                mat.depthWrite = false;
                mat.side = THREE.DoubleSide;
                if (mat instanceof THREE.MeshStandardMaterial) {
                  mat.emissiveIntensity = 2.0; // Glow effect
                  if (mat.map && mat.color.getHex() === 0x000000) {
                    mat.color.setHex(0xffffff);
                  }
                }
              });
            }
          }
        });

        aura.visible = false; // Hide by default until spawn
        wrapper.add(aura);
      } catch (e) {
        console.warn('Failed to load aura effect', e);
      }

      playerModel = wrapper;

      // Enhance character materials for cel-shaded look
      // Fix black materials but preserve toon shading style
      playerModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.frustumCulled = false;
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      if (this.cyberCity) {
        this.cyberCity.getMapGroup()?.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.computeBoundingSphere();
          }
        });
      }



    } catch (e: any) {
      console.warn('Failed to load anime character model, falling back to procedural mesh', e);

      // DEBUG: Show error on screen so I can see it in screenshots!
      const errorDiv = document.createElement('div');
      errorDiv.style.position = 'absolute';
      errorDiv.style.top = '10px';
      errorDiv.style.left = '10px';
      errorDiv.style.color = 'red';
      errorDiv.style.backgroundColor = 'black';
      errorDiv.style.padding = '10px';
      errorDiv.style.zIndex = '9999';
      errorDiv.innerText = `Model Load Error: ${e.message || e}`;
      document.body.appendChild(errorDiv);
    }
    // Create player
      this.player = new Player(
        this.scene,
        this.physicsWorld,
        this.inputManager,
        playerModel,
        spawnPos,
        this.cyberCity.getCollidableMeshes()
      );

    // Load custom mystery box model and extract variants
    const boxModels: Record<string, THREE.Group> = {};
    try {
      const glbScene = await this.assetLoader.loadModel(GAME_CONSTANTS.ASSETS.MODELS.BOXES);

      // Enhance materials to support shadows
      glbScene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // Find the 4 boxes
      const boxNames = [
        'humanitarian_box_01',
        'humanitarian_box_02',
        'humanitarian_box_03',
        'humanitarian_box_04'
      ];

      let index = 0;
      const types = ['about', 'expertise', 'tools', 'experience'];

      boxNames.forEach((name) => {
        let foundBox: THREE.Object3D | null = null;
        glbScene.traverse((child) => {
          if (child.name.includes(name) && child.parent?.name.includes('Root')) {
            foundBox = child;
          }
        });

        // Fallback if exact tree differs
        if (!foundBox) {
          glbScene.traverse((child) => {
            if (child.name === name) foundBox = child;
          });
        }

        if (foundBox && index < types.length) {
          const type = types[index];
          const newGroup = new THREE.Group();
          const clonedBox = (foundBox as THREE.Object3D).clone();

          // Calculate bounding box of the clone
          const tempGroup = new THREE.Group();
          tempGroup.add(clonedBox);
          const bbox = new THREE.Box3().setFromObject(tempGroup);
          const center = new THREE.Vector3();
          bbox.getCenter(center);

          // Wrap in an offset group so animations on clonedBox don't overwrite our centering
          const offsetGroup = new THREE.Group();
          offsetGroup.position.sub(center);
          offsetGroup.position.y += (bbox.max.y - bbox.min.y) / 2; // Sit on bottom
          offsetGroup.add(clonedBox);

          newGroup.add(offsetGroup);
          // Scale it up significantly so it's clearly visible in the world
          newGroup.scale.setScalar(2.5);

          boxModels[type] = newGroup;
          index++;
        }
      });

    } catch (e) {
      console.warn('Failed to load mystery box model variants', e);
    }

    // Create treasure boxes with different content types
    const treasureConfigs = GAME_CONSTANTS.WORLD.TREASURE_CONFIGS.map(cfg => ({
      position: new THREE.Vector3(cfg.x, cfg.y, cfg.z),
      type: cfg.type,
    }));

    for (const config of treasureConfigs) {
      const box = new TreasureBox(
        this.scene,
        this.physicsWorld,
        config.position,
        config.type,
        boxModels[config.type] || null,
        this.cyberCity.getCollidableMeshes()
      );
      this.treasureBoxes.push(box);
      // Map sensor collider handle to treasure box for collision lookup
      this.colliderEntityMap.set(box.getSensorHandle(), { type: 'treasure', entity: box });
      console.log(`Created treasure box '${config.type}' at`, config.position);
    }

    // Create boss (placed further away, lazy-loaded concept)
    this.boss = new BossMonster(
      this.scene,
      this.physicsWorld,
      new THREE.Vector3(0, 1, -30),
      this.chaseCamera.getCamera()
    );
    this.colliderEntityMap.set(this.boss.getSensorHandle(), { type: 'boss', entity: this.boss });

    // Setup camera to follow player
    this.chaseCamera.setTarget(this.player.getCameraTarget());

    // Event listeners
    this.setupGameEvents();

    // Resize handler
    window.addEventListener('resize', this.onResize);

    // Visibility change for tab-hidden optimization (PRD requirement)
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  /**
   * Start the game loop.
   */
  start(): void {
    this.isRunning = true;
    this.uiManager.hideLoading();
    this.uiManager.playFadeIn();

    // Show intro dialogue slightly after loading screen hides
    setTimeout(() => {
      this.uiManager.showIntroDialogue();
    }, 1000);

    this.gameLoop();
  }

  /**
   * Main game loop - 60fps tick
   */
  private gameLoop = (): void => {
    if (!this.isRunning) return;
    this.animationFrameId = requestAnimationFrame(this.gameLoop);

    const delta = this.clock.getDelta();
    const clampedDelta = Math.min(delta, 0.05); // Clamp to prevent spiral of death

    this.physicsAccumulator += clampedDelta;
    while (this.physicsAccumulator >= this.FIXED_TIMESTEP) {
      this.physicsWorld.timestep = this.FIXED_TIMESTEP;
      this.physicsWorld.step(this.eventQueue);
      this.physicsAccumulator -= this.FIXED_TIMESTEP;
    }

    // Pass camera directions to player for camera-relative movement (GTA style)
    this.player.setCameraDirections(
      this.chaseCamera.getForwardDirection(),
      this.chaseCamera.getRightDirection()
    );

    // Update entities
    const playerPos = this.player.getPosition();
    this.player.update(clampedDelta);
    this.boss.update(clampedDelta, playerPos);
    if (this.cloudSystem) this.cloudSystem.update(clampedDelta);

    // Update treasure box animations and check distance to player
    for (const box of this.treasureBoxes) {
      box.update(clampedDelta);

      // Bulletproof distance-based interaction check (radius 1.5)
      if (!box.isOpened()) {
        const boxPos = box.getMesh().position;
        // Ignore Y for distance check so jumping doesn't break it
        const dist = Math.hypot(playerPos.x - boxPos.x, playerPos.z - boxPos.z);
        if (dist < GAME_CONSTANTS.WORLD.TREASURE_INTERACT_RADIUS) {
          box.open();
          const contentType = box.getContentType();
          globalEvents.emit('treasure:open', contentType);

          // Activate power-up on player with matching treasure color
          const color = GAME_CONSTANTS.UI.POWER_UP_COLORS[contentType] || 0xffffff;
          this.player.activatePowerUp(
            color,
            GAME_CONSTANTS.COMBAT.POWER_UP.DURATION_SEC,
            GAME_CONSTANTS.COMBAT.POWER_UP.DAMAGE_MULTIPLIER
          );
          globalEvents.emit('powerup:collected', contentType);
        }
      }
    }

    // Process other collision events (boss, etc)
    this.processCollisions();

    // Update camera
    this.chaseCamera.update(clampedDelta);

    // Render
    this.renderer.render(this.scene, this.chaseCamera.getCamera());
  };

  /**
   * Process Rapier collision events (sensors).
   */
  private processCollisions(): void {
    this.eventQueue.drainCollisionEvents((handle1: number, handle2: number, started: boolean) => {
      if (!started) return;

      const playerHandle = this.player.getColliderHandle();

      // Check if one of the handles is the player
      const otherHandle = handle1 === playerHandle ? handle2 :
        handle2 === playerHandle ? handle1 : null;

      if (otherHandle === null) return;

      const entityInfo = this.colliderEntityMap.get(otherHandle);
      if (!entityInfo) return;

      if (entityInfo.type === 'boss' && !this.isBossAreaActive) {
        this.isBossAreaActive = true;
        globalEvents.emit('boss:encounter');
      }
    });
  }

  /**
   * Setup game-level events via EventEmitter.
   */
  private setupGameEvents(): void {
    globalEvents.on('boss:defeated', () => {
      this.bossDefeated = true;
      globalEvents.emit('clients:show');
    });

    globalEvents.on('boss:attack_player', () => {
      if (this.isBossAreaActive && !this.bossDefeated) {
        // Player takes damage and gets knocked down if close enough
        const distance = this.player.getPosition().distanceTo(this.boss.getPosition());
        if (distance < GAME_CONSTANTS.COMBAT.BOSS_HIT_RANGE) {
          this.player.takeDamage(GAME_CONSTANTS.COMBAT.BOSS_DAMAGE);
        }
      }
    });

    globalEvents.on('player:attack', () => {
      if (this.isBossAreaActive && !this.bossDefeated) {
        const playerPos = this.player.getPosition();
        const bossPos = this.boss.getPosition();
        const distance = playerPos.distanceTo(bossPos);
        if (distance < GAME_CONSTANTS.COMBAT.PLAYER_HIT_RANGE) {
          // Apply damage with player's power-up multiplier
          const baseDamage = GAME_CONSTANTS.COMBAT.BASE_DAMAGE;
          const finalDamage = Math.round(baseDamage * this.player.getDamageMultiplier());
          this.boss.takeDamage(finalDamage);
        }
      }
    });

    // Object pool for hit effects to prevent GC pauses
    const hitEffectPool: { mesh: THREE.Mesh, mat: THREE.MeshBasicMaterial, active: boolean }[] = [];
    const maxEffects = 5;
    const geom = new THREE.SphereGeometry(0.3, 8, 8);

    for (let i = 0; i < maxEffects; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      hitEffectPool.push({ mesh, mat, active: false });
    }

    globalEvents.on('effect:hit', (data: any) => {
      // Find an inactive effect from the pool
      const effect = hitEffectPool.find(e => !e.active);
      if (!effect) return; // Drop effect if pool is full (avoids allocations during spam)

      effect.active = true;
      effect.mesh.position.copy(data.position);
      effect.mesh.scale.setScalar(1.0);
      effect.mat.opacity = 0.8;
      effect.mesh.visible = true;

      // Animate it out
      let scale = 1.0;
      let opacity = 0.8;
      const animateEffect = () => {
        if (!effect.active) return;

        scale += 0.2;
        opacity -= 0.05;
        effect.mesh.scale.setScalar(scale);
        effect.mat.opacity = opacity;

        if (opacity > 0) {
          requestAnimationFrame(animateEffect);
        } else {
          effect.mesh.visible = false;
          effect.active = false;
        }
      };
      animateEffect();
    });
  }

  /**
   * Handle window resize.
   */
  private onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.chaseCamera.onResize();
  };

  /**
   * PRD: Cancel animation frame when tab is hidden to prevent background GPU usage.
   */
  private onVisibilityChange = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.animationFrameId);
      this.isRunning = false;
      this.clock.stop();
    } else {
      this.isRunning = true;
      this.clock.start();
      this.gameLoop();
    }
  };

  /**
   * Detect mobile device.
   */
  private isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || window.innerWidth < 768;
  }

  /**
   * PRD: Memory Leak Prevention - Dispose all resources.
   */
  dispose(): void {
    this.isRunning = false;
    cancelAnimationFrame(this.animationFrameId);

    // Remove event listeners
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    // Dispose entities
    this.player.dispose();
    this.boss.dispose();
    for (const box of this.treasureBoxes) {
      box.dispose();
    }
    this.cyberCity.dispose();
    this.neonLighting.dispose();

    // Dispose systems
    this.inputManager.dispose();
    this.assetLoader.dispose();
    this.uiManager.dispose();
    this.mobileControls?.dispose();
    this.chaseCamera.dispose();

    // Dispose renderer
    this.renderer.dispose();
    this.renderer.domElement.remove();

    // Clear physics
    this.physicsWorld.free();

    // Clear event bus
    globalEvents.removeAllListeners();
    this.colliderEntityMap.clear();
  }
}
