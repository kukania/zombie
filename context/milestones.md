# ZombieWalk — Milestones

## Status Legend
| Symbol | Meaning |
|---|---|
| ✅ | Done |
| 🔄 | In progress |
| 🔲 | Planned |
| ❓ | Needs design decision |

---

## Milestone 0 — Proof of Concept ✅
> *Can we build a GPS + spatial audio game that runs in a mobile browser?*

- ✅ Real-world map rendering (Leaflet.js + CartoDB dark tiles)
- ✅ GPS tracking via `navigator.geolocation.watchPosition`
- ✅ Fog of war canvas overlay (80m radius, radial gradient)
- ✅ Zombie spawn / patrol / chase AI (basic state machine)
- ✅ Web Audio API spatial sound (HRTF panning per zombie)
- ✅ Procedural sound synthesis (no external audio files)
- ✅ iOS AudioContext unlock + media volume channel routing
- ✅ Simulation mode for desktop testing without GPS
- ✅ Perk system (6 types, inventory slots, timed effects)
- ✅ HUD (health, score, zombie count, timer, compass)
- ✅ Game Over screen + localStorage high score persistence
- ✅ Deployed on GitHub Pages (static, no server)

---

## Milestone 1 — Refugee: Win Condition & Exit Object 🔄
> *The game currently only ends in death. A run needs a victory state — a place the player is trying to reach.*

**Problem:** There is no win condition. The only outcome is dying, which makes each run feel purposeless. A goal destination gives the player something to navigate toward, creating tension between "stay safe" and "push toward the exit."

**Concept:** The **Refugee** is a safe zone marker placed at a real-world GPS coordinate some distance from the player's starting point. Reaching it ends the run as a victory. The player must navigate there while evading zombies — a race with stakes.

### Design Questions
- ❓ **Placement strategy** — Fixed distance from start (e.g., 300–800m)? Random? Along a walkable bearing? Should it move/escalate if the player takes too long?
- ❓ **Visibility** — Always shown on map, or only revealed after collecting a specific perk (e.g., Radar)?
- ❓ **Difficulty interaction** — Does zombie spawn rate accelerate as the player gets closer to the Refugee (zombies "guarding" it)?
- ❓ **Multiple runs in one session** — After reaching the Refugee, a new one spawns farther away for a continuous run?

### Tasks
- ✅ **Refugee object in `game-engine.js`** — Spawn a single Refugee at a fixed bearing/distance from the player's starting GPS on `init()`. Store as `state.refugee = { lat, lon, reached: false }`
- ✅ **Win condition check** — In the update loop, if `distance(player, refugee) < pickupRangeM`, trigger `{ type: 'refugee_reached' }` event and set `state.running = false`
- ✅ **Refugee marker in `app.js`** — Render a distinct Leaflet divIcon for the Refugee (e.g., 🏠 or a green safe-zone ring). Always visible on the map (not fog-gated), so the player always knows which direction to head.
- ✅ **Audio beacon** — Emit a spatial HRTF ping that pulses at a rate inversely proportional to distance from the Refugee. As you get closer, the pulse speeds up — like a sonar ping. This lets eyes-free players orient toward the goal using sound alone.
- ✅ **Victory screen** — New `#victory-screen` distinct from `#gameover-screen`. Shows survival time, distance walked, zombies evaded, perks used, and a "ESCAPED" headline. Different tone from "YOU DIED".
- ✅ **Scoring integration** — Reaching the Refugee grants a large score bonus. Bonus scales with remaining health and remaining time (faster escape = higher bonus).
- ✅ **localStorage** — Track best escape time and escape count separately from death-based high score (`zw_escapes`, `zw_best_escape_time`).

---

## Milestone 1.5 — Platform Abstraction Layer (HAL) 🔲
> *Prepare the codebase for native ports (iOS/Android) by decoupling platform APIs from core game logic.*

**Problem:** The current codebase mixes game logic with browser-specific APIs (`navigator.geolocation`, Web Audio, `localStorage`, `vibrate`). To port this to a native mobile app framework later, we need to extract these.

**Concept:** Implement a Hardware Abstraction Layer (HAL). The core engine will use generic interfaces (e.g., `IGeoProvider`, `IAudioProvider`), while browser-specific logic will be moved into wrappers (e.g., `WebGeoProvider`). 

