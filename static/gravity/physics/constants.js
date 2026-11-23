/** Shared limits for the gravity sandbox. Physics stays in normalized units with G = 1. */

export const SCHEMA_VERSION = 1;

export const DEFAULT_G = 1;
export const DEFAULT_DT = 0.01;
export const DEFAULT_EPSILON = 0.45;
export const DEFAULT_BODY_COUNT = 256;
export const MAX_BODIES = 1024;
export const MIN_BODIES = 1;

/** One full-state checkpoint every this many recorded ticks, plus one after every edit. */
export const CHECKPOINT_INTERVAL = 30;

/** History arrays, metadata estimates, and auxiliary caches share this budget. */
export const HISTORY_BUDGET_BYTES = 64 * 1024 * 1024;

/**
 * Playback convention at 1x. Simulated time still advances by dt each tick.
 * Speed multipliers do not change the displacement of one tick.
 */
export const TICKS_PER_SECOND = 120;

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64];

/** Cap the wall-clock backlog so a stall cannot demand an unbounded catch-up. */
export const MAX_BACKLOG_TICKS = 6;

/** Physics work per turn of the worker loop, so commands stay responsive. */
export const PHYSICS_BUDGET_MS = 12;

export const COLLISION_MODES = ['pass', 'merge'];

export const PRESET_IDS = [
  'random-cloud',
  'solar-system',
  'binary-stars',
  'rotating-disk',
  'colliding-disks',
  'black-hole',
];

export const COLOR_MODES = ['cluster', 'mass', 'speed'];

export const MAX_NAME_LENGTH = 80;
export const MAX_NOTES_LENGTH = 400;
export const MAX_JSON_BYTES = 2 * 1024 * 1024;
