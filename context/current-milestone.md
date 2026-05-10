# Current Milestone — M1: Refugee (Win Condition & Exit Object)

## Task Checklist
- [x] **Step 0:** Create `config/` directory and extract `CONFIG` object from `game-engine.js` into `config/game-config.js`. Update `index.html` to include it.
- [x] **Step 1:** Update `game-engine.js` to add Refugee constants, state, init spawn, update check.
- [x] **Step 2:** Update `index.html` with `#victory-screen` HTML and refugee HUD element. Bump cache-bust version.
- [x] **Step 3:** Update `style.css` for Refugee marker, final-push overlay, and victory screen styles.
- [ ] **Step 4:** Update `audio-engine.js` to add beacon buffer, victory buffer, `updateRefugeeBeacon(bearingDeg, distanceM)`, and `playVictory()`.
- [ ] **Step 5:** Update `app.js` for Refugee marker creation, `gameLoop` wiring, `onPlayerVictory()`, and event handlers.

## Design Decisions (Resolved)

Before coding starts, the four open design questions from `milestones.md` are resolved here:

| Question | Decision | Rationale |
|---|---|---|
| **Placement** | Random bearing, fixed distance of **500m** from start | Short enough to be reachable on a 15–20 min walk; far enough to require real navigation. Distance is a CONFIG constant. |
| **Visibility** | **Always visible** on the map, never fog-gated | The Refugee is the player's north star — they must always know which direction to push toward. Hiding it would be frustrating, not tense. |
| **Difficulty interaction** | **Yes** — entering a 200m radius of the Refugee triggers a "final push" mode: spawn interval halved, runners spawn more frequently | Creates a climactic final stretch. The game escalates exactly when the player is close to winning. |
| **Multiple runs in one session** | **No** for M1 — victory ends the run cleanly, same as death | Multi-stage is a future feature (M4 Roguelike). Keep M1 scope tight. |

---

## Files Changed & What Changes In Each

### 1. `game-engine.js`

**a) Add Refugee CONFIG constants** (in the `CONFIG` object):
```js
// Refugee (win condition)
refugeeDistanceM: 500,       // meters from start
refugeePickupRangeM: 15,     // meters to trigger victory
refugeeFinalPushM: 200,      // radius that activates final-push difficulty
scoreEscapeBase: 500,        // base bonus for reaching refugee
scoreEscapeHealthMult: 3,    // bonus per HP remaining (max 300)
scoreEscapeTimeMult: 0.5,    // bonus per second under par time (300s = 5min)
scoreEscapeParTimeS: 300,    // par time in seconds (faster = bigger bonus)
```

**b) Add refugee to `createInitialState()`** (after `activeEffects`):
```js
// Refugee
refugee: null,   // { lat, lon, reached: false } — set in init()
finalPushActive: false,
```

**c) Spawn refugee in `init()`** (after initial perk spawning):
```js
// Spawn refugee at random bearing, fixed distance
const refugeeBearing = Math.random() * 360;
const refugeePos = GeoUtils.pointAtDistanceBearing(lat, lon, CONFIG.refugeeDistanceM, refugeeBearing);
state.refugee = { lat: refugeePos.lat, lon: refugeePos.lon, reached: false };
console.log('[GameEngine] Refugee at', refugeePos.lat.toFixed(5), refugeePos.lon.toFixed(5));
```

**d) Add refugee check in `update()`** (at the start of the update, before zombie AI):
```js
// --- Check refugee proximity ---
if (state.refugee && !state.refugee.reached) {
  const distToRefugee = GeoUtils.distance(
    state.player.lat, state.player.lon,
    state.refugee.lat, state.refugee.lon
  );

  // Victory condition
  if (distToRefugee < CONFIG.refugeePickupRangeM) {
    state.refugee.reached = true;
    state.running = false;

    // Calculate escape bonus
    const healthBonus = Math.floor(state.player.health * CONFIG.scoreEscapeHealthMult);
    const timeUnderPar = Math.max(0, CONFIG.scoreEscapeParTimeS - state.elapsedS);
    const timeBonus = Math.floor(timeUnderPar * CONFIG.scoreEscapeTimeMult);
    const escapeBonus = CONFIG.scoreEscapeBase + healthBonus + timeBonus;
    state.player.score += escapeBonus;
    state.escapeBonus = escapeBonus;   // store for display on victory screen

    events.push({ type: 'refugee_reached', bonus: escapeBonus });
  }

  // Final push: entering 200m radius escalates difficulty
  if (!state.finalPushActive && distToRefugee < CONFIG.refugeeFinalPushM) {
    state.finalPushActive = true;
    CONFIG.spawnIntervalS = Math.max(2, CONFIG.spawnIntervalS / 2);
    events.push({ type: 'final_push' });
  }
}
```