### Tasks
- 🔲 Define standard interfaces for Geo, Audio, Haptics, and Storage.
- 🔲 Create "Web Implementation" wrappers for current browser APIs.
- 🔲 Refactor `game-engine.js` and `audio-engine.js` to rely exclusively on these abstract providers rather than directly calling `window` or `navigator`.

---

## Milestone 2 — Safety-First, Audio-First Design 🔲
> *A player walking in the real world must NOT need to stare at their screen. The display is a complement; sound is the primary interface.*

**Problem:** The current game demands eyes-on-screen to track zombie positions via the map. This is dangerous when walking in a real environment.

**Design shift:** Sounds should communicate everything a player needs to survive. The screen should be optional (glanceable) — not required.

### Tasks
- 🔲 **Audio threat communication** — Direction and urgency of every zombie must be fully conveyed by spatial audio alone. Players close their eyes and still know where threats are.
- 🔲 **Audio UI for all game events** — Replace all visual-only feedback (danger flash, compass arrow color) with distinct audio cues:
  - Zombie entering chase range → distinct audio alert (not just spatial groan)
  - Health critical → escalating heartbeat cadence (already partially done)
  - Perk nearby → subtle proximity chime that gets louder as you approach
  - Item pickup confirmation → audio
  - Death → audio
- 🔲 **"Eyes-free" compass** — The compass widget currently requires looking at it. Replace/augment with binaural directional pings that fire periodically toward the nearest zombie, independent of whether the player is looking at the map.
- 🔲 **Screen dimming / minimal mode** — Add a UI mode where the display goes to a minimal/dark state (battery and attention-saving). Only critical alerts briefly light up the screen.
- 🔲 **Vibration language** — Define a clear haptic vocabulary:
  - Short pulse → perk nearby
  - Double pulse → zombie entering chase range
  - Long rumble → being attacked
  - Pattern (200-100-400) → death (already done)
- 🔲 **Accessibility audit** — Verify the game is fully playable without looking at the screen at all (eyes-free test session)

---

## Milestone 3 — GIS-Aware Spawn System 🔲
> *Zombies and perks should only appear in places a real human can physically reach. No spawning on roads, in rivers, or inside buildings.*

**Problem:** Current spawning is purely random within a radius ring around the player. This can place perks in the middle of a road or across a river.

**Design goal:** Use real-world geographic data to generate contextually valid spawn positions — road-avoidant, passable terrain.

### Tasks
- 🔲 **Research GIS data sources** — Evaluate options:
  - **Overpass API** (OpenStreetMap) — free, no key, query walkable paths/roads/water in real time
  - **Mapbox Isochrone / Walking Graph API** — commercial but accurate walkable area polygons
  - **Google Maps Roads API** — commercial
  - ❓ *Decision needed: which source fits a free/static deployment?*
- 🔲 **Define spawn zone rules:**
  - ❌ No spawn on `highway=*` (roads with vehicle traffic)
  - ❌ No spawn on `waterway=*`, `natural=water` (rivers, lakes)
  - ❌ No spawn inside closed building polygons
  - ✅ Prefer `footway`, `path`, `park`, `pedestrian` areas
- 🔲 **Spawn validation function** — Before placing a zombie or perk, query/cache the terrain type at that coordinate; reject and resample if the position is invalid
- 🔲 **Caching strategy** — Cache GIS query results around the player's position so the game doesn't make a network request every spawn cycle (tile-based cache, invalidate on significant movement)
- 🔲 **Fallback behavior** — If GIS data is unavailable (offline, timeout), fall back to current random spawn with a distance bias away from detected road tiles
- 🔲 **Zombie pathfinding (stretch goal)** — Instead of moving zombie in a straight line toward the player, route them along walkable paths so they don't walk through walls or water

---

## Milestone 4 — Roguelike Depth & Replayability 🔲
> *Surviving alone is not enough of a hook. Add build diversity, escalating narrative tension, and meaningful decisions each run.*

**Problem:** The current loop is: walk → evade zombies → collect perks → die. There's no meta-progression, no build identity, and no meaningful decision-making.

**Design goal:** Make each run feel distinct through roguelike perk synergies, event variety, and escalating story beats.

### Tasks

#### Perk Rework — Build Identity
- 🔲 **Perk rarities and tiers** — Common / Uncommon / Rare / Legendary tiers with visual distinction
- 🔲 **Perk synergies** — Combinations that unlock bonus behavior:
  - e.g., `Flashlight + Decoy` → decoy becomes a visible lure visible from further away
  - e.g., `Shield + Energy Drink` → sprint while shielded leaves a stun trail
  - e.g., three `Medkit`s collected in a run → passive health regen unlocked
