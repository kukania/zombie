/* ============================================
   GameConfig — Tunable parameters
   ============================================ */

const GAME_CONFIG = {
  // Visibility
  visibilityRadiusM: 80,       // meters — player can see this far
  audioRadiusM: 200,           // meters — player can hear zombies this far

  // Zombies
  maxZombies: 12,
  spawnMinDistM: 60,           // don't spawn too close
  spawnMaxDistM: 200,          // don't spawn too far
  zombieDetectRangeM: 45,      // zombie starts chasing player within this
  zombieDamageRangeM: 8,       // zombie deals damage within this
  zombieDamageCooldownS: 2.5,  // seconds between damage hits
  zombieDamage: 15,            // HP per hit
  spawnIntervalS: 8,           // new zombie every N seconds

  // Zombie speeds (meters per second — realistic walking speeds)
  walkerSpeed: 0.8,
  runnerSpeed: 2.5,
  screamerSpeed: 0.5,

  // Perks
  maxPerks: 5,
  perkSpawnMinDistM: 30,
  perkSpawnMaxDistM: 120,
  perkLifetimeS: 300,          // despawn after 5 min
  perkPickupRangeM: 12,        // meters to collect

  // Player
  maxHealth: 100,
  scorePerMeter: 1,
  scorePerPerkCollected: 50,
  scorePerSecondSurvived: 2,

  // Difficulty ramp
  difficultyIntervalS: 60,     // increase difficulty every 60s

  // Refugee (win condition)
  refugeeDistanceM: 500,       // meters from start
  refugeePickupRangeM: 15,     // meters to trigger victory
  refugeeFinalPushM: 200,      // radius that activates final-push difficulty
  scoreEscapeBase: 500,        // base bonus for reaching refugee
  scoreEscapeHealthMult: 3,    // bonus per HP remaining (max 300)
  scoreEscapeTimeMult: 0.5,    // bonus per second under par time (300s = 5min)
  scoreEscapeParTimeS: 300,    // par time in seconds (faster = bigger bonus)

  // Testing & Debug
  enableSimMode: false,        // Forces game into desktop simulation mode (ignores real GPS)
  muteAmbient: false,          // Mutes the wind/background drone for easier audio testing
};