**e) Expose `distToRefugee` and `refugee` in the `update()` return value** (add to the return object):
```js
return {
  state: { ...state },
  events,
  visibilityRadius: ...,
  audioRadius: CONFIG.audioRadiusM,
  isLowHealth: ...,
  revealAll: ...,
  refugee: state.refugee,                   // ← NEW
  distToRefugee: distToRefugeeValue,        // ← NEW (compute once above, store in local var)
};
```

**f) Add `escapeBonus` to `getState()` return** — already exposed via `state` spread; just make sure `state.escapeBonus` is initialized to `0` in `createInitialState()`.

---

### 2. `audio-engine.js`

**a) Add `createRefugeeBeaconBuffer(ctx)`** — a clean, hopeful electronic ping (contrast with zombie groans):
```js
function createRefugeeBeaconBuffer(ctx) {
  const sampleRate = ctx.sampleRate;
  const duration = 0.3;
  const length = sampleRate * duration;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    // Clean sine ping at 880Hz with fast decay
    const sample = Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 12);
    // Add a faint harmonic at 1320Hz
    const harmonic = Math.sin(2 * Math.PI * 1320 * t) * Math.exp(-t * 18) * 0.3;
    data[i] = (sample + harmonic) * 0.6;
  }
  return buffer;
}
```

**b) Add `createVictoryBuffer(ctx)`** — a rising three-note chime for the "ESCAPED" moment:
```js
function createVictoryBuffer(ctx) {
  const sampleRate = ctx.sampleRate;
  const duration = 1.5;
  const length = sampleRate * duration;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  const notes = [523, 659, 784]; // C5, E5, G5

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    let sample = 0;
    notes.forEach((freq, idx) => {
      const onset = idx * 0.4;
      if (t >= onset) {
        const localT = t - onset;
        sample += Math.sin(2 * Math.PI * freq * localT) * Math.exp(-localT * 3) * 0.3;
      }
    });
    data[i] = sample;
  }
  return buffer;
}
```

**c) Add to `init()` — generate both buffers** (alongside existing buffer generation):
```js
buffers.refugeeBeacon = createRefugeeBeaconBuffer(audioCtx);
buffers.victory = createVictoryBuffer(audioCtx);
```

**d) Add beacon state and `updateRefugeeBeacon(bearingDeg, distanceM)`** — **spatially positioned HRTF ping** in the direction of the Refugee.

> **How the player finds the Refugee eyes-free:**
> The beacon ping is placed in 3D space at the *bearing* of the Refugee relative to the player. Because the Web Audio listener orientation already tracks the player's compass heading (via `updateListenerHeading`), the ping shifts between the player's ears as they physically rotate. The player simply turns until the ping is centered in both ears — that direction is the Refugee. No map glancing needed. This is the same principle as a bat using echolocation.
>
> - Far away (500m) → ping every 4s, soft volume
> - Getting closer → ping rate accelerates, volume rises
> - Within 100m → rapid pulse (every 0.7s), clearly audible
> - The pitch also rises slightly as distance closes (5% per 100m) for an extra proximity cue

