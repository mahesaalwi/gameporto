import * as THREE from 'three';

/**
 * NeonLighting - Sets up the cyberpunk atmosphere lighting.
 * PRD: Only Ambient and minimal Neon PointLights. No real-time shadows.
 * Enhanced to also push emissive maps on loaded GLB meshes for neon glow.
 */
export class NeonLighting {
  private lights: THREE.Light[] = [];
  private orbs: THREE.Mesh[] = [];

  constructor(private scene: THREE.Scene) {
    this.setupLighting();
  }

  private setupLighting(): void {
    // Ambient - warm base lighting
    const ambient = new THREE.AmbientLight(0xffeedd, 0.8);
    this.scene.add(ambient);
    this.lights.push(ambient);

    // Hemisphere light for natural sky/ground color bounce
    const hemi = new THREE.HemisphereLight(0x87CEEB, 0x335533, 0.6);
    this.scene.add(hemi);
    this.lights.push(hemi);

    // Sun - DirectionalLight for warm daylight (casts character shadow)
    const sun = new THREE.DirectionalLight(0xfffaee, 1.2);
    sun.position.set(50, 100, 30);
    sun.castShadow = true;
    // Shadow camera bounds — covers the full playable area
    sun.shadow.camera.near   = 0.5;
    sun.shadow.camera.far    = 300;
    sun.shadow.camera.left   = -40;
    sun.shadow.camera.right  =  40;
    sun.shadow.camera.top    =  40;
    sun.shadow.camera.bottom = -40;
    // Resolution: 2048 gives crisp shadow, 1024 is lighter on GPU
    sun.shadow.mapSize.width  = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.bias = -0.0005;  // Prevent shadow acne
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.lights.push(sun);
    
    // Optional: Add a subtle warm point light near the center to highlight the path
    const pathLight = new THREE.PointLight(0xffaa00, 1.0, 50);
    pathLight.position.set(0, 5, 0);
    this.scene.add(pathLight);
    this.lights.push(pathLight);
  }

  /**
   * Adjusts materials for a hand-painted fantasy look.
   * Only affects environment/map meshes — skips skinned meshes (character)
   * to preserve their cel-shaded/toon materials.
   */
  enhanceGLBMaterials(group: THREE.Group): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        // Skip skinned meshes (character model) — their materials are handled separately
        if (child instanceof THREE.SkinnedMesh) return;

        const materials = Array.isArray(child.material) ? child.material : [child.material];
        
        materials.forEach((mat) => {
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
            // Hand-painted look: Zero metalness, full roughness (Matte finish)
            mat.metalness = 0.0;
            mat.roughness = 1.0;
            mat.envMapIntensity = 0.0; // Don't reflect the environment at all

            // Fix pitch-black materials
            if (mat.color.getHex() === 0x000000) {
              if (mat.map) mat.color.setHex(0xffffff);
              else mat.color.setHex(0x554433);
            }

            mat.needsUpdate = true;
          }
        });
      }
    });
  }

  /**
   * PRD: Strict dispose.
   */
  dispose(): void {
    for (const light of this.lights) {
      this.scene.remove(light);
    }
    for (const orb of this.orbs) {
      orb.geometry.dispose();
      (orb.material as THREE.Material).dispose();
      this.scene.remove(orb);
    }
    this.lights = [];
    this.orbs = [];
  }
}
