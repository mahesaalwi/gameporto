import * as THREE from 'three';
import { InputManager } from './InputManager';
import { globalEvents } from '../utils/EventEmitter';

/**
 * CustomChaseCamera - GTA 5 style third-person chase camera.
 * PRD: Cinematic, responsive camera with free orbit, smooth LERP damping,
 * and raycast-based anti-clipping collision detection.
 */
export class CustomChaseCamera {
  private camera: THREE.PerspectiveCamera;
  private target: THREE.Object3D | null = null;

  // Orbit state (spherical coordinates around pivot)
  private spherical: THREE.Spherical = new THREE.Spherical(3.0, Math.PI / 2.1, Math.PI);
  private targetSpherical: THREE.Spherical = new THREE.Spherical(3.0, Math.PI / 2.1, Math.PI);

  // Configuration
  private readonly defaultRadius: number = 3.0;
  private readonly minRadius: number = 1.5;
  // maxRadius reserved for scroll-zoom feature
  private readonly minPolarAngle: number = THREE.MathUtils.degToRad(15);  // Don't look under map
  private readonly maxPolarAngle: number = THREE.MathUtils.degToRad(85);  // Don't go fully overhead
  private readonly orbitSensitivity: number = 0.003;
  private readonly smoothSpeed: number = 5.0;
  private readonly collisionPadding: number = 0.3;

  // Pivot offset from target (chest/head height)
  private readonly pivotOffset: THREE.Vector3 = new THREE.Vector3(0, 1.4, 0);

  // Pre-allocated vectors to avoid GC
  private pivotPosition: THREE.Vector3 = new THREE.Vector3();
  private desiredCameraPos: THREE.Vector3 = new THREE.Vector3();
  private currentLookAt: THREE.Vector3 = new THREE.Vector3();
  private rayDirection: THREE.Vector3 = new THREE.Vector3();
  private _forward: THREE.Vector3 = new THREE.Vector3();
  private _right: THREE.Vector3 = new THREE.Vector3();
  private _up: THREE.Vector3 = new THREE.Vector3(0, 1, 0);

  // Collision raycaster
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private collisionObjects: THREE.Object3D[] = [];

  // Camera Shake
  private shakeIntensity: number = 0;
  private readonly shakeDecay: number = 1.0;


  constructor(
    _renderer: THREE.WebGLRenderer,
    private input: InputManager
  ) {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 10000);
    this.camera.position.set(0, 10, 15);
    this.camera.lookAt(0, 0, 0);

    // Initialize spherical
    this.spherical.set(this.defaultRadius, Math.PI / 2.1, Math.PI);
    this.targetSpherical.copy(this.spherical);