```js
let beaconInterval = null;
let _beaconCurrentInterval = Infinity;
let beaconPanner = null;  // reuse a single panner — update position each ping

function updateRefugeeBeacon(bearingDeg, distanceM) {
  if (!audioCtx || !initialized) return;

  // Pulse interval: 4000ms at 500m → 700ms at 0m
  const maxDist = 500;
  const minInterval = 700;
  const maxInterval = 4000;
  const clampedDist = Math.min(distanceM, maxDist);
  const intervalMs = minInterval + (clampedDist / maxDist) * (maxInterval - minInterval);

  // Only restart the timer if interval has shifted significantly (>150ms)
  // Prevents rapid restart thrashing from GPS jitter
  if (beaconInterval && Math.abs(intervalMs - _beaconCurrentInterval) < 150) {
    // Still update the panner position even if timer didn't restart
    _updateBeaconPannerPosition(bearingDeg, distanceM);
    return;
  }

  stopRefugeeBeacon();
  _beaconCurrentInterval = intervalMs;

  const playPing = () => {
    if (!buffers.refugeeBeacon) return;

    // Create a fresh panner each ping (BufferSourceNodes are single-use)
    const panner = audioCtx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 60;   // ~600m in game scale
    panner.rolloffFactor = 0.8; // gentler rolloff than zombies — beacon should always be audible

    // Position panner in the direction of the Refugee
    // Same coordinate convention as zombie panners (bearing 0=North → -Z)
    const rad = (bearingDeg - 90) * (Math.PI / 180);
    const scale = 0.1;  // 1m world = 0.1 audio units
    const x = Math.cos(rad) * clampedDist * scale;
    const z = Math.sin(rad) * clampedDist * scale;
    if (panner.positionX) {
      panner.positionX.value = x;
      panner.positionY.value = 0;
      panner.positionZ.value = z;
    } else {
      panner.setPosition(x, 0, z);
    }

    const gain = audioCtx.createGain();
    // Volume: 0.15 at max distance, 0.55 when very close
    gain.gain.value = 0.15 + (1 - clampedDist / maxDist) * 0.40;

    const src = audioCtx.createBufferSource();
    src.buffer = buffers.refugeeBeacon;
    // Pitch rises 5% per 100m of closure (up to 25% higher when adjacent)
    src.playbackRate.value = 1.0 + (1 - clampedDist / maxDist) * 0.25;

    src.connect(panner);
    panner.connect(gain);
    gain.connect(masterGain);
    src.start();
  };

  playPing();
  beaconInterval = setInterval(playPing, intervalMs);
}

function _updateBeaconPannerPosition(bearingDeg, distanceM) {
  // Called between interval restarts to keep panner direction current
  // (No-op in this implementation since each ping creates a fresh panner;
  //  retained as a hook in case we switch to a continuous-source model later)
}
```

let _beaconCurrentInterval = Infinity;

function stopRefugeeBeacon() {
  if (beaconInterval) {
    clearInterval(beaconInterval);
    beaconInterval = null;
    _beaconCurrentInterval = Infinity;
  }
}

function playVictory() {
  if (!audioCtx || !buffers.victory) return;
  stopRefugeeBeacon();
  const src = audioCtx.createBufferSource();
  src.buffer = buffers.victory;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.8;
  src.connect(gain);
  gain.connect(masterGain);
  src.start();
}
```

**e) Expose new functions in the return object:**
```js
return {
  // ... existing ...
  updateRefugeeBeacon,
  stopRefugeeBeacon,
  playVictory,
};
```

**f) Add `stopRefugeeBeacon()` call inside `cleanup()`**:
```js
function cleanup() {
  spatialSources.forEach((_, id) => removeZombieSound(id));
  stopAmbient();
  stopHeartbeat();
  stopRefugeeBeacon();  // ← NEW
}
```

---

### 3. `index.html`

**a) Add `#victory-screen`** after `#gameover-screen`:
```html
<!-- ============ VICTORY SCREEN ============ -->
<div id="victory-screen" class="screen">
  <div class="victory-content">
    <div class="victory-glow"></div>
    <h1 class="victory-title">ESCAPED</h1>
    <div class="victory-icon">🏠</div>
    <div class="victory-stats">
      <div class="vs-stat">
        <span class="vs-label">Time Survived</span>
        <span class="vs-value" id="vs-time">0:00</span>
      </div>
      <div class="vs-stat">
        <span class="vs-label">Distance Walked</span>
        <span class="vs-value" id="vs-distance">0m</span>
      </div>
      <div class="vs-stat">
        <span class="vs-label">Zombies Evaded</span>
        <span class="vs-value" id="vs-evaded">0</span>
      </div>
      <div class="vs-stat">
        <span class="vs-label">Perks Collected</span>
        <span class="vs-value" id="vs-perks">0</span>
      </div>
      <div class="vs-stat">
        <span class="vs-label">Escape Bonus</span>
        <span class="vs-value bonus" id="vs-bonus">+0</span>
      </div>
      <div class="vs-stat final-score">
        <span class="vs-label">FINAL SCORE</span>
        <span class="vs-value" id="vs-score">0</span>
      </div>
    </div>
    <button class="btn-primary" onclick="restartGame()">
      <span class="btn-icon">🔄</span>
      <span>RUN AGAIN</span>
    </button>
    <button class="btn-secondary" onclick="goHome()">
      <span>MAIN MENU</span>
    </button>
  </div>
</div>
```

**b) Add Refugee distance readout to the HUD** — add inside `.hud-info` (bottom bar), alongside zombie count / distance / timer:
```html
<div class="info-item" id="refugee-hud">
  <span class="info-icon">🏠</span>
  <span class="info-value" id="refugee-distance">---</span>
</div>
```

