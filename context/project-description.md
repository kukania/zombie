# ZombieWalk — Project Description

## What Is This Game?

**ZombieWalk** is a GPS-based location-aware zombie survival game that runs in the browser. The player physically walks around in the real world — the game uses their actual GPS coordinates to determine movement. Zombies spawn around the player's real-world position, move toward them, and deal damage when close enough. The player must keep moving to survive, evade zombies, and collect power-up perks scattered across the map.

The core hook is **immersive spatial audio**: zombie sounds (groans, footsteps, shrieks) are rendered in 3D using the Web Audio API with HRTF panning, so the player hears zombies approaching from the correct direction relative to where they're actually facing. Headphones are recommended.

The map is a real dark-tile map (CartoDB Dark Matter via Leaflet.js), centered on the player, locked to follow their GPS position. A **fog of war** canvas overlay limits visibility to ~80 meters, creating tension — zombies can only be seen if they're close enough.

---

## Goal

**Current goal:** Build and validate a fully playable prototype that can be field-tested on mobile (iOS + Android) before committing to a native app.

The game is designed to be a **real-world fitness-meets-horror** experience:
- Walk in the real world to score points and evade zombies
- Spatial audio replaces a visual mini-map — you hear threats before you see them
- Perks and escalating difficulty keep each run feeling different

**Longer-term target:** A polished mobile web app (and potential native port) that is fun to play during real walks, jogs, or runs in any neighborhood.

---

## Target Platforms

| Platform | Status | Notes |
|---|---|---|
| **iOS Safari** | Primary target | Requires specific AudioContext unlock on user gesture; media volume routing via `<audio>` srcObject trick |
| **Android Chrome** | Secondary target | Standard Web Audio API works cleanly |
| **Desktop browser** | Dev/testing only | Simulation mode (`SIM` button) for movement without real GPS |

The game is deployed as a **static GitHub Pages site** (no server needed).

---

## Architecture Overview

The project is a single-page web app. All logic runs in the browser; there is no backend.

```
index.html        ← Shell / HTML structure + screen layout
style.css         ← All styling (dark theme, HUD, animations)
config/game-config.js ← Game constants and tuning values
geo-utils.js      ← GPS math library (loads first)
audio-engine.js   ← Spatial audio system (loads second)
game-engine.js    ← Core game logic (loads third)
app.js            ← Application controller / glue layer (loads last)
```

Script load order matters — each module depends on the previous being globally available.

---

## File Reference

### `index.html`
The single HTML file. Contains:
- **Splash screen** (`#splash-screen`) — title, "BEGIN SURVIVAL" button, high score display
- **Game screen** (`#game-screen`) — map container, fog canvas overlay, full HUD
- **Game Over screen** (`#gameover-screen`) — death stats, restart/home buttons
- **Simulation controls** (`#sim-toggle`) — hidden by default; shown when GPS fails or on desktop; arrow-key-style buttons to fake movement
- External dependencies: Leaflet.js (map rendering), Google Fonts (Creepster + Inter)
- Script tags loading all 4 JS files with cache-busting version query strings (`?v=7`)

### `style.css`
All visual styling. Key sections:
- **CSS custom properties** — color palette (deep dark background `#0a0a0a`, blood red `#cc1100`, green `#00cc44`)
- **Screen system** — `.screen` / `.screen.active` visibility transitions
- **Splash screen** — animated fog overlay, pulsing ring, Creepster font for title
- **HUD** — top bar (health bar + score), danger indicator, compass widget, bottom bar (inventory slots + info row)
- **Map & fog canvas** — absolute positioning; fog `<canvas>` sits on top of the Leaflet map
- **Marker styles** — `.marker-player`, `.marker-zombie`, `.marker-perk` Leaflet divIcon CSS
- **Game Over screen** — centered layout, skull, stats grid
- **Animations** — `fadeIn`, `pulse`, `damage-flash`, health bar pulsing at low HP
- **Responsive** — `viewport-fit=cover` safe area insets for iPhone notch

### `geo-utils.js`
Pure GPS math, no DOM or state. Exposes a single global `GeoUtils` object.

| Function | Description |
|---|---|
| `distance(lat1,lon1,lat2,lon2)` | Haversine distance in meters between two GPS coordinates |
| `bearing(lat1,lon1,lat2,lon2)` | Compass bearing (0=North, 90=East) from point 1 to point 2 |
| `pointAtDistanceBearing(lat,lon,dist,bearing)` | Compute new GPS coord given origin, distance (m), and bearing |
| `randomPointAround(lat,lon,minDist,maxDist)` | Random GPS point within a donut-shaped radius around origin |
| `moveToward(fromLat,fromLon,toLat,toLon,speed,dt)` | Move a GPS coordinate toward a target at speed (m/s) over dt (s) |
| `randomWander(lat,lon,speed,dt)` | Random wander step (patrol movement) |
| `clamp(lat,lon)` | Clamp to valid GPS ranges |

### `audio-engine.js`
Spatial audio system using the Web Audio API. Exposes a single global `AudioEngine` IIFE object. **No external audio files** — all sounds are synthesized procedurally.

**Key design decision:** On iOS, audio must be unlocked synchronously during a user gesture. The engine uses an `<audio>` element with `srcObject` pointed at a `MediaStreamDestination` to route Web Audio output through the media volume channel (same technique YouTube uses), bypassing the iOS ringer/mute limitation.

