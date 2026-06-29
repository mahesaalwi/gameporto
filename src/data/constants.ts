import type { TreasureType } from '../entities/TreasureBox';

export const GAME_CONSTANTS = {
  ASSETS: {
    MODELS: {
      PLAYER: '/models/characters/Vampire A Lusth.fbx',
      AURA: '/models/effect/planeffect.glb',
      BOXES: '/models/box/pixel_boxs_-_low_poly_free.glb',
    },
    ANIMATIONS: {
      WALK: '/models/characters/modeling/Dwarf Walk.fbx',
      RUN: '/models/characters/modeling/Run.fbx',
      JUMP: '/models/characters/modeling/Jump.fbx',
      STAND_UP: '/models/characters/modeling/Stand Up.fbx',
      IDLE: '/models/characters/modeling/Idle.fbx',
      DROP_KICK: '/models/characters/modeling/Drop Kick.fbx',
      ROLL: '/models/characters/modeling/Falling To Roll.fbx',
      PUNCH: '/models/characters/modeling/Punching.fbx',
      ELBOW_PUNCH: '/models/characters/modeling/Illegal Elbow Punch.fbx',
    },
    IMAGES: {
      AVATAR: '/images/kaze_assassin_avatar.png',
    }
  },

  PLAYER: {
    TARGET_HEIGHT: 1.6,
    /** Distance from capsule center to bottom (halfHeight + radius) */
    CAPSULE_BOTTOM_OFFSET: 0.9,
    /** Visual offset to prevent clipping into the ground for certain models */
    MODEL_Y_OFFSET: 0.05,
    BASE_SPEED: 5.5,
    SPRINT_MULTIPLIER: 2.8,
    GRAVITY: -15.0,
    JUMP_IMPULSE: 7.0,
    TERMINAL_VELOCITY: -20.0,
    SPAWN_Y: 10,
  },

  PHYSICS: {
    GRAVITY: { x: 0.0, y: -9.81, z: 0.0 },
  },

  COMBAT: {
    BASE_DAMAGE: 20,
    BOSS_DAMAGE: 10,
    BOSS_HIT_RANGE: 4.5,
    PLAYER_HIT_RANGE: 4.0,
    POWER_UP: {
      DURATION_SEC: 6,
      DAMAGE_MULTIPLIER: 0.25,
    },
  },

  UI: {
    POWER_UP_COLORS: {
      about: 0x00f0ff,
      expertise: 0xff00aa,
      tools: 0x00ff88,
      experience: 0xffaa00,
    } as Record<string, number>,
    STRINGS: {
      LOADING_TITLE: 'CYBERPUNK PORTFOLIO',
      LOADING_SUB: '[ INITIALIZING NEURAL LINK... ]',
      LOADING_DESC: 'Loading assets and physics engine...',
    },
  },

  WORLD: {
    TREASURE_CONFIGS: [
      { x: -4.5, y: 1.2, z: -6.0, type: 'about' as TreasureType },
      { x: -1.5, y: 1.2, z: -6.5, type: 'expertise' as TreasureType },
      { x: 1.5, y: 1.2, z: -6.5, type: 'tools' as TreasureType },
      { x: 4.5, y: 1.2, z: -6.0, type: 'experience' as TreasureType },
    ],
    BOSS_POSITION: { x: 0, y: 1, z: -30 },
    BOX_NAMES: [
      'humanitarian_box_01',
      'humanitarian_box_02',
      'humanitarian_box_03',
      'humanitarian_box_04',
    ],
    BOX_TYPES: ['about', 'expertise', 'tools', 'experience'] as TreasureType[],
    TREASURE_INTERACT_RADIUS: 1.5,
  },
} as const;
