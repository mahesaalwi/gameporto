import * as THREE from 'three';
import type { AssetLoader } from './AssetLoader';
import { GAME_CONSTANTS } from '../data/constants';

/**
 * Handles fetching animation files, fixing mixamorig bone names, 
 * and preparing them for the Player's AnimationMixer.
 */
export class AnimationManager {
  constructor(private assetLoader: AssetLoader) {}

  /**
   * Fixes Mixamo bone names and optionally locks horizontal movement for in-place animations.
   */
  private processClip(
    clip: THREE.AnimationClip, 
    newName: string, 
    lockXZ: boolean = false,
    yOffset: number = 0
  ): THREE.AnimationClip {
    clip.name = newName;
    
    // Fix bone names
    clip.tracks.forEach(track => {
      const parts = track.name.split('.');
      let boneName = parts[0];
      const propName = parts[1] || 'position';
      
      if (boneName.includes('/')) boneName = boneName.split('/').pop() || boneName;
      boneName = boneName.replace(/mixamorig:/g, 'mixamorig_');
      
      track.name = `${boneName}.${propName}`;
    });

    if (lockXZ) {
      if (newName === 'walk' || newName === 'run' || newName === 'idle') {
        // For retargeted locomotion (like Dwarf Walk), completely strip Hips.position to prevent sinking
        clip.tracks = clip.tracks.filter(t => !t.name.includes('Hips.position'));
      } else {
        // For combat/action animations (drop_kick, jump, roll), we MUST keep Y-axis for vertical movement,
        // but we lock X and Z so they don't drift away from the physics capsule.
        const hipsTrack = clip.tracks.find(t => t.name.includes('Hips.position'));
        if (hipsTrack) {
          const values = hipsTrack.values;
          for (let i = 0; i < values.length; i += 3) {
            values[i] = values[0];     // Lock X
            values[i+1] += yOffset;    // Add manual Y offset to fix sinking
            values[i+2] = values[2];   // Lock Z
          }
        }
      }
    }

    return clip;
  }

  /**
   * Upper body only for punch/attack animations to blend with walking
   */
  private processUpperBodyClip(clip: THREE.AnimationClip, newName: string): THREE.AnimationClip {
    clip = this.processClip(clip, newName, false);
    const upperBodyKeywords = ['Spine', 'Neck', 'Head', 'Shoulder', 'Arm', 'Hand', 'Finger'];
    clip.tracks = clip.tracks.filter(track => {
      return upperBodyKeywords.some(kw => track.name.includes(kw));
    });
    return clip;
  }

  /**
   * Load a single animation file.
   */
  private async loadAnimation(path: string, name: string, lockXZ: boolean, upperBodyOnly: boolean = false, yOffset: number = 0): Promise<THREE.AnimationClip | null> {
    try {
      const animModel = await this.assetLoader.loadModel(path);
      if (animModel.userData.animations && animModel.userData.animations.length > 0) {
        let clip = animModel.userData.animations[0] as THREE.AnimationClip;
        if (upperBodyOnly) {
          return this.processUpperBodyClip(clip, name);
        } else {
          return this.processClip(clip, name, lockXZ, yOffset);
        }
      }
    } catch (e) {
      console.warn(`Failed to load ${name} animation`, e);
    }
    return null;
  }

  /**
   * Load and process all player animations
   */
  public async loadPlayerAnimations(): Promise<THREE.AnimationClip[]> {
    const clips: THREE.AnimationClip[] = [];
    const anims = GAME_CONSTANTS.ASSETS.ANIMATIONS;

    const loadPromises = [
      this.loadAnimation(anims.WALK, 'walk', true),
      this.loadAnimation(anims.RUN, 'run', true),
      this.loadAnimation(anims.JUMP, 'jump', true),
      this.loadAnimation(anims.STAND_UP, 'stand_up', true),
      this.loadAnimation(anims.IDLE, 'idle', true),
      this.loadAnimation(anims.DROP_KICK, 'drop_kick', true, false, 35),
      this.loadAnimation(anims.ROLL, 'roll', true, false, 20),
      this.loadAnimation(anims.PUNCH, 'punch', false, true),
      this.loadAnimation(anims.ELBOW_PUNCH, 'elbow_punch', false, true),
    ];

    const results = await Promise.all(loadPromises);
    results.forEach(clip => {
      if (clip) clips.push(clip);
    });

    return clips;
  }
}