**c) Bump cache-bust version string** from `?v=7` → `?v=8` on all four script/style tags.

---

### 4. `style.css`

**a) Refugee map marker** (`.marker-refugee`):
```css
.marker-refugee {
  width: 32px;
  height: 32px;
  background: rgba(0, 220, 100, 0.15);
  border: 2px solid #00dc64;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  box-shadow: 0 0 12px rgba(0, 220, 100, 0.6), 0 0 30px rgba(0, 220, 100, 0.2);
  animation: refugee-pulse 2s ease-in-out infinite;
}

@keyframes refugee-pulse {
  0%, 100% { box-shadow: 0 0 12px rgba(0,220,100,0.6), 0 0 30px rgba(0,220,100,0.2); }
  50%       { box-shadow: 0 0 20px rgba(0,220,100,0.9), 0 0 50px rgba(0,220,100,0.4); }
}
```

**b) Final push mode — tint the screen edge red** (CSS class toggled by `app.js` when `final_push` event fires):
```css
.final-push-active #map-container::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 60px rgba(255, 60, 0, 0.35);
  z-index: 10;
  animation: finalpush-pulse 1s ease-in-out infinite;
}

@keyframes finalpush-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}
```

**c) Victory screen** — green/gold palette, contrast with the dark red of game over:
```css
#victory-screen { background: radial-gradient(ellipse at center, #001a0a 0%, #000d05 100%); }

.victory-content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px 24px;
}

.victory-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(0,220,100,0.12) 0%, transparent 70%);
  pointer-events: none;
}

.victory-title {
  font-family: 'Creepster', cursive;
  font-size: clamp(56px, 14vw, 88px);
  color: #00dc64;
  text-shadow: 0 0 30px rgba(0,220,100,0.8), 0 0 60px rgba(0,220,100,0.4);
  letter-spacing: 8px;
  animation: fadeIn 0.6s ease;
}

.victory-icon { font-size: 64px; animation: fadeIn 0.8s ease; }

.victory-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 24px;
  width: 100%;
  max-width: 340px;
  margin: 8px 0;
}

.vs-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.vs-label { font-size: 10px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; }
.vs-value { font-size: 22px; font-weight: 700; color: #fff; }
.vs-value.bonus { color: #00dc64; }

.vs-stat.final-score {
  grid-column: span 2;
  border-top: 1px solid rgba(0,220,100,0.2);
  padding-top: 12px;
  margin-top: 4px;
}
.vs-stat.final-score .vs-value { font-size: 36px; color: #00dc64; }
```

**d) Refugee HUD distance indicator** — style `.info-item#refugee-hud` with a green tint to distinguish it from other info items:
```css
#refugee-hud .info-icon { filter: hue-rotate(120deg); }
#refugee-hud .info-value { color: #00dc64; }
```

---

### 5. `app.js`

**a) Add `refugeeMarker` variable** near the top alongside other marker declarations:
```js
let refugeeMarker = null;
```

**b) In `onFirstGPSFix()`** — create the refugee marker after `GameEngine.init()`:
```js
// Create refugee marker (always visible, not fog-gated)
const state = GameEngine.getState();
if (state.refugee) {
  refugeeMarker = L.marker([state.refugee.lat, state.refugee.lon], {
    icon: L.divIcon({
      className: 'marker-refugee',
      html: '🏠',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    }),
    zIndexOffset: 900,
  }).addTo(map);
}
```

**c) In `gameLoop()`** — after getting `result` from `GameEngine.update()`:

1. Compute and display refugee distance and update audio beacon in HUD:
```js
if (result.refugee && !result.refugee.reached) {
  const d = Math.round(result.distToRefugee);
  document.getElementById('refugee-distance').textContent =
    d >= 1000 ? (d / 1000).toFixed(1) + 'km' : d + 'm';

  // Calculate bearing to refugee
  const refugeeBearing = GeoUtils.bearing(
    currentLat, currentLon, 
    result.refugee.lat, result.refugee.lon
  );

  // Update spatial audio beacon
  AudioEngine.updateRefugeeBeacon(refugeeBearing, result.distToRefugee);
}
```

2. Handle `final_push` event in `handleEvent()`:
```js
case 'final_push':
  document.getElementById('game-screen').classList.add('final-push-active');
  // Optional: brief "They're guarding it!" text flash
  showItemUsedFeedback('⚠️ They sense the refuge...');
  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  break;
```

3. Handle `refugee_reached` event in `handleEvent()`:
```js
case 'refugee_reached':
  onPlayerVictory(event.bonus);
  break;
```

