/* ============================================
   App — Main application controller
   Ties together map, fog, audio, and game engine
   ============================================ */

// ---- State ----
let map = null;
let fogCanvas = null;
let fogCtx = null;
let playerMarker = null;
let zombieMarkers = new Map();  // zombieId -> L.marker
let perkMarkers = new Map();    // perkId -> L.marker
let gameLoopTimer = null;
let gpsWatchId = null;
let currentLat = 0;
let currentLon = 0;
let currentHeading = 0;
let gpsLocked = false;
let lastUpdateTime = Date.now() / 1000;

// Simulation mode for desktop testing
let simMode = false;
let simLat = 37.7749;   // Default: San Francisco
let simLon = -122.4194;

// ---- Dark map style (CartoDB Dark Matter) ----
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_TILE_ATTRIBUTION = ''; // hidden in CSS

// ---- Custom marker icons ----
function createMarkerIcon(className, extraClass = '') {
  return L.divIcon({
    className: `marker-${className} ${extraClass}`,
    iconSize: className === 'perk' ? [28, 28] : className === 'player' ? [20, 20] : [14, 14],
    iconAnchor: className === 'perk' ? [14, 14] : className === 'player' ? [10, 10] : [7, 7],
  });
}

function createPerkIcon(perk) {
  return L.divIcon({
    className: 'marker-perk',
    html: perk.icon,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// ---- Screen management ----
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

// ---- Initialize map ----
function initMap() {
  map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    doubleClickZoom: false,
    dragging: false,       // Lock map to player position
    scrollWheelZoom: false,
    touchZoom: false,
    keyboard: false,
  });

  L.tileLayer(DARK_TILE_URL, {
    maxZoom: 19,
    subdomains: 'abcd',
  }).addTo(map);

  // Start centered at 0,0 until GPS locks
  map.setView([0, 0], 17);

  // Setup fog canvas
  fogCanvas = document.getElementById('fog-canvas');
  fogCtx = fogCanvas.getContext('2d');
  resizeFogCanvas();
  window.addEventListener('resize', resizeFogCanvas);

  console.log('[App] Map initialized');
}

function resizeFogCanvas() {
  if (!fogCanvas) return;
  fogCanvas.width = window.innerWidth;
  fogCanvas.height = window.innerHeight;
  drawFog(GameEngine.CONFIG.visibilityRadiusM);
}

// ---- Fog of War rendering ----
function drawFog(visibilityRadiusM, revealAll = false) {
  if (!fogCtx || !fogCanvas) return;

  const w = fogCanvas.width;
  const h = fogCanvas.height;

  fogCtx.clearRect(0, 0, w, h);

  if (revealAll) {
    // Radar pulse — semi-transparent
    fogCtx.fillStyle = 'rgba(5, 5, 5, 0.3)';
    fogCtx.fillRect(0, 0, w, h);
    return;
  }

  // Fill entire canvas with darkness
  fogCtx.fillStyle = 'rgba(5, 5, 5, 0.92)';
  fogCtx.fillRect(0, 0, w, h);

  // Cut out the visibility circle at center
  const cx = w / 2;
  const cy = h / 2;

  // Convert visibility radius from meters to pixels at current zoom
  const radiusPx = metersToPixels(visibilityRadiusM);

  // Create radial gradient for smooth fade
  const gradient = fogCtx.createRadialGradient(cx, cy, radiusPx * 0.5, cx, cy, radiusPx);
  gradient.addColorStop(0, 'rgba(5, 5, 5, 0)');
  gradient.addColorStop(0.7, 'rgba(5, 5, 5, 0)');
  gradient.addColorStop(0.85, 'rgba(5, 5, 5, 0.4)');
  gradient.addColorStop(1, 'rgba(5, 5, 5, 0.92)');

  // Use destination-out to "erase" the fog in the circle
  fogCtx.globalCompositeOperation = 'destination-out';
  fogCtx.beginPath();
  fogCtx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
  fogCtx.fillStyle = 'rgba(0, 0, 0, 1)';
  fogCtx.fill();

  // Re-draw the gradient edge for smooth fade
  fogCtx.globalCompositeOperation = 'source-over';
  fogCtx.beginPath();
  fogCtx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
  fogCtx.fillStyle = gradient;
  fogCtx.fill();

  // Optional: add subtle noise/texture to fog
  fogCtx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const alpha = Math.random() * 0.03;
    fogCtx.fillStyle = `rgba(139, 0, 0, ${alpha})`;
    fogCtx.beginPath();
    fogCtx.arc(x, y, Math.random() * 20 + 5, 0, Math.PI * 2);
    fogCtx.fill();
  }
}

