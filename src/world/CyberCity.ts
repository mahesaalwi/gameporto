import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { AssetLoader } from '../core/AssetLoader';

/**
 * CyberCity - Loads the cyberpunk GLB map and generates physics colliders.
 * PRD: Load .glb map via AssetLoader, apply PBR material enhancements,
 * generate trimesh/box colliders for physics. No real-time shadows.
 */
export class CyberCity {
  private mapGroup: THREE.Group | null = null;
  private meshes: THREE.Object3D[] = [];
  private bodies: RAPIER.RigidBody[] = [];
  private collidableMeshes: THREE.Object3D[] = [];

  constructor(
    private scene: THREE.Scene,
    private world: RAPIER.World
  ) { }

  /**
   * Async initialization — loads the GLB map and sets up physics.
   */
  async init(assetLoader: AssetLoader): Promise<void> {
    const mapScene = await assetLoader.loadModel('/models/maps/hand_painted_forest.glb');

    mapScene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mapScene);
    const size = new THREE.Vector3();
    // SMART MAP SCALING:
    // If the map is microscopic (e.g. exported in wrong units, size < 10), we force it to 100 units wide.
    // If the map is massive (e.g. has a skybox > 500 units), we leave it alone (scale 1.0) to avoid shrinking the ground to dust.
    let scaleFactor = 1.0;
    if (!box.isEmpty()) {
      box.getSize(size);
      if (size.x > 0.001 && size.x < 10) {
        scaleFactor = 100 / size.x;
        mapScene.scale.setScalar(scaleFactor);
        console.log(`[CyberCity] Map is microscopic (${size.x}), scaling up by ${scaleFactor}`);
      }
    }

    // Enhance materials for cyberpunk PBR look
    this.enhanceMaterials(mapScene);



    // Add to scene
    this.scene.add(mapScene);
    this.meshes.push(mapScene);
    this.mapGroup = mapScene;

