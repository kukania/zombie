/* ============================================
   GameEngine — Core game logic
   Manages zombies, perks, collisions, scoring
   ============================================ */

const GameEngine = (() => {
  // ---- Configuration ----
  const CONFIG = {
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
    difficultyIntervalS: 60,    // increase difficulty every 60s
  };

  // ---- State ----
  let state = null;

  function createInitialState() {
    return {
      running: false,
      // Player
      player: {
        lat: 0,
        lon: 0,
        health: CONFIG.maxHealth,
        heading: 0,              // compass heading
        inventory: [null, null, null, null],
        score: 0,
        distanceWalkedM: 0,
        lastLat: 0,
        lastLon: 0,
      },
      // Zombies
      zombies: [],
      nextZombieId: 0,
      lastSpawnTime: 0,
      // Perks
      perks: [],
      nextPerkId: 0,
      lastPerkSpawnTime: 0,
      // Stats
      startTime: 0,
      elapsedS: 0,
      zombiesEvaded: 0,
      perksCollected: 0,
      // Damage cooldown
      lastDamageTime: 0,
      // Difficulty
      difficultyLevel: 1,
      // Active effects
      activeEffects: [],         // { type, expiresAt }
    };
  }

  // ---- Perk definitions ----
  const PERK_TYPES = [
    { id: 'medkit',  icon: '🏥', name: 'Medkit',       rarity: 0.3,  effect: 'heal' },
    { id: 'energy',  icon: '⚡', name: 'Energy Drink', rarity: 0.25, effect: 'speed' },
    { id: 'flash',   icon: '🔦', name: 'Flashlight',   rarity: 0.2,  effect: 'vision' },
    { id: 'radar',   icon: '📡', name: 'Radar Pulse',  rarity: 0.1,  effect: 'reveal' },
    { id: 'decoy',   icon: '🎯', name: 'Decoy',        rarity: 0.1,  effect: 'decoy' },
    { id: 'shield',  icon: '🛡️', name: 'Shield',       rarity: 0.05, effect: 'shield' },
  ];

  function randomPerkType() {
    const roll = Math.random();
    let cumulative = 0;
    for (const perk of PERK_TYPES) {
      cumulative += perk.rarity;
      if (roll <= cumulative) return perk;
    }
    return PERK_TYPES[0]; // fallback
  }

  // ---- Zombie types ----
  function randomZombieType() {
    const roll = Math.random();
    if (roll < 0.6) return 'walker';
    if (roll < 0.9) return 'runner';
    return 'screamer';
  }

  // ---- Core methods ----

  function init(lat, lon) {
    state = createInitialState();
    state.player.lat = lat;
    state.player.lon = lon;
    state.player.lastLat = lat;
    state.player.lastLon = lon;
    state.startTime = Date.now() / 1000;
    state.running = true;

    // Spawn initial zombies
    for (let i = 0; i < 4; i++) {
      spawnZombie();
    }
    // Spawn initial perks
    for (let i = 0; i < 3; i++) {
      spawnPerk();
    }

    console.log('[GameEngine] Initialized at', lat.toFixed(5), lon.toFixed(5));
  }

  function spawnZombie() {
    if (!state || state.zombies.length >= CONFIG.maxZombies) return;

    const pos = GeoUtils.randomPointAround(
      state.player.lat,
      state.player.lon,
      CONFIG.spawnMinDistM,
      CONFIG.spawnMaxDistM
    );

    const type = randomZombieType();
    const zombie = {
      id: `z${state.nextZombieId++}`,
      lat: pos.lat,
      lon: pos.lon,
      type,
      speed: type === 'runner' ? CONFIG.runnerSpeed :
             type === 'screamer' ? CONFIG.screamerSpeed :
             CONFIG.walkerSpeed,
      state: 'patrol',     // 'patrol' | 'chase'
      patrolBearing: Math.random() * 360,
      patrolChangeTime: 0,
      spawnTime: Date.now() / 1000,
    };

    state.zombies.push(zombie);
    return zombie;
  }

  function spawnPerk() {
    if (!state || state.perks.length >= CONFIG.maxPerks) return;

    const pos = GeoUtils.randomPointAround(
      state.player.lat,
      state.player.lon,
      CONFIG.perkSpawnMinDistM,
      CONFIG.perkSpawnMaxDistM
    );

    const type = randomPerkType();
    const perk = {
      id: `p${state.nextPerkId++}`,
      lat: pos.lat,
      lon: pos.lon,
      type,
      spawnTime: Date.now() / 1000,
    };

    state.perks.push(perk);
    return perk;
  }

  /**
   * Main update loop — call every ~1 second
   */
  function update(playerLat, playerLon, playerHeading, dt) {
    if (!state || !state.running) return null;

    const now = Date.now() / 1000;
    state.elapsedS = now - state.startTime;

    // --- Update player position ---
    const moved = GeoUtils.distance(state.player.lastLat, state.player.lastLon, playerLat, playerLon);
    if (moved > 1) { // ignore GPS jitter under 1m
      state.player.distanceWalkedM += moved;
      state.player.score += Math.floor(moved * CONFIG.scorePerMeter);
    }
    state.player.lat = playerLat;
    state.player.lon = playerLon;
    state.player.lastLat = playerLat;
    state.player.lastLon = playerLon;
    state.player.heading = playerHeading || 0;

    // --- Score for surviving ---
    state.player.score += Math.floor(dt * CONFIG.scorePerSecondSurvived);

    // --- Difficulty ramp ---
    const newDifficulty = 1 + Math.floor(state.elapsedS / CONFIG.difficultyIntervalS);
    if (newDifficulty > state.difficultyLevel) {
      state.difficultyLevel = newDifficulty;
      CONFIG.maxZombies = Math.min(20, 12 + state.difficultyLevel);
      CONFIG.spawnIntervalS = Math.max(3, 8 - state.difficultyLevel * 0.5);
    }

    // --- Spawn new zombies ---
    if (now - state.lastSpawnTime > CONFIG.spawnIntervalS) {
      spawnZombie();
      state.lastSpawnTime = now;
    }

    // --- Spawn new perks ---
    if (state.perks.length < CONFIG.maxPerks && now - state.lastPerkSpawnTime > 20) {
      spawnPerk();
      state.lastPerkSpawnTime = now;
    }

    // --- Update zombie AI ---
    const events = [];

    state.zombies.forEach((zombie) => {
      const distToPlayer = GeoUtils.distance(
        zombie.lat, zombie.lon,
        state.player.lat, state.player.lon
      );

      // State transition: patrol → chase
      if (distToPlayer < CONFIG.zombieDetectRangeM) {
        if (zombie.state === 'patrol') {
          zombie.state = 'chase';
          events.push({ type: 'zombie_chase', zombie });
        }
      } else if (distToPlayer > CONFIG.zombieDetectRangeM * 2) {
        zombie.state = 'patrol';
      }

      // Movement
      if (zombie.state === 'chase') {
        // Move toward player
        const chaseSpeed = zombie.speed * (1 + state.difficultyLevel * 0.05);
        const newPos = GeoUtils.moveToward(
          zombie.lat, zombie.lon,
          state.player.lat, state.player.lon,
          chaseSpeed, dt
        );
        zombie.lat = newPos.lat;
        zombie.lon = newPos.lon;
      } else {
        // Random patrol
        if (now > zombie.patrolChangeTime) {
          zombie.patrolBearing = Math.random() * 360;
          zombie.patrolChangeTime = now + 3 + Math.random() * 5;
        }
        const newPos = GeoUtils.pointAtDistanceBearing(
          zombie.lat, zombie.lon,
          zombie.speed * 0.5 * dt,
          zombie.patrolBearing
        );
        zombie.lat = newPos.lat;
        zombie.lon = newPos.lon;
      }

      // Damage check
      if (distToPlayer < CONFIG.zombieDamageRangeM) {
        if (now - state.lastDamageTime > CONFIG.zombieDamageCooldownS) {
          // Check shield effect
          const shielded = state.activeEffects.some(
            (e) => e.type === 'shield' && e.expiresAt > now
          );
          if (!shielded) {
            state.player.health -= CONFIG.zombieDamage;
            state.lastDamageTime = now;
            events.push({ type: 'player_hit', damage: CONFIG.zombieDamage });

            if (state.player.health <= 0) {
              state.player.health = 0;
              state.running = false;
              events.push({ type: 'player_death' });
            }
          }
        }
      }

      // Track evasion (zombie was chasing but player got away)
      if (zombie.state === 'chase' && distToPlayer > CONFIG.spawnMaxDistM) {
        state.zombiesEvaded++;
        events.push({ type: 'zombie_evaded', zombie });
      }
    });

    // Remove zombies that are too far away
    state.zombies = state.zombies.filter((z) => {
      const dist = GeoUtils.distance(z.lat, z.lon, state.player.lat, state.player.lon);
      if (dist > CONFIG.spawnMaxDistM * 1.5) {
        events.push({ type: 'zombie_despawn', id: z.id });
        return false;
      }
      return true;
    });

    // --- Check perk collection ---
    state.perks = state.perks.filter((perk) => {
      const dist = GeoUtils.distance(perk.lat, perk.lon, state.player.lat, state.player.lon);
      if (dist < CONFIG.perkPickupRangeM) {
        // Try to add to inventory
        const emptySlot = state.player.inventory.indexOf(null);
        if (emptySlot !== -1) {
          state.player.inventory[emptySlot] = perk.type;
          state.perksCollected++;
          state.player.score += CONFIG.scorePerPerkCollected;
          events.push({ type: 'perk_collected', perk, slot: emptySlot });
        }
        return false;
      }
      // Remove expired perks
      if (now - perk.spawnTime > CONFIG.perkLifetimeS) {
        return false;
      }
      return true;
    });

    // --- Update active effects ---
    state.activeEffects = state.activeEffects.filter((e) => e.expiresAt > now);

    // --- Get effective visibility (may be boosted by flashlight) ---
    const visionBoosted = state.activeEffects.some(
      (e) => e.type === 'vision' && e.expiresAt > now
    );

    return {
      state: { ...state },
      events,
      visibilityRadius: visionBoosted
        ? CONFIG.visibilityRadiusM * 2
        : CONFIG.visibilityRadiusM,
      audioRadius: CONFIG.audioRadiusM,
      isLowHealth: state.player.health <= 30,
      revealAll: state.activeEffects.some(
        (e) => e.type === 'reveal' && e.expiresAt > now
      ),
    };
  }

  /**
   * Use an item from inventory
   */
  function useItem(slotIndex) {
    if (!state || !state.running) return null;
    const item = state.player.inventory[slotIndex];
    if (!item) return null;

    const now = Date.now() / 1000;
    state.player.inventory[slotIndex] = null;
    let event = { type: 'item_used', item };

    switch (item.effect) {
      case 'heal':
        state.player.health = Math.min(CONFIG.maxHealth, state.player.health + 25);
        event.detail = '+25 HP';
        break;
      case 'speed':
        // Speed boost is handled by the movement system
        state.activeEffects.push({ type: 'speed', expiresAt: now + 30 });
        event.detail = 'Sprint 30s';
        break;
      case 'vision':
        state.activeEffects.push({ type: 'vision', expiresAt: now + 60 });
        event.detail = 'Vision x2 60s';
        break;
      case 'reveal':
        state.activeEffects.push({ type: 'reveal', expiresAt: now + 10 });
        event.detail = 'Radar 10s';
        break;
      case 'decoy':
        // Move all chasing zombies away
        state.zombies.forEach((z) => {
          if (z.state === 'chase') {
            const away = GeoUtils.randomPointAround(state.player.lat, state.player.lon, 80, 150);
            z.lat = away.lat;
            z.lon = away.lon;
            z.state = 'patrol';
          }
        });
        event.detail = 'Zombies lured away';
        break;
      case 'shield':
        state.activeEffects.push({ type: 'shield', expiresAt: now + 15 });
        event.detail = 'Shield 15s';
        break;
    }

    return event;
  }

  /**
   * Get current game state
   */
  function getState() {
    return state;
  }

  function getConfig() {
    return { ...CONFIG };
  }

  function isRunning() {
    return state && state.running;
  }

  return {
    CONFIG,
    init,
    update,
    useItem,
    getState,
    getConfig,
    isRunning,
    PERK_TYPES,
  };
})();