/**
 * Convert meters to pixels at current map zoom level
 */
function metersToPixels(meters) {
  if (!map) return 100;
  const zoom = map.getZoom();
  const lat = currentLat || 0;
  // Approximate meters per pixel at given zoom and latitude
  const metersPerPixel =
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  return meters / metersPerPixel;
}

// ---- GPS Tracking ----
function startGPS() {
  if (!navigator.geolocation) {
    console.error('[GPS] Geolocation not supported');
    updateGPSStatus('GPS not supported', false);
    enableSimMode();
    return;
  }

  updateGPSStatus('Acquiring GPS...', false);

  gpsWatchId = navigator.geolocation.watchPosition(
    (position) => {
      currentLat = position.coords.latitude;
      currentLon = position.coords.longitude;
      currentHeading = position.coords.heading || currentHeading;

      if (!gpsLocked) {
        gpsLocked = true;
        updateGPSStatus('GPS locked', true);
        onFirstGPSFix(currentLat, currentLon);

        // Hide GPS status after a moment
        setTimeout(() => {
          const el = document.getElementById('gps-status');
          if (el) el.style.opacity = '0';
        }, 2000);
      }
    },
    (error) => {
      console.warn('[GPS] Error:', error.message);
      updateGPSStatus('GPS error — enabling simulation', false);
      setTimeout(() => enableSimMode(), 1500);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 10000,
    }
  );
}

function updateGPSStatus(text, locked) {
  const el = document.getElementById('gps-status');
  if (!el) return;
  el.style.opacity = '1';
  el.querySelector('span:last-child').textContent = text;
  const dot = el.querySelector('.gps-dot');
  if (locked) {
    dot.classList.add('locked');
  } else {
    dot.classList.remove('locked');
  }
}

function enableSimMode() {
  simMode = true;
  currentLat = simLat;
  currentLon = simLon;
  gpsLocked = true;

  // Show sim controls
  document.getElementById('sim-toggle').style.display = 'block';

  onFirstGPSFix(simLat, simLon);
  updateGPSStatus('Simulation mode', true);
  setTimeout(() => {
    const el = document.getElementById('gps-status');
    if (el) el.style.opacity = '0';
  }, 2000);
}

function toggleSimMode() {
  const controls = document.getElementById('sim-controls');
  controls.style.display = controls.style.display === 'none' ? 'flex' : 'none';
}

function simMove(dir) {
  const step = 0.0001; // ~11 meters
  switch (dir) {
    case 'n': currentLat += step; break;
    case 's': currentLat -= step; break;
    case 'e': currentLon += step; break;
    case 'w': currentLon -= step; break;
  }
  simLat = currentLat;
  simLon = currentLon;
}

// ---- Compass / Device Orientation ----
function startCompass() {
  if (window.DeviceOrientationEvent) {
    // iOS 13+ requires permission
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // Will be requested on user gesture (start button)
      DeviceOrientationEvent.requestPermission()
        .then((response) => {
          if (response === 'granted') {
            window.addEventListener('deviceorientation', onDeviceOrientation);
          }
        })
        .catch(console.error);
    } else {
      window.addEventListener('deviceorientation', onDeviceOrientation);
    }
  }
}

function onDeviceOrientation(event) {
  // webkitCompassHeading for iOS, alpha for Android
  if (event.webkitCompassHeading != null) {
    currentHeading = event.webkitCompassHeading;
  } else if (event.alpha != null) {
    currentHeading = 360 - event.alpha;
  }
}

// ---- First GPS fix — start the game ----
function onFirstGPSFix(lat, lon) {
  console.log('[App] First GPS fix:', lat, lon);

  // Center map on player
  map.setView([lat, lon], 17);

  // Create player marker
  playerMarker = L.marker([lat, lon], {
    icon: createMarkerIcon('player'),
    zIndexOffset: 1000,
  }).addTo(map);

  // Initialize game engine
  GameEngine.init(lat, lon);

  // Start ambient audio
  AudioEngine.startAmbient();

  // Start game loop
  lastUpdateTime = Date.now() / 1000;
  gameLoopTimer = setInterval(gameLoop, 1000); // 1 Hz update
}