    // Collect collidable meshes for camera raycast
    mapScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        this.collidableMeshes.push(child);
      }
    });

    // Generate physics colliders from the map geometry
    this.generatePhysicsColliders(mapScene);

    // Create boundary walls as safety net
    this.createBoundaryWalls();

    // Create ground plane collider (fallback if GLB doesn't have floor geometry)
    this.createGroundCollider();
  }

  /**
   * PRD: Apply PBR material enhancements to loaded GLB meshes.
   * Push emissive for neon signs, set anisotropy on floors, enforce SRGBColorSpace.
   */
  private enhanceMaterials(group: THREE.Group): void {
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const materials = Array.isArray(child.material) ? child.material : [child.material];

      for (const mat of materials) {
        if (!(mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial)) {
          continue;
        }

        // Ensure textures use correct color space and make them double-sided
        // so if player falls under the map, they can still see it.
        if (mat.map) {
          mat.map.colorSpace = THREE.SRGBColorSpace;
        }
        mat.side = THREE.DoubleSide;

        // PRD: Push emissive intensity on meshes that already have emissive maps
        if (mat.emissiveMap) {
          mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 1.5);
        }

        // PRD: Boost emissive on materials with emissive color set
        if (mat.emissive && (mat.emissive.r > 0.1 || mat.emissive.g > 0.1 || mat.emissive.b > 0.1)) {
          mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 1.2);
        }

        // PRD: Anisotropic filtering for floor/road textures
        // Heuristic: if mesh name contains floor/ground/road keywords
        const name = child.name.toLowerCase();
        // const isFoliage = name.includes('tree') || name.includes('leaf') || name.includes('bush') || name.includes('grass');
        if (name.includes('floor') || name.includes('ground') || name.includes('road') || name.includes('street')) {
          if (mat.map) {
            mat.map.anisotropy = 16; // Will be clamped by renderer max
          }
          if (mat.normalMap) {
            mat.normalMap.anisotropy = 16;
          }
        }

        // Map meshes receive character shadow, but don't cast shadows themselves
        // (their baked textures already have AO/shadow info)
        child.castShadow = false;
        child.receiveShadow = true;

        // Ensure material updates
        mat.needsUpdate = true;
      }
    });
  }

  private generatePhysicsColliders(group: THREE.Group): void {
    group.updateMatrixWorld(true);

    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!child.geometry) return;

      const geometry = child.geometry.clone();

      // Skip physics generation for decorative objects like grass
      // Unused variables removed

      // DISABLED: The floor mesh might be named "grass" or use a "grass" material. 
      // Skipping this might remove the floor collision entirely!
      // if (isFoliage) {
      //   return;
      // }

      // Apply world transform to geometry so vertices are correctly scaled/rotated/positioned
      geometry.applyMatrix4(child.matrixWorld);

      // Ensure geometry has position attributes
      const positionAttr = geometry.attributes.position;
      if (!positionAttr) return;

      // Extract vertices safely (handles interleaved buffers in GLTF)
      const vertexCount = positionAttr.count;
      const vertices = new Float32Array(vertexCount * 3);
      for (let i = 0; i < vertexCount; i++) {
        vertices[i * 3] = positionAttr.getX(i);
        vertices[i * 3 + 1] = positionAttr.getY(i);
        vertices[i * 3 + 2] = positionAttr.getZ(i);
      }

      let indices: Uint32Array;
      if (geometry.index) {
        indices = new Uint32Array(geometry.index.array);
      } else {
        // If no index buffer, generate sequential indices
        indices = new Uint32Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) {
          indices[i] = i;
        }
      }

      // Create fixed rigid body at origin (since vertices are already in world space)
      const bodyDesc = RAPIER.RigidBodyDesc.fixed();
      const body = this.world.createRigidBody(bodyDesc);

      try {
        const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
        this.world.createCollider(colliderDesc, body);
        this.bodies.push(body);
      } catch (e) {
        console.warn('Failed to create trimesh for mesh:', child.name, e);
      }
    });
  }

  /**
   * Create invisible boundary walls.
   */
  private createBoundaryWalls(): void {
    const halfSize = 50;
    const wallHeight = 15;
    const walls = [
      { x: 0, z: -halfSize, w: halfSize * 2, d: 1 },
      { x: 0, z: halfSize, w: halfSize * 2, d: 1 },
      { x: -halfSize, z: 0, w: 1, d: halfSize * 2 },
      { x: halfSize, z: 0, w: 1, d: halfSize * 2 },
    ];

    for (const wall of walls) {
      const bodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(wall.x, wallHeight / 2, wall.z);
      const body = this.world.createRigidBody(bodyDesc);
      const colliderDesc = RAPIER.ColliderDesc.cuboid(wall.w / 2, wallHeight / 2, wall.d / 2);
      this.world.createCollider(colliderDesc, body);
      this.bodies.push(body);
    }
  }

  /**
   * Fallback ground collider in case the GLB doesn't cover the full area.
   */
  private createGroundCollider(): void {
    const groundSize = 1000;
    // Create a massive ground collider to prevent tunneling
    // Place it well below 0 (top at -90) so it acts as an absolute safety net without blocking Y=0 raycasts
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0, 0, 0);
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(groundSize / 2, 10, groundSize / 2);
    this.world.createCollider(colliderDesc, body);
    this.bodies.push(body);
  }

  /**
   * Get collidable meshes for camera anti-clipping raycast.
   */
  getCollidableMeshes(): THREE.Object3D[] {
    return this.collidableMeshes;
  }

  /**
   * Get the loaded map group (for scene reference).
   */
  getMapGroup(): THREE.Group | null {
    return this.mapGroup;
  }

  /**
   * PRD: Strict dispose.
   */
  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          }
          // PRD: Dispose textures
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat.map) mat.map.dispose();
          if (mat.normalMap) mat.normalMap.dispose();
          if (mat.roughnessMap) mat.roughnessMap.dispose();
          if (mat.metalnessMap) mat.metalnessMap.dispose();
          if (mat.emissiveMap) mat.emissiveMap.dispose();
        }
      });
      this.scene.remove(mesh);
    }
    for (const body of this.bodies) {
      this.world.removeRigidBody(body);
    }
    this.meshes = [];
    this.bodies = [];
    this.collidableMeshes = [];
    this.mapGroup = null;
  }
}
