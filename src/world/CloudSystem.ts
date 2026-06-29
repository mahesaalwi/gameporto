import * as THREE from 'three';

export class CloudSystem {
  private clouds: THREE.Group[] = [];
  private scene: THREE.Scene;
  private readonly cloudSpeed = 1.5;
  private readonly bounds = 200;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.createClouds();
  }

  private createClouds() {
    const cloudCount = 15;
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1.0,
      flatShading: true,
      transparent: true,
      opacity: 0.9,
    });

    const geometry = new THREE.DodecahedronGeometry(1, 0); // Low-poly sphere

    for (let i = 0; i < cloudCount; i++) {
      const cloud = new THREE.Group();
      
      // Each cloud is a cluster of 3-6 low-poly spheres
      const parts = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < parts; j++) {
        const mesh = new THREE.Mesh(geometry, material);
        
        // Randomize position within the cloud cluster
        mesh.position.set(
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 5
        );
        
        // Randomize scale of each part
        const scale = 2 + Math.random() * 3;
        mesh.scale.set(scale, scale * 0.6, scale); // Flatter on the Y axis
        
        // Random rotation for variety
        mesh.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        );
        
        cloud.add(mesh);
      }

      // Position the cloud in the sky
      cloud.position.set(
        (Math.random() - 0.5) * this.bounds,
        40 + Math.random() * 20, // Height between 40 and 60
        (Math.random() - 0.5) * this.bounds
      );

      // Random scale for the entire cloud
      const cloudScale = 1 + Math.random() * 1.5;
      cloud.scale.setScalar(cloudScale);

      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  update(delta: number) {
    for (const cloud of this.clouds) {
      // Move clouds slowly along the X axis
      cloud.position.x += this.cloudSpeed * delta;
      
      // Slowly rotate the entire cloud for a dynamic feel
      cloud.rotation.y += 0.05 * delta;

      // Wrap around if they go out of bounds
      if (cloud.position.x > this.bounds / 2) {
        cloud.position.x = -this.bounds / 2;
        cloud.position.z = (Math.random() - 0.5) * this.bounds; // randomize z when wrapping
      }
    }
  }
}