// ---- Main Game Loop ----
function gameLoop() {
  if (!GameEngine.isRunning()) return;

  const now = Date.now() / 1000;
  const dt = now - lastUpdateTime;
  lastUpdateTime = now;

  // Update audio listener heading
  AudioEngine.updateListenerHeading(currentHeading);

  // Run game engine update
  const result = GameEngine.update(currentLat, currentLon, currentHeading, dt);
  if (!result) return;

  const { state, events, visibilityRadius, audioRadius, isLowHealth, revealAll } = result;

  // --- Update map position ---
  map.setView([currentLat, currentLon], map.getZoom(), { animate: true, duration: 0.5 });

  // Update player marker
  if (playerMarker) {
    playerMarker.setLatLng([currentLat, currentLon]);
  }

  // --- Update fog of war ---
  drawFog(visibilityRadius, revealAll);

  // --- Update zombie markers ---
  const activeZombieIds = new Set();
  state.zombies.forEach((zombie) => {
    activeZombieIds.add(zombie.id);
    const distToPlayer = GeoUtils.distance(
      currentLat, currentLon, zombie.lat, zombie.lon
    );

    // Only show marker if within visibility radius (or reveal active)
    const visible = distToPlayer <= visibilityRadius || revealAll;

    if (visible) {
      if (zombieMarkers.has(zombie.id)) {
        // Update position
        zombieMarkers.get(zombie.id).setLatLng([zombie.lat, zombie.lon]);
      } else {
        // Create new marker
        const marker = L.marker([zombie.lat, zombie.lon], {
          icon: createMarkerIcon('zombie', zombie.type),
        }).addTo(map);
        zombieMarkers.set(zombie.id, marker);
      }
    } else {
      // Hide marker if out of range
      if (zombieMarkers.has(zombie.id)) {
        map.removeLayer(zombieMarkers.get(zombie.id));
        zombieMarkers.delete(zombie.id);
      }
    }

    // Update spatial audio for zombies in audio range
    if (distToPlayer <= audioRadius) {
      const bearing = GeoUtils.bearing(currentLat, currentLon, zombie.lat, zombie.lon);
      AudioEngine.updateZombieSound(zombie.id, bearing, distToPlayer, zombie.type);
    } else {
      AudioEngine.removeZombieSound(zombie.id);
    }
  });

  // Clean up markers for despawned zombies
  zombieMarkers.forEach((marker, id) => {
    if (!activeZombieIds.has(id)) {
      map.removeLayer(marker);
      zombieMarkers.delete(id);
      AudioEngine.removeZombieSound(id);
    }
  });

  // --- Update perk markers ---
  const activePerkIds = new Set();
  state.perks.forEach((perk) => {
    activePerkIds.add(perk.id);
    const distToPlayer = GeoUtils.distance(
      currentLat, currentLon, perk.lat, perk.lon
    );
    const visible = distToPlayer <= visibilityRadius || revealAll;

    if (visible) {
      if (perkMarkers.has(perk.id)) {
        perkMarkers.get(perk.id).setLatLng([perk.lat, perk.lon]);
      } else {
        const marker = L.marker([perk.lat, perk.lon], {
          icon: createPerkIcon(perk.type),
        }).addTo(map);
        perkMarkers.set(perk.id, marker);
      }
    } else {
      if (perkMarkers.has(perk.id)) {
        map.removeLayer(perkMarkers.get(perk.id));
        perkMarkers.delete(perk.id);
      }
    }
  });

  // Clean up despawned perks
  perkMarkers.forEach((marker, id) => {
    if (!activePerkIds.has(id)) {
      map.removeLayer(marker);
      perkMarkers.delete(id);
    }
  });

  // --- Update HUD ---
  updateHUD(state, visibilityRadius);

  // --- Update compass arrow ---
  updateCompass(state.zombies);

  // --- Handle heartbeat ---
  if (isLowHealth) {
    AudioEngine.startHeartbeat();
  } else {
    AudioEngine.stopHeartbeat();
  }

  // --- Process events ---
  events.forEach(handleEvent);
}

