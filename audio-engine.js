/* ============================================
   AudioEngine — Spatial audio for zombie sounds
   Uses Web Audio API for 3D positioned sound
   ============================================ */

const AudioEngine = (() => {
  let audioCtx = null;
  let masterGain = null;
  let ambientGain = null;
  let initialized = false;

  // Active spatial sources (one per zombie)
  const spatialSources = new Map(); // zombieId -> { panner, gain, source, ... }

  // Preloaded audio buffers
  const buffers = {};

  // Listener heading (compass, 0=North)
  let listenerHeading = 0;

  // ---- Sound synthesis (no external files needed!) ----

  /**
   * Generate a low rumbling zombie groan using oscillators
   */
  function createZombieGroanBuffer(ctx, duration = 2.0) {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Base growl (low frequency)
      let sample = Math.sin(2 * Math.PI * 80 * t + Math.sin(2 * Math.PI * 3 * t) * 2) * 0.3;
      // Formant-like resonance
      sample += Math.sin(2 * Math.PI * 180 * t + Math.sin(2 * Math.PI * 5 * t) * 1.5) * 0.15;
      // Noise component (breath-like)
      sample += (Math.random() * 2 - 1) * 0.08 * Math.sin(2 * Math.PI * 2 * t);
      // Amplitude envelope — rises and falls
      const env = Math.sin(Math.PI * t / duration) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 0.8 * t));
      data[i] = sample * env;
    }
    return buffer;
  }

  /**
   * Generate zombie shuffle footstep
   */
  function createFootstepBuffer(ctx, duration = 0.3) {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Impact + scrape
      const impact = Math.exp(-t * 30) * (Math.random() * 2 - 1);
      const scrape = (Math.random() * 2 - 1) * 0.3 * Math.exp(-t * 8);
      data[i] = (impact * 0.6 + scrape * 0.4) * 0.5;
    }
    return buffer;
  }

  /**
   * Generate screamer howl — higher pitched
   */
  function createScreamerBuffer(ctx, duration = 3.0) {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Rising shriek
      const freq = 200 + 600 * (t / duration);
      let sample = Math.sin(2 * Math.PI * freq * t) * 0.4;
      // Harmonic
      sample += Math.sin(2 * Math.PI * freq * 1.5 * t) * 0.15;
      // Distortion
      sample += (Math.random() * 2 - 1) * 0.1;
      // Envelope
      const env = Math.sin(Math.PI * t / duration);
      data[i] = sample * env * 0.6;
    }
    return buffer;
  }

  /**
   * Generate heartbeat sound
   */
  function createHeartbeatBuffer(ctx) {
    const sampleRate = ctx.sampleRate;
    const duration = 0.8; // one heartbeat cycle
    const length = sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Two thuds (lub-dub)
      const beat1 = Math.exp(-((t - 0.05) ** 2) / 0.001) * Math.sin(2 * Math.PI * 50 * t);
      const beat2 = Math.exp(-((t - 0.25) ** 2) / 0.002) * Math.sin(2 * Math.PI * 40 * t) * 0.7;
      data[i] = (beat1 + beat2) * 0.8;
    }
    return buffer;
  }

  /**
   * Generate ambient wind
   */
  function createWindBuffer(ctx, duration = 5.0) {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    let lastSample = 0;
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Filtered noise (brown noise-ish)
      const white = Math.random() * 2 - 1;
      lastSample = lastSample * 0.98 + white * 0.02;
      // Slow modulation
      const mod = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.15 * t);
      data[i] = lastSample * mod * 3.0;
    }
    return buffer;
  }

  /**
   * Generate a pickup chime
   */
  function createPickupBuffer(ctx) {
    const sampleRate = ctx.sampleRate;
    const duration = 0.5;
    const length = sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const freq1 = 880;
      const freq2 = 1320;
      const sample = 
        Math.sin(2 * Math.PI * freq1 * t) * Math.exp(-t * 6) * 0.3 +
        Math.sin(2 * Math.PI * freq2 * t) * Math.exp(-t * 4) * 0.2;
      data[i] = sample;
    }
    return buffer;
  }

  /**
   * Generate damage/hurt sound
   */
  function createHurtBuffer(ctx) {
    const sampleRate = ctx.sampleRate;
    const duration = 0.4;
    const length = sampleRate * duration;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const noise = Math.random() * 2 - 1;
      const tone = Math.sin(2 * Math.PI * 120 * t + Math.sin(2 * Math.PI * 8 * t) * 3);
      const env = Math.exp(-t * 8);
      data[i] = (noise * 0.3 + tone * 0.5) * env * 0.7;
    }
    return buffer;
  }

  // ---- Core API ----

  /**
   * Unlock audio on iOS — MUST be called synchronously during a user gesture (tap/click).
   * Creates the AudioContext, resumes it, and plays a short beep to verify audio works.
   */
  function unlockAudio() {
    if (audioCtx) {
      // Already created, just ensure it's running
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      return;
    }

    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      console.log('[AudioEngine] AudioContext created, state:', audioCtx.state);

      // Resume immediately (must happen during user gesture on iOS)
      const resumePromise = audioCtx.resume();
      if (resumePromise) {
        resumePromise.then(() => {
          console.log('[AudioEngine] AudioContext resumed, state:', audioCtx.state);
        });
      }

      // Play an audible test beep to fully unlock iOS audio
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 440; // A4 note
      gain.gain.value = 0.3;
      // Quick fade out
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.3);

      console.log('[AudioEngine] Audio unlocked with test beep, state:', audioCtx.state);
    } catch (e) {
      console.error('[AudioEngine] Failed to unlock audio:', e);
    }
  }

  /**
   * Initialize the audio engine — generates all sound buffers.
   * Can be called after unlockAudio().
   */
  async function init() {
    if (initialized) return;

    try {
      // Ensure AudioContext exists
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }

      // Master volume
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.8;
      masterGain.connect(audioCtx.destination);

      // Ambient channel
      ambientGain = audioCtx.createGain();
      ambientGain.gain.value = 0.3;
      ambientGain.connect(masterGain);

      // Set listener defaults (HRTF rendering)
      if (audioCtx.listener.positionX) {
        audioCtx.listener.positionX.value = 0;
        audioCtx.listener.positionY.value = 0;
        audioCtx.listener.positionZ.value = 0;
      } else {
        audioCtx.listener.setPosition(0, 0, 0);
      }

      // Generate all sound buffers
      buffers.zombieGroan = createZombieGroanBuffer(audioCtx, 2.5);
      buffers.zombieGroan2 = createZombieGroanBuffer(audioCtx, 3.0);
      buffers.footstep = createFootstepBuffer(audioCtx);
      buffers.screamer = createScreamerBuffer(audioCtx);
      buffers.heartbeat = createHeartbeatBuffer(audioCtx);
      buffers.wind = createWindBuffer(audioCtx, 6.0);
      buffers.pickup = createPickupBuffer(audioCtx);
      buffers.hurt = createHurtBuffer(audioCtx);

      initialized = true;
      console.log('[AudioEngine] Initialized with synthesized sounds');
    } catch (e) {
      console.error('[AudioEngine] Failed to init:', e);
    }
  }

  /**
   * Update listener orientation based on compass heading
   */
  function updateListenerHeading(headingDeg) {
    if (!audioCtx) return;
    listenerHeading = headingDeg;

    // Convert heading to forward vector (heading 0 = North = -Z in Web Audio)
    const rad = (headingDeg - 90) * (Math.PI / 180);
    const fx = Math.cos(rad);
    const fz = Math.sin(rad);

    if (audioCtx.listener.forwardX) {
      audioCtx.listener.forwardX.value = fx;
      audioCtx.listener.forwardY.value = 0;
      audioCtx.listener.forwardZ.value = fz;
      audioCtx.listener.upX.value = 0;
      audioCtx.listener.upY.value = 1;
      audioCtx.listener.upZ.value = 0;
    } else {
      audioCtx.listener.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  /**
   * Create or update a spatial sound for a zombie
   * @param {string} id — zombie ID
   * @param {number} bearing — bearing from player to zombie (degrees)
   * @param {number} distance — distance in meters
   * @param {string} type — 'walker' | 'runner' | 'screamer'
   */
  function updateZombieSound(id, bearingDeg, distanceM, type) {
    if (!audioCtx || !initialized) return;

    // Convert bearing + distance to XZ position relative to listener
    // Bearing 0=North → -Z, 90=East → +X
    const rad = (bearingDeg - 90) * (Math.PI / 180);
    // Scale: 1 meter in world = ~0.1 units in audio space (so max 200m = 20 units)
    const scale = 0.1;
    const x = Math.cos(rad) * distanceM * scale;
    const z = Math.sin(rad) * distanceM * scale;

    let source = spatialSources.get(id);

    if (!source) {
      // Create new spatial source for this zombie
      const panner = audioCtx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.maxDistance = 30; // ~300m scaled
      panner.rolloffFactor = 1.5;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 360;

      const gain = audioCtx.createGain();
      gain.gain.value = type === 'screamer' ? 0.7 : 0.4;

      panner.connect(gain);
      gain.connect(masterGain);

      source = {
        panner,
        gain,
        activeNode: null,
        type,
        nextPlayTime: 0,
      };

      spatialSources.set(id, source);
    }

    // Update panner position
    if (source.panner.positionX) {
      source.panner.positionX.value = x;
      source.panner.positionY.value = 0;
      source.panner.positionZ.value = z;
    } else {
      source.panner.setPosition(x, 0, z);
    }

    // Schedule looping groan sounds
    const now = audioCtx.currentTime;
    if (now >= source.nextPlayTime) {
      const bufferKey =
        type === 'screamer'
          ? 'screamer'
          : Math.random() > 0.5
          ? 'zombieGroan'
          : 'zombieGroan2';
      const buf = buffers[bufferKey];
      if (buf) {
        const node = audioCtx.createBufferSource();
        node.buffer = buf;
        node.connect(source.panner);
        node.start(now);
        source.activeNode = node;
        // Next groan after this one finishes + random gap
        source.nextPlayTime = now + buf.duration + 1 + Math.random() * 3;
      }
    }
  }

  /**
   * Remove spatial source for a zombie
   */
  function removeZombieSound(id) {
    const source = spatialSources.get(id);
    if (source) {
      if (source.activeNode) {
        try { source.activeNode.stop(); } catch (e) {}
      }
      source.panner.disconnect();
      source.gain.disconnect();
      spatialSources.delete(id);
    }
  }

  /**
   * Play a one-shot UI sound (non-spatial)
   */
  function playUI(soundName, volume = 0.5) {
    if (!audioCtx || !buffers[soundName]) return;
    const source = audioCtx.createBufferSource();
    source.buffer = buffers[soundName];
    const gain = audioCtx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(masterGain);
    source.start();
  }

  // Ambient wind loop
  let windNode = null;

  function startAmbient() {
    if (!audioCtx || windNode) return;
    windNode = audioCtx.createBufferSource();
    windNode.buffer = buffers.wind;
    windNode.loop = true;
    windNode.connect(ambientGain);
    windNode.start();
  }

  function stopAmbient() {
    if (windNode) {
      try { windNode.stop(); } catch (e) {}
      windNode = null;
    }
  }

  // Heartbeat loop
  let heartbeatNode = null;
  let heartbeatInterval = null;

  function startHeartbeat() {
    if (!audioCtx || heartbeatInterval) return;
    const playBeat = () => {
      const src = audioCtx.createBufferSource();
      src.buffer = buffers.heartbeat;
      const gain = audioCtx.createGain();
      gain.gain.value = 0.6;
      src.connect(gain);
      gain.connect(masterGain);
      src.start();
    };
    playBeat();
    heartbeatInterval = setInterval(playBeat, 900);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  /**
   * Clean up all spatial sources
   */
  function cleanup() {
    spatialSources.forEach((_, id) => removeZombieSound(id));
    stopAmbient();
    stopHeartbeat();
  }

  /**
   * Resume audio context (required after mobile suspend)
   */
  function resume() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  return {
    unlockAudio,
    init,
    updateListenerHeading,
    updateZombieSound,
    removeZombieSound,
    playUI,
    startAmbient,
    stopAmbient,
    startHeartbeat,
    stopHeartbeat,
    cleanup,
    resume,
    get isInitialized() { return initialized; },
  };
})();
