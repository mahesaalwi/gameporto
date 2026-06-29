import * as THREE from 'three';
import type { PlayerState } from './PlayerState';

/**
 * PlayerAnimator
 * Handles Three.js AnimationMixer, procedural bone manipulation (additive IK),
 * and dynamic ground clamping with smoothed Y offsets.
 */
export class PlayerAnimator {
  public mixer: THREE.AnimationMixer | null = null;
  public actions: Record<string, THREE.AnimationAction> = {};
  public collisionBones: THREE.Bone[] = [];
  
  // Smoothed visual offset for ground clamping (Fixes Jitter bug)
  public visualOffsetY: number = 0;

  // Mixamo Bone References
  private mixamoBones: Record<string, THREE.Bone> = {};
  
  // Store rest quaternions for blending
  private boneRestQuats: Map<THREE.Bone, THREE.Quaternion> = new Map();

  // Temp vectors for procedural math
  private _quatA = new THREE.Quaternion();
  private _quatB = new THREE.Quaternion();
  private _euler = new THREE.Euler();
  

  constructor(private state: PlayerState) {}

  public initMixer(model: THREE.Group): void {
    if (model.userData.animations && model.userData.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);
      const clips = model.userData.animations as THREE.AnimationClip[];

      this.mixer.addEventListener('finished', (e) => {
        if (e.action === this.actions['stand_up']) {
          this.state.isKnockedDown = false;
        }
      });

      for (const clip of clips) {
        const action = this.mixer.clipAction(clip);
        const name = clip.name.toLowerCase();
        
        if (name.includes('idle') || name === 'armature|idle') {
          this.actions['idle'] = action;
        } else if (name === 'run') {
          action.timeScale = 1.8;
          this.actions['run'] = action;
        } else if (name.includes('walk') || name === 'armature|walk') {
          action.timeScale = 0.85;
          this.actions['walk'] = action;
        } else if (name.includes('jump') || name.includes('fall')) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.timeScale = 1.8;
          this.actions['jump'] = action;
        } else if (name.includes('stand_up')) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          this.actions['stand_up'] = action;
        } else if (name.includes('drop_kick')) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          this.actions['drop_kick'] = action;
        } else if (name === 'roll') {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.timeScale = 1.2;
          this.actions['roll'] = action;
        } else if (name === 'punch' || name === 'elbow_punch') {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.timeScale = 1.3;
          this.actions[name] = action;
        } else {
          this.actions[name] = action;
        }
      }

      if (!this.actions['idle'] && this.actions['mixamo.com']) {
        this.actions['idle'] = this.actions['mixamo.com'];
      }
      if (this.actions['walk'] && !this.actions['run']) {
        const runAction = this.mixer.clipAction(this.actions['walk'].getClip());
        runAction.timeScale = 1.8;
        this.actions['run'] = runAction;
      }
    }
  }

  public mapMixamoBones(model: THREE.Group): void {
    model.traverse((child) => {
      if (!(child instanceof THREE.Bone)) return;
      const name = child.name.toLowerCase();

      if (name.includes('toe') || name.includes('foot') || name.includes('spine') || name.includes('head') || name.includes('hips')) {
        this.collisionBones.push(child);
      }

      if (name.includes('hips') && !name.includes('implant')) this.mixamoBones.hips = child;
      else if (name === 'mixamorig:spine_03' || (name.includes('spine') && !name.includes('spine1') && !name.includes('spine2') && name.includes('_03'))) this.mixamoBones.spine = child;
      else if (name.includes('spine1')) this.mixamoBones.spine1 = child;
      else if (name.includes('spine2')) this.mixamoBones.spine2 = child;
      
      else if (name.includes('leftshoulder') || name.includes('larmcollarbone')) this.mixamoBones.leftShoulder = child;
      else if ((name.includes('leftarm') && !name.includes('fore')) || name.includes('larm1')) this.mixamoBones.leftArm = child;
      else if (name.includes('leftforearm') || name.includes('larm2')) this.mixamoBones.leftForeArm = child;
      else if ((name.includes('lefthand') && !name.includes('thumb')) || name.includes('larm3')) this.mixamoBones.leftHand = child;
      
      else if (name.includes('rightshoulder') || name.includes('rarmcollarbone')) this.mixamoBones.rightShoulder = child;
      else if ((name.includes('rightarm') && !name.includes('fore')) || name.includes('rarm1')) this.mixamoBones.rightArm = child;
      else if (name.includes('rightforearm') || name.includes('rarm2')) this.mixamoBones.rightForeArm = child;
      else if ((name.includes('righthand') && !name.includes('thumb')) || name.includes('rarm3')) this.mixamoBones.rightHand = child;
      
      else if (name.includes('leftupleg') || name.includes('lleg1')) this.mixamoBones.leftUpLeg = child;
      else if ((name.includes('leftleg') && !name.includes('up')) || name.includes('lleg2')) this.mixamoBones.leftLeg = child;
      else if ((name.includes('leftfoot') && !name.includes('toe')) || name.includes('llegan')) this.mixamoBones.leftFoot = child;
      
      else if (name.includes('rightupleg') || name.includes('rleg1')) this.mixamoBones.rightUpLeg = child;
      else if ((name.includes('rightleg') && !name.includes('up')) || name.includes('rleg2')) this.mixamoBones.rightLeg = child;
      else if ((name.includes('rightfoot') && !name.includes('toe')) || name.includes('rlegan')) this.mixamoBones.rightFoot = child;
    });

    for (const [, bone] of Object.entries(this.mixamoBones)) {
      if (bone) {
        this.boneRestQuats.set(bone, bone.quaternion.clone());
      }
    }
  }

  /**
   * Smoothly crossfade to a new animation action. Fixes T-Pose glitch by avoiding setTimeout.
   */
  public playAnimation(name: string, fadeDuration: number = 0.2): void {
    if (!this.mixer || !this.actions[name]) return;
    if (this.state.currentAction === name) return;

    const action = this.actions[name];
    if (this.state.currentAction && this.actions[this.state.currentAction]) {
      const prevAction = this.actions[this.state.currentAction];
      
      // Use Three.js crossFadeTo which correctly handles weight management without strict setTimeouts
      const isLocomotionTransition = (name === 'walk' || name === 'run') && 
                                     (this.state.currentAction === 'walk' || this.state.currentAction === 'run');
                                     
      if (!isLocomotionTransition) {
        action.reset();
      }
      
      action.play();
      prevAction.crossFadeTo(action, fadeDuration, true);
    } else {
      action.reset().play();
    }
    this.state.currentAction = name;
  }

  /**
   * Play an upper-body-only animation that layers ON TOP of the current locomotion.
   * Does NOT change `currentAction` so walk/run/idle continues on the lower body.
   */
  public playUpperBodyAction(name: string): void {
    if (!this.mixer || !this.actions[name]) return;
    const action = this.actions[name];
    action.reset().setEffectiveWeight(100.0).fadeIn(0.1).play();
  }

  /**
   * Immediately stop a specific animation action (for combo cancellation).
   */
  public stopAction(name: string, fadeOut: boolean = false): void {
    if (!this.actions[name]) return;
    if (fadeOut) {
      this.actions[name].fadeOut(0.2);
      setTimeout(() => this.actions[name]?.stop(), 200);
    } else {
      this.actions[name].stop();
    }
  }

  public update(delta: number): void {
    if (this.mixer) {
      this.mixer.update(delta);
      this.updateProceduralAnimation(delta);
    } else {
      this.updateFallbackProcedural(delta);
    }
  }

  /**
   * Additive blending for procedural animations (Fixes Snapping Glitch).
   */
  private applyProceduralAdditive(bone: THREE.Bone | undefined, rx: number, ry: number, rz: number, weight: number = 1.0) {
    if (!bone) return;
    
    // Instead of resetting to rest pose, we multiply on top of the CURRENT animated quaternion (Additive)
    // This removes the snapping effect.
    this._euler.set(rx, ry, rz);
    this._quatA.setFromEuler(this._euler);
    
    // Blend the additive rotation smoothly
    this._quatB.copy(bone.quaternion).multiply(this._quatA);
    bone.quaternion.slerp(this._quatB, weight);
  }

  private updateProceduralAnimation(delta: number): void {
    if (this.state.proceduralState === 'none') return;

    this.state.proceduralTimer += delta;
    const t = Math.min(this.state.proceduralTimer / this.state.proceduralDuration, 1.0);
    
    // Smooth ease-in-out for the weight to prevent abrupt snaps at the start/end
    const weight = Math.sin(t * Math.PI); 

    switch (this.state.proceduralState) {
      case 'jump': this.applyJumpPose(weight); break;
      case 'punch': this.applyPunchPose(weight); break;
      case 'kick': this.applyKickPose(weight); break;
    }

    if (t >= 1.0) {
      this.state.proceduralState = 'none';
      this.state.proceduralTimer = 0;
    }
  }

  private applyJumpPose(weight: number): void {
    this.applyProceduralAdditive(this.mixamoBones.leftArm, -1.8, 0, -0.3, weight);
    this.applyProceduralAdditive(this.mixamoBones.rightArm, -1.8, 0, 0.3, weight);
    this.applyProceduralAdditive(this.mixamoBones.leftUpLeg, -0.6, 0, 0, weight * 0.8);
    this.applyProceduralAdditive(this.mixamoBones.leftLeg, 0.8, 0, 0, weight * 0.8);
    this.applyProceduralAdditive(this.mixamoBones.rightUpLeg, -0.4, 0, 0, weight * 0.8);
    this.applyProceduralAdditive(this.mixamoBones.rightLeg, 0.5, 0, 0, weight * 0.8);
  }

  private applyPunchPose(weight: number): void {
    this.applyProceduralAdditive(this.mixamoBones.rightArm, -1.5, -0.3, 0, weight);
    this.applyProceduralAdditive(this.mixamoBones.rightForeArm, -0.8, 0, 0, weight);
    this.applyProceduralAdditive(this.mixamoBones.leftArm, 0.3, 0.2, 0, weight * 0.5);
    this.applyProceduralAdditive(this.mixamoBones.spine2, -0.1, -0.3, 0, weight * 0.5);
  }

  private applyKickPose(weight: number): void {
    this.applyProceduralAdditive(this.mixamoBones.rightUpLeg, -1.2, 0, 0, weight);
    this.applyProceduralAdditive(this.mixamoBones.rightLeg, 0.3, 0, 0, weight);
    this.applyProceduralAdditive(this.mixamoBones.spine2, 0.2, 0, 0, weight * 0.5);
    this.applyProceduralAdditive(this.mixamoBones.leftArm, -0.6, 0, -0.4, weight * 0.5);
    this.applyProceduralAdditive(this.mixamoBones.rightArm, -0.4, 0, 0.5, weight * 0.5);
  }

  private updateFallbackProcedural(delta: number): void {
    
    if (this.state.currentSpeed > 0 && this.state.grounded) {
      this.state.walkTime += delta * 5.0 * (this.state.currentSpeed > 4 ? 2.5 : 1.5);
      const swing = Math.sin(this.state.walkTime) * 0.8;
      
      this.applyProceduralAdditive(this.mixamoBones.leftUpLeg, swing, 0, 0, 1.0);
      this.applyProceduralAdditive(this.mixamoBones.rightUpLeg, -swing, 0, 0, 1.0);
      this.applyProceduralAdditive(this.mixamoBones.leftArm, -swing * 0.5, 0, 0, 1.0);
      this.applyProceduralAdditive(this.mixamoBones.rightArm, swing * 0.5, 0, 0, 1.0);
    }
  }

  public getBone(name: string): THREE.Bone | undefined {
    return this.mixamoBones[name];
  }
}