| Function | Description |
|---|---|
| `unlockAudio()` | Call synchronously on button tap to create AudioContext and unlock iOS; also routes to media channel |
| `init()` | Async — generates all synthesized sound buffers (groan, footstep, screamer, heartbeat, wind, pickup, hurt) |
| `updateListenerHeading(deg)` | Rotates the Web Audio listener orientation to match compass heading |
| `updateZombieSound(id, bearing, dist, type)` | Create/update a 3D HRTF-panned spatial audio source for a zombie |
| `removeZombieSound(id)` | Stop and remove the spatial source for a zombie that despawned |
| `updateRefugeeBeacon(bearing, dist)` | Pulse an HRTF audio beacon pointing toward the exit |
| `playUI(soundName, volume)` | Non-spatial one-shot sound (pickup chime, hurt sfx) |
| `playVictory()` | Non-spatial one-shot victory chime |
| `startAmbient()` / `stopAmbient()` | Looping brown-noise wind ambience (can be muted in config) |
| `startHeartbeat()` / `stopHeartbeat()` | Looping heartbeat at low health |
| `cleanup()` | Stop all sources (called on death) |
| `resume()` | Resume suspended AudioContext (mobile lifecycle) |

**Synthesized sounds:**
- `zombieGroan` / `zombieGroan2` — low-frequency oscillator with FM modulation + breath noise
- `footstep` — noise burst with exponential decay
- `screamer` — rising-frequency sweep (Screamer zombie type)
- `heartbeat` — lub-dub via two Gaussian envelope pulses
- `wind` — filtered brown noise with slow amplitude modulation
- `pickup` — two-tone chime with decay
- `hurt` — noise + FM tone with fast decay

### `game-engine.js`
Core game logic — pure data/state, no DOM. Exposes a single global `GameEngine` IIFE object.

**CONFIG values (tunable in `config/game-config.js`):**

| Parameter | Value | Meaning |
|---|---|---|
| `visibilityRadiusM` | 80m | Player fog-of-war visibility radius |
| `audioRadiusM` | 200m | Zombies within this range emit spatial audio |
| `maxZombies` | 12 (scales up) | Max simultaneous zombies (increases with difficulty) |
| `spawnMinDistM` | 60m | Minimum zombie spawn distance from player |
| `spawnMaxDistM` | 200m | Maximum zombie spawn distance |
| `zombieDetectRangeM` | 45m | Range at which a zombie switches from patrol → chase |
| `zombieDamageRangeM` | 8m | Range for dealing damage |
| `zombieDamageCooldownS` | 2.5s | Minimum time between damage hits |
| `zombieDamage` | 15 HP | Damage per hit |
| `spawnIntervalS` | 8s (scales down) | Seconds between new zombie spawns |
| `walkerSpeed` | 0.8 m/s | Slow zombie |
| `runnerSpeed` | 2.5 m/s | Fast zombie |
| `screamerSpeed` | 0.5 m/s | Slow but loud zombie |
| `maxHealth` | 100 HP | Player starting health |
| `difficultyIntervalS` | 60s | How often difficulty increases |

**Zombie types:**

| Type | Speed | Audio | Spawn probability |
|---|---|---|---|
| `walker` | 0.8 m/s | Low groan | 60% |
| `runner` | 2.5 m/s | Groan (faster) | 30% |
| `screamer` | 0.5 m/s | Shriek sweep | 10% |

**Perk types (dropped around the map):**

| Perk | Icon | Effect | Rarity |
|---|---|---|---|
| Medkit | 🏥 | +25 HP | 30% |
| Energy Drink | ⚡ | Speed boost 30s | 25% |
| Flashlight | 🔦 | Vision radius ×2 for 60s | 20% |
| Radar Pulse | 📡 | Reveal all zombies 10s | 10% |
| Decoy | 🎯 | Lures all chasing zombies away | 10% |
| Shield | 🛡️ | Damage immunity 15s | 5% |

**Scoring:**
- +1 pt per meter walked
- +2 pts per second survived
- +50 pts per perk collected
- + Base Escape Bonus + Health/Time multipliers (when reaching the Refugee)

**Difficulty ramp:** Every 60 seconds, `difficultyLevel` increments. `maxZombies` increases (cap: 20), `spawnIntervalS` decreases (floor: 3s), and zombie chase speed gets a multiplier.

### `app.js`
The top-level application controller. Ties all systems together and owns the DOM. Responsibilities:
- **Screen management** — `showScreen(id)` to switch between splash/game/gameover
- **Map initialization** — Leaflet map setup, CartoDB dark tile layer, fog canvas sizing
- **Fog of War rendering** — `drawFog(radiusM, revealAll)` draws the dark overlay with radial gradient cutout and subtle red noise texture; `metersToPixels(m)` converts game meters to screen pixels at current zoom
- **GPS tracking** — `startGPS()` via `navigator.geolocation.watchPosition`; automatic fallback to simulation mode on GPS error
- **Simulation mode** — fake GPS movement via on-screen NSEW buttons for desktop testing
- **Compass** — `DeviceOrientationEvent` listener (with iOS 13+ permission flow) to track player facing direction
- **Main game loop** — `setInterval` at 1 Hz calling `GameEngine.update()` then:
  - Updating Leaflet map view and player marker
  - Redrawing fog
  - Adding/removing/repositioning Leaflet markers for zombies, perks, and the Refugee
  - Updating spatial audio for each zombie in range and the Refugee beacon
  - Updating all HUD elements
  - Rotating compass arrow toward nearest zombie
  - Triggering heartbeat audio at low health
  - Dispatching game events (hit flash, death, pickup sounds, vibration)
- **HUD rendering** — health bar, score, zombie count, distance walked, survival timer, 4-slot inventory
- **Game Over & Victory** — stops loop, calls `AudioEngine.cleanup()`, shows stats screen (Death or Escaped), saves high score and escape stats to `localStorage`
- **High score persistence** — `localStorage` keys: `zw_highscore`, `zw_besttime`, `zw_escapes`, `zw_best_escape_time`
