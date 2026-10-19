// Shared tuning constants. Imported by both the browser client and the Node server,
// so gameplay numbers can never drift between the two.

export const PROTOCOL_VERSION = 1;

export const TICK_MS = 50;            // server simulation / snapshot interval (20 Hz)
export const CLIENT_SEND_MS = 50;     // how often clients report their movement
export const INTERP_DELAY_MS = 100;   // remote players are rendered this far in the past
export const MAX_REWIND_MS = 250;     // cap on lag compensation

export const PLAYER = {
  radius: 0.4,
  height: 1.8,
  eye: 1.6,
  walkSpeed: 6.2,
  sprintSpeed: 9.4,
  jumpSpeed: 7.6,
  gravity: 22,
  stepHeight: 0.45,
  maxHp: 100,
  bounceSpeed: 15,      // trampolines
};

export const RESPAWN_MS = 3000;
export const SPAWN_PROTECT_MS = 1500;
export const MAX_PLAYERS = 8;
export const NAME_MAX = 16;
export const CHAT_MAX = 120;

export const WEAPONS = {
  rifle: {
    id: 'rifle',
    name: 'Leaf Blaster 3000',
    damage: 17,
    headMult: 1.8,
    cooldownMs: 110,
    mag: 30,
    reloadMs: 1700,
    spread: 0.012,
    pellets: 1,
    range: 160,
    falloffStart: 160,
    falloffMin: 1,
    auto: true,
  },
  shotgun: {
    id: 'shotgun',
    name: 'HOA Enforcer',
    damage: 12,
    headMult: 1.4,
    cooldownMs: 850,
    mag: 6,
    reloadMs: 2300,
    spread: 0.075,
    pellets: 8,
    range: 45,
    falloffStart: 12,
    falloffMin: 0.4,
    auto: false,
  },
};
export const WEAPON_ORDER = ['rifle', 'shotgun'];

export const MODES = {
  ffa: { id: 'ffa', name: 'Free-for-All' },
  tdm: { id: 'tdm', name: 'Team Deathmatch' },
};

// Factions: country-club suburbanites vs. rural homesteaders. Both get roasted equally.
export const TEAMS = [
  { id: 1, name: 'Pristine Pines HOA', short: 'HOA', color: '#3b82f6', outfit: 'suburban' },
  { id: 2, name: 'Backroad Boys', short: 'BACKROAD', color: '#c2410c', outfit: 'country' },
];

export const KILL_LIMITS = [10, 15, 20, 30, 50];
export const TIME_LIMITS_MIN = [3, 5, 8, 10, 15];
export const DEFAULT_CONFIG = { mode: 'ffa', map: 'culdesac', killLimit: 20, timeLimitMin: 8 };

export const COUNTDOWN_MS = 3000;

// Movement validation: a little slack for jitter, bounce pads and latency bursts.
export const MOVE_SLACK = 1.35;
export const MOVE_FLAT_TOLERANCE = 1.2;