    globalEvents.on('camera:shake', (intensity: any) => {
      this.shakeIntensity = Math.max(this.shakeIntensity, intensity as number);
    });
  }


  /**
   * Set collidable objects for camera anti-clipping.
   * Call this after loading the map.
   */
  setCollisionObjects(objects: THREE.Object3D[]): void {
    this.collisionObjects = objects;
  }

  /**
   * Set the target the camera should orbit around.
   */
  setTarget(target: THREE.Object3D): void {
    this.target = target;
  }

  /**
   * Get the camera's forward direction projected on XZ plane (for camera-relative movement).
   */
  getForwardDirection(): THREE.Vector3 {
    this.camera.getWorldDirection(this._forward);
    this._forward.y = 0;
    this._forward.normalize();
    return this._forward;
  }

  /**
   * Get the camera's right direction projected on XZ plane.
   */
  getRightDirection(): THREE.Vector3 {
    this._right.crossVectors(this.getForwardDirection(), this._up).normalize();
    return this._right;
  }

  update(delta: number): void {
    if (!this.target) return;

    // 1. Process mouse/touch input for orbit
    this.processOrbitInput();

    // 2. Smooth interpolation of spherical coordinates
    this.spherical.theta = THREE.MathUtils.lerp(
      this.spherical.theta,
      this.targetSpherical.theta,
      this.smoothSpeed * delta
    );
    this.spherical.phi = THREE.MathUtils.lerp(
      this.spherical.phi,
      this.targetSpherical.phi,
      this.smoothSpeed * delta
    );
    this.spherical.radius = THREE.MathUtils.lerp(
      this.spherical.radius,
      this.targetSpherical.radius,
      this.smoothSpeed * delta
    );

    // 3. Calculate pivot position (target + chest offset)
    this.target.updateWorldMatrix(true, false);
    this.target.getWorldPosition(this.pivotPosition);
    this.pivotPosition.add(this.pivotOffset);

    // 4. Calculate desired camera position from spherical coordinates
    this.desiredCameraPos.setFromSpherical(this.spherical);
    this.desiredCameraPos.add(this.pivotPosition);

    // 5. Camera collision detection (anti-clipping)
    const finalRadius = this.checkCameraCollision(this.pivotPosition, this.desiredCameraPos);
    if (finalRadius < this.spherical.radius) {
      // Recalculate with reduced radius
      const clampedSpherical = this.spherical.clone();
      clampedSpherical.radius = finalRadius;
      this.desiredCameraPos.setFromSpherical(clampedSpherical);
      this.desiredCameraPos.add(this.pivotPosition);
    }

    // 6. Apply camera shake if active
    if (this.shakeIntensity > 0) {
      this.desiredCameraPos.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.desiredCameraPos.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.desiredCameraPos.z += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity -= this.shakeDecay * delta;
      if (this.shakeIntensity < 0) this.shakeIntensity = 0;
    }

    // 7. Set camera position strictly to avoid jitter
    this.camera.position.copy(this.desiredCameraPos);

    // 7. Look at pivot point
    this.currentLookAt.copy(this.pivotPosition);
    this.camera.lookAt(this.currentLookAt);
  }

  /**
   * Process mouse/touch delta for orbit rotation.
   */
  private processOrbitInput(): void {
    const mouseDelta = this.input.getMouseDelta();

    if (Math.abs(mouseDelta.x) > 0.001 || Math.abs(mouseDelta.y) > 0.001) {
      // Horizontal orbit (theta) — invert for natural feel
      this.targetSpherical.theta -= mouseDelta.x * this.orbitSensitivity;

      // Vertical orbit (phi) — clamp to prevent under/over map
      this.targetSpherical.phi -= mouseDelta.y * this.orbitSensitivity;
      this.targetSpherical.phi = THREE.MathUtils.clamp(
        this.targetSpherical.phi,
        this.minPolarAngle,
        this.maxPolarAngle
      );
    }

    // Reset radius to default (zoom handled via collision)
    this.targetSpherical.radius = this.defaultRadius;

    // Consume the delta so it doesn't accumulate
    this.input.consumeMouseDelta();
  }

  /**
   * Raycast from pivot to desired camera pos to detect obstacles.
   * Returns the safe radius (distance from pivot to first obstacle).
   */
  private checkCameraCollision(pivot: THREE.Vector3, desiredPos: THREE.Vector3): number {
    if (this.collisionObjects.length === 0) {
      return this.spherical.radius;
    }

    this.rayDirection.copy(desiredPos).sub(pivot).normalize();
    const fullDistance = pivot.distanceTo(desiredPos);

    this.raycaster.set(pivot, this.rayDirection);
    this.raycaster.far = fullDistance;
    this.raycaster.near = 0;

    const intersects = this.raycaster.intersectObjects(this.collisionObjects, true);

    if (intersects.length > 0) {
      // Found obstacle — zoom in closer
      const hitDistance = intersects[0].distance - this.collisionPadding;
      return Math.max(hitDistance, this.minRadius);
    }

    return fullDistance;
  }

  /**
   * Handle window resize.
   */
  onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Get the camera instance for rendering.
   */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /**
   * Cleanup.
   */
  dispose(): void {
    this.target = null;
    this.collisionObjects = [];
  }
}