// ---- Event handlers ----
function handleEvent(event) {
  switch (event.type) {
    case 'player_hit':
      flashDamage();
      AudioEngine.playUI('hurt', 0.7);
      // Vibrate if supported
      if (navigator.vibrate) navigator.vibrate(200);
      break;

    case 'player_death':
      onPlayerDeath();
      break;

    case 'perk_collected':
      AudioEngine.playUI('pickup', 0.6);
      if (navigator.vibrate) navigator.vibrate(50);
      break;

    case 'zombie_chase':
      showDangerIndicator();
      break;

    case 'zombie_despawn':
      AudioEngine.removeZombieSound(event.id);
      break;

    case 'item_used':
      AudioEngine.playUI('pickup', 0.4);
      showItemUsedFeedback(event.detail);
      break;
  }
}

// ---- HUD Updates ----
function updateHUD(state, visRadius) {
  // Health bar
  const healthPct = (state.player.health / GameEngine.CONFIG.maxHealth) * 100;
  const healthBar = document.getElementById('health-bar');
  healthBar.style.width = healthPct + '%';
  if (healthPct <= 30) {
    healthBar.classList.add('low');
  } else {
    healthBar.classList.remove('low');
  }
  document.getElementById('health-text').textContent = state.player.health;

  // Score
  document.getElementById('score-value').textContent = state.player.score.toLocaleString();

  // Zombie count
  document.getElementById('zombie-count').textContent = state.zombies.length;

  // Distance
  const distM = Math.floor(state.player.distanceWalkedM);
  document.getElementById('distance-walked').textContent =
    distM >= 1000 ? (distM / 1000).toFixed(1) + 'km' : distM + 'm';

  // Survival time
  const elapsed = Math.floor(state.elapsedS);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  document.getElementById('survival-time').textContent =
    `${mins}:${secs.toString().padStart(2, '0')}`;

  // Inventory
  state.player.inventory.forEach((item, i) => {
    const slot = document.getElementById(`inv-slot-${i}`);
    if (item) {
      slot.textContent = item.icon;
      slot.classList.add('has-item');
      slot.title = item.name;
    } else {
      slot.textContent = '';
      slot.classList.remove('has-item');
      slot.title = '';
    }
  });
}

function updateCompass(zombies) {
  if (!zombies.length) return;

  // Find nearest zombie
  let nearestDist = Infinity;
  let nearestBearing = 0;
  zombies.forEach((z) => {
    const dist = GeoUtils.distance(currentLat, currentLon, z.lat, z.lon);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestBearing = GeoUtils.bearing(currentLat, currentLon, z.lat, z.lon);
    }
  });

  // Rotate compass arrow to point at nearest zombie (relative to player heading)
  const relativeBearing = (nearestBearing - currentHeading + 360) % 360;
  const arrow = document.getElementById('compass-arrow');
  if (arrow) {
    arrow.style.transform = `rotate(${relativeBearing}deg)`;

    // Color based on distance
    if (nearestDist < 30) {
      arrow.style.background = 'linear-gradient(to top, transparent, #ff2200)';
    } else if (nearestDist < 80) {
      arrow.style.background = 'linear-gradient(to top, transparent, #ff6600)';
    } else {
      arrow.style.background = 'linear-gradient(to top, transparent, #cc1100)';
    }
  }
}

// ---- Visual feedback ----
function flashDamage() {
  const flash = document.getElementById('damage-flash');
  flash.classList.remove('active');
  // Force reflow
  void flash.offsetWidth;
  flash.classList.add('active');
}

function showDangerIndicator() {
  const indicator = document.getElementById('danger-indicator');
  indicator.style.display = 'block';
  setTimeout(() => {
    indicator.style.display = 'none';
  }, 2000);
}