**d) Add `onPlayerVictory(escapeBonus)` function** (parallel to `onPlayerDeath()`):
```js
function onPlayerVictory(escapeBonus) {
  clearInterval(gameLoopTimer);
  AudioEngine.playVictory();
  AudioEngine.cleanup();  // stops beacon, heartbeat, ambient

  if (navigator.vibrate) navigator.vibrate([100, 80, 100, 80, 400]);

  const state = GameEngine.getState();

  // Populate victory screen
  const elapsed = Math.floor(state.elapsedS);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  document.getElementById('vs-time').textContent =
    `${mins}:${secs.toString().padStart(2, '0')}`;

  const distM = Math.floor(state.player.distanceWalkedM);
  document.getElementById('vs-distance').textContent =
    distM >= 1000 ? (distM / 1000).toFixed(1) + 'km' : distM + 'm';

  document.getElementById('vs-evaded').textContent = state.zombiesEvaded;
  document.getElementById('vs-perks').textContent = state.perksCollected;
  document.getElementById('vs-bonus').textContent = '+' + escapeBonus.toLocaleString();
  document.getElementById('vs-score').textContent = state.player.score.toLocaleString();

  // Persist escape stats
  const escapes = parseInt(localStorage.getItem('zw_escapes') || '0') + 1;
  localStorage.setItem('zw_escapes', escapes.toString());
  const bestEscape = parseInt(localStorage.getItem('zw_best_escape_time') || '9999999');
  if (elapsed < bestEscape) {
    localStorage.setItem('zw_best_escape_time', elapsed.toString());
  }

  // Also check overall high score
  const highScore = parseInt(localStorage.getItem('zw_highscore') || '0');
  if (state.player.score > highScore) {
    localStorage.setItem('zw_highscore', state.player.score.toString());
  }

  setTimeout(() => showScreen('victory-screen'), 600);
}
```

**e) Update `restartGame()`** — remove final-push class on restart:
```js
document.getElementById('game-screen').classList.remove('final-push-active');
```

**f) Update `refugeeMarker` cleanup in `restartGame()`**:
```js
if (refugeeMarker) { map.removeLayer(refugeeMarker); refugeeMarker = null; }
```

**g) Update splash screen stat display in `loadHighScores()`** — optionally surface escape count:
```js
const escapes = localStorage.getItem('zw_escapes');
// (add an element to index.html for this if desired — low priority for M1)
```

---

## Implementation Order

Work through files in this order to keep the game runnable at each step:

```
Step 0 — Refactor            Create `config/` directory and extract CONFIG object from `game-engine.js`
Step 1 — game-engine.js   Add Refugee constants to config, state, init spawn, update check
                           Test: log refugee coords to console, log refugee_reached event
Step 2 — index.html        Add #victory-screen HTML + refugee HUD element + version bump
Step 3 — style.css         Refugee marker, final-push overlay, victory screen styles
Step 4 — audio-engine.js   Add beacon buffer, victory buffer, updateRefugeeBeacon(bearing, dist), playVictory()
Step 5 — app.js            Refugee marker creation, gameLoop wiring, onPlayerVictory(), event handlers
```

Each step is independently testable in simulation mode (desktop, SIM button).

---

## Testing Checklist

- [ ] **Sim mode — refugee spawns**: Open console, verify `[GameEngine] Refugee at ...` log on game start
- [ ] **Sim mode — navigate to refugee**: Use SIM arrow buttons to walk toward the refugee marker on the map; confirm victory screen triggers
- [ ] **Audio beacon**: Beacon ping plays and accelerates as you approach (test with headphones)
- [ ] **Final push**: Passing 200m from refugee triggers red edge overlay and "They sense the refuge..." text
- [ ] **Victory screen**: All stats populated correctly; escape bonus displayed
- [ ] **localStorage**: `zw_escapes` and `zw_best_escape_time` written after victory
- [ ] **Death still works**: Dying still shows game-over screen, not victory screen
- [ ] **Restart from victory**: "RUN AGAIN" button clears markers, starts new run with new refugee position
- [ ] **iOS**: AudioContext stays alive; victory sound plays; beacon stops cleanly on victory

---

## Scope Explicitly Excluded From M1

To keep this milestone tight, the following are **not** implemented here:

- Multi-stage runs (new refugee spawns after reaching one) → M4 Roguelike
- Refugee location only revealed via Radar perk → future consideration
- Pathfinding / GIS validation of refugee placement → M3
- High score display of escape stats on splash screen → low priority, can be done in M2 polish