- 🔲 **Choice moments** — Occasionally spawn a "perk choice event": player walks near a location and gets to pick 1 of 3 random perks (Hades-style)
- 🔲 **Negative perks / curses** — Rare items with a downside tradeoff:
  - e.g., `Fog Horn` — reveals all zombies but makes you louder (draws more)
  - e.g., `Adrenaline` — doubles move score but zombies detect you from farther
- 🔲 **Inventory limit as meaningful constraint** — 4 slots should feel like real decisions; add a "drop to swap" interaction

#### Escalating Events
- 🔲 **Named zombie waves** — Every N minutes, a named event spawns (e.g., "The Horde approaches from the north") with directional audio cue and brief display flash
- 🔲 **Screamer alert mechanic** — When a Screamer detects the player, it emits a signal that draws nearby walkers into chase state (not just itself)
- 🔲 **Environmental events** — Random timed events: foggy night (visibility halved), rain (audio range reduced), dead zone (no perk spawns for 2 min)
- 🔲 **Objective seeds** — Optional: each run gets a soft objective (e.g., "walk 500m", "collect 3 medkits") with a bonus perk reward if completed

#### Meta Progression (stretch)
- 🔲 **Run history** — Save last N run stats locally (time, distance, score, perks used)
- 🔲 **Unlockable starting perks** — After hitting score milestones, player can start future runs with one pre-selected perk in inventory
- 🔲 **Leaderboard (optional)** — Simple anonymous score submission to a free backend (e.g., PocketBase, Supabase free tier)

---

## Milestone 5 — GPS Error Handling & Collision Refinement 🔲
> *GPS has inherent error (typically ±5–15m, worse in urban canyons). The game must be tolerant of this — not punish players for sensor noise.*

**Problem:** Interactive objects treat GPS positions as exact points. A zombie 8m away may actually be anywhere from 0–20m away due to GPS error, causing phantom damage or missed pickups.

### Tasks

#### GPS Error Tolerance
- 🔲 **Interaction radius as a buffer** — All interaction thresholds (damage range, perk pickup range, detect range) already act as implicit buffers. Document and tune these explicitly as "GPS-error-aware" radii:
  - Perk pickup range: keep at 12m (forgiving)
  - Zombie damage range: consider raising from 8m → 12m (currently punishes valid evasion)
  - Zombie detect range: fine at 45m (large enough to be noise-tolerant)
- 🔲 **GPS smoothing / Kalman filter** — Raw GPS coordinates can jump erratically. Implement a simple weighted moving average (or lightweight Kalman filter) to smooth `currentLat/currentLon` before passing to the game engine
- 🔲 **Movement jitter threshold** — Currently ignores movements <1m. Tune this based on real-world testing; consider 2–3m threshold in GPS-noisy environments
- 🔲 **Accuracy indicator** — Use `position.coords.accuracy` from the Geolocation API to display GPS quality (already available, currently ignored). Warn player if accuracy > 30m

#### Rigid Object Separation (Visual)
- 🔲 **Problem:** When a zombie reaches the player's exact GPS position, both the player marker and zombie marker overlap completely — indistinguishable on the map
- 🔲 **Solution A (visual offset):** When a zombie is within damage range, render it with a small fixed pixel offset from the player marker (e.g., toward its approach bearing) so both markers remain separately visible
- 🔲 **Solution B (attack animation):** When a zombie is in damage range, switch its marker to a "lunging" CSS animation that visually communicates contact without exact overlap
- 🔲 **Solution C (range ring):** Draw a visible ring on the map around the player showing the damage threshold; zombie entering the ring triggers a visual effect
- ❓ *Decision needed: which solution best serves the audio-first design philosophy from Milestone 2?*

---

## Future / Backlog ❓
Ideas captured but not yet scoped into a milestone:

- **Multiplayer** — shared GPS sessions, players see each other on the map, can trade perks
- **Native app** — React Native or Capacitor wrapper for app store distribution
- **Custom zombie skins / audio packs** — downloadable content for different horror themes
- **Map themes** — switch tile styles (post-apocalyptic, night vision green, thermal)
- **Offline mode** — cache map tiles and GIS data for areas the player has visited
- **Neighborhood heatmap** — show where you've walked across all runs