function showItemUsedFeedback(text) {
  // Brief floating text feedback
  const el = document.createElement('div');
  el.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(0,204,68,0.2); border: 1px solid rgba(0,204,68,0.4);
    color: #00cc44; padding: 8px 20px; border-radius: 8px;
    font-size: 14px; font-weight: 600; z-index: 35;
    animation: fadeIn 0.2s ease;
    pointer-events: none;
  `;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// ---- Item usage ----
function useItem(slotIndex) {
  const event = GameEngine.useItem(slotIndex);
  if (event) {
    handleEvent(event);
  }
}

// ---- Game Over ----
function onPlayerDeath() {
  // Stop game loop
  clearInterval(gameLoopTimer);
  AudioEngine.cleanup();
  if (navigator.vibrate) navigator.vibrate([200, 100, 400]);

  const state = GameEngine.getState();

  // Update game over stats
  const elapsed = Math.floor(state.elapsedS);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  document.getElementById('go-time').textContent =
    `${mins}:${secs.toString().padStart(2, '0')}`;

  const distM = Math.floor(state.player.distanceWalkedM);
  document.getElementById('go-distance').textContent =
    distM >= 1000 ? (distM / 1000).toFixed(1) + 'km' : distM + 'm';

  document.getElementById('go-evaded').textContent = state.zombiesEvaded;
  document.getElementById('go-perks').textContent = state.perksCollected;
  document.getElementById('go-score').textContent = state.player.score.toLocaleString();

  // Save high score
  const highScore = parseInt(localStorage.getItem('zw_highscore') || '0');
  if (state.player.score > highScore) {
    localStorage.setItem('zw_highscore', state.player.score.toString());
  }
  const bestTime = parseInt(localStorage.getItem('zw_besttime') || '0');
  if (elapsed > bestTime) {
    localStorage.setItem('zw_besttime', elapsed.toString());
  }

  setTimeout(() => {
    showScreen('gameover-screen');
  }, 800);
}

// ---- Mobile Debug Overlay ----
function debugLog(msg) {
  console.log(msg);
  let overlay = document.getElementById('debug-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'debug-overlay';
    overlay.style.cssText = `
      position: fixed; bottom: 0; left: 0; right: 0; max-height: 40vh;
      overflow-y: auto; background: rgba(0,0,0,0.9); color: #0f0;
      font-family: monospace; font-size: 11px; padding: 8px;
      z-index: 99999; pointer-events: none;
    `;
    document.body.appendChild(overlay);
  }
  const line = document.createElement('div');
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  overlay.appendChild(line);
  overlay.scrollTop = overlay.scrollHeight;
}

// ---- Start / Restart ----
function startGame() {
  debugLog('startGame() called');
  try {
    // Show game screen FIRST (must happen while user gesture is still active)
    debugLog('Switching to game screen...');
    showScreen('game-screen');
    debugLog('Screen switched OK');

    // Init map if not already done
    if (!map) {
      debugLog('Initializing map...');
      initMap();
      debugLog('Map initialized OK');
    }

    // Start GPS tracking immediately (needs user gesture context for permission prompt)
    debugLog('Starting GPS...');
    startGPS();
    debugLog('GPS started OK');

    // Start compass (needs user gesture context on iOS for DeviceOrientation permission)
    debugLog('Starting compass...');
    startCompass();
    debugLog('Compass started OK');

    // Init audio AFTER — don't block the above with await
    // Audio also benefits from user gesture but is non-critical
    debugLog('Initializing audio...');
    AudioEngine.init()
      .then(() => {
        AudioEngine.resume();
        debugLog('Audio ready');
      })
      .catch((audioErr) => {
        debugLog('Audio init failed (non-blocking): ' + audioErr.message);
      });

    // Show sim toggle for desktop testing
    document.getElementById('sim-toggle').style.display = 'block';
    debugLog('startGame() completed successfully');
  } catch (err) {
    debugLog('ERROR in startGame(): ' + err.message);
    console.error('[App] startGame() failed:', err);
    alert('Failed to start game: ' + err.message);
  }
}

function restartGame() {
  // Clean up old markers
  zombieMarkers.forEach((m) => map.removeLayer(m));
  zombieMarkers.clear();
  perkMarkers.forEach((m) => map.removeLayer(m));
  perkMarkers.clear();

  showScreen('game-screen');

  // Re-init
  AudioEngine.resume();
  onFirstGPSFix(currentLat, currentLon);
}

function goHome() {
  showScreen('splash-screen');
  loadHighScores();
}

// ---- Load high scores on splash ----
function loadHighScores() {
  const highScore = localStorage.getItem('zw_highscore');
  const bestTime = localStorage.getItem('zw_besttime');

  if (highScore || bestTime) {
    document.getElementById('splash-stats').style.display = 'flex';
    document.getElementById('high-score').textContent = parseInt(highScore || '0').toLocaleString();
    const bt = parseInt(bestTime || '0');
    const mins = Math.floor(bt / 60);
    const secs = bt % 60;
    document.getElementById('best-time').textContent =
      `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// ---- Init on load ----
window.addEventListener('DOMContentLoaded', () => {
  loadHighScores();
  console.log('[ZombieWalk] Ready. Tap BEGIN SURVIVAL to start.');
});
