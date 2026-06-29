import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';

THREE.DefaultLoadingManager.addHandler(/\.tga$/i, new TGALoader());

/**
 * AssetLoader - Handles loading and caching of 3D assets.
 * PRD: Uses DRACO compression for .glb models.
 * Uses SkeletonUtils.clone() for proper SkinnedMesh support.
 */
export class AssetLoader {
  private gltfLoader: GLTFLoader;
  private fbxLoader: FBXLoader;
  private dracoLoader: DRACOLoader;
  private textureLoader: THREE.TextureLoader;
  private cache: Map<string, { scene: THREE.Group, animations: THREE.AnimationClip[] }> = new Map();

  constructor() {
    // Setup DRACO decoder for compressed assets
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);

    this.fbxLoader = new FBXLoader();
    this.textureLoader = new THREE.TextureLoader();
  }

  /**
   * Load a GLTF/GLB model.
   * Uses SkeletonUtils.clone() to properly handle SkinnedMesh/Skeleton bindings.
   */
  async loadModel(url: string): Promise<THREE.Group> {
    // Check cache first
    const cached = this.cache.get(url);
    if (cached) {
      // SkeletonUtils.clone properly rebinds skeleton for skinned meshes
      const cloned = SkeletonUtils.clone(cached.scene) as THREE.Group;
      cloned.userData.animations = cached.animations;
      return cloned;
    }

    return new Promise((resolve, reject) => {
      const isFbx = url.toLowerCase().endsWith('.fbx');
      
      if (isFbx) {
        this.fbxLoader.load(
          url,
          (fbx) => {
            console.log(`[AssetLoader] Loaded FBX ${url}:`, fbx);
            let meshCount = 0;
            fbx.traverse((c) => { if (c.type === 'Mesh' || c.type === 'SkinnedMesh') meshCount++; });
            console.log(`[AssetLoader] FBX Mesh count: ${meshCount}`);
            
            this.cache.set(url, { scene: fbx, animations: fbx.animations });
            fbx.userData.animations = fbx.animations;
            resolve(fbx);
          },
          undefined,
          (error) => reject(error)
        );
      } else {
        this.gltfLoader.load(
          url,
          (gltf) => {
            console.log(`[AssetLoader] Loaded GLTF ${url}:`, gltf.scene);
            let meshCount = 0;
            gltf.scene.traverse((c) => { if (c.type === 'Mesh' || c.type === 'SkinnedMesh') meshCount++; });
            console.log(`[AssetLoader] GLTF Mesh count: ${meshCount}`);
            
            this.cache.set(url, { scene: gltf.scene, animations: gltf.animations });
            gltf.scene.userData.animations = gltf.animations;
            resolve(gltf.scene);
          },
          undefined,
          (error) => reject(error)
        );
      }
    });
  }

  /**
   * Load a texture (supports WebP as per PRD).
   */
  async loadTexture(url: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(url, resolve, undefined, reject);
    });
  }

  /**
   * Cleanup loaders.
   */
  dispose(): void {
    this.dracoLoader.dispose();
    this.cache.clear();
  }
}
