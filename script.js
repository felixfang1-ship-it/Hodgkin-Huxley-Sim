// Asset paths used by the simulator
// Each channel state and ion particle image is loaded from the assets folder.
const ASSETS = {
  sodium: {
    closed: 'assets/sodium_closed.png',
    open: 'assets/sodium_open.png',
    inactivated: 'assets/sodium_inactivated.png',
    particle: 'assets/sodium_particle.png'
  },
  potassium: {
    closed: 'assets/potassium_closed.png',
    open: 'assets/potassium_open.png',
    particle: 'assets/potassium_particle.png'
  },
  leak: {
    closed: 'assets/leak_closed.png',
    open: 'assets/leak_open.png',
    particles: [
      'assets/leak_particle_1.png',
      'assets/leak_particle_2.png',
      'assets/leak_particle_3.png',
      'assets/leak_particle_4.png',
      'assets/leak_particle_5.png'
    ]
  }
};


// HTML element references
// These connect the JavaScript logic to the dropdowns, images, labels, meters, and graphs.
const sodiumStateEl = document.getElementById('sodiumState');
const potassiumStateEl = document.getElementById('potassiumState');
const leakStateEl = document.getElementById('leakState');

const sodiumChannelEl = document.getElementById('sodiumChannel');
const potassiumChannelEl = document.getElementById('potassiumChannel');
const leakChannelEl = document.getElementById('leakChannel');

const sodiumStatusEl = document.getElementById('sodiumStatus');
const potassiumStatusEl = document.getElementById('potassiumStatus');
const leakStatusEl = document.getElementById('leakStatus');

const sodiumExplanationEl = document.getElementById('sodiumExplanation');
const potassiumExplanationEl = document.getElementById('potassiumExplanation');
const leakExplanationEl = document.getElementById('leakExplanation');

const sodiumMeterEl = document.getElementById('sodiumMeter');
const potassiumMeterEl = document.getElementById('potassiumMeter');
const leakGradientMarkerEl = document.getElementById('leakGradientMarker');
const gradientTextEl = document.getElementById('gradientText');

const sodiumArrowEl = document.getElementById('sodiumArrow');
const potassiumArrowEl = document.getElementById('potassiumArrow');
const leakArrowEl = document.getElementById('leakArrow');
const resetBtn = document.getElementById('resetBtn');
const ionLayer = document.getElementById('ionLayer');
const gateCanvas = document.getElementById('gateCanvas');
const currentCanvas = document.getElementById('currentCanvas');
const currentValueEl = document.getElementById('currentValue');
const sodiumBuildupValueEl = document.getElementById('sodiumBuildupValue');
const sodiumBuildupBarEl = document.getElementById('sodiumBuildupBar');
const potassiumBuildupValueEl = document.getElementById('potassiumBuildupValue');
const potassiumBuildupBarEl = document.getElementById('potassiumBuildupBar');


// Alpha/Beta slider controls
// These sliders change the gate-rate values used in the Hodgkin-Huxley graphs.
const rateControlIds = ['alphaM', 'betaM', 'alphaH', 'betaH', 'alphaN', 'betaN'];
const rateControls = Object.fromEntries(rateControlIds.map((id) => [id, document.getElementById(id)]));
const rateOutputs = Object.fromEntries(rateControlIds.map((id) => [id, document.getElementById(`${id}Val`)]));


// Main particle storage
// particles = moving Na+, K+, and leak ions; residues = built-up ions after flux.
const particles = [];
const residues = [];
const CHANNEL_X = {
  leak: 20,
  sodium: 50,
  potassium: 80
};


// Animation timing variables
// startTime anchors the animation clock; lastFrameTime is used to calculate frame-to-frame dt.
let startTime = performance.now();
let lastFrameTime = startTime;

// Positive = leak gradient favors inward movement. Negative = favors outward movement.

// Dynamic simulation state
// These values track concentration buildup, auto-closing, and reopening behavior.
let leakGradient = 0.18;
let sodiumBuildup = 0;
let potassiumBuildup = 0;
let sodiumAutoClosed = false;
let potassiumAutoClosed = false;
let sodiumReopenTimer = 0;
let potassiumReopenTimer = 0;
let sodiumOpenElapsed = 0;
let potassiumOpenElapsed = 0;
let sodiumResidueClock = 0;
let potassiumResidueClock = 0;
let sodiumFadePulseIndex = 0;
let potassiumFadePulseIndex = 0;

// Channel feedback loop timing.
// K+: 20 s open/slowing, 7 s closed/fading.
// Na+: 17 s open/slowing, 5 s closed/fading/reopen.

// Feedback loop timing
// Open phase = flux slows as ions build up; reopen delay = closed pause while residues fade.
const POTASSIUM_OPEN_PHASE_DURATION = 20.0;
const SODIUM_OPEN_PHASE_DURATION = 17.0;
const POTASSIUM_REOPEN_DELAY = 7.0;
const SODIUM_REOPEN_DELAY = 5.0;
const FLUX_DECAY_STEEPNESS = 4.2;
const RESIDUE_FADE_CHUNKS = 4; // 25% of visible residues per chunk during closed pause


// Utility functions
// clamp limits values to a range; smoothstep makes particle movement look less linear.
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(x) {
  return x * x * (3 - 2 * x);
}


// Effective channel-state helpers
// A selector may remain set to open, while the animation temporarily auto-closes the channel.
function isSodiumConducting() {
  return sodiumStateEl.value === 'open' && !sodiumAutoClosed;
}

function isPotassiumConducting() {
  return potassiumStateEl.value === 'open' && !potassiumAutoClosed;
}

function getEffectiveSodiumState() {
  return sodiumAutoClosed ? 'closed' : sodiumStateEl.value;
}

function getEffectivePotassiumState() {
  return potassiumAutoClosed ? 'closed' : potassiumStateEl.value;
}


// Leak channel helpers
// Leak particles are chosen randomly and move according to the simulated gradient bias.
function randomLeakAsset() {
  return ASSETS.leak.particles[Math.floor(Math.random() * ASSETS.leak.particles.length)];
}

function chooseLeakDirection() {
  // When the gradient is near zero, flux is roughly random.
  // As the gradient builds, particles are more likely to move down the gradient.
  const inwardProbability = clamp(0.5 + leakGradient * 0.38, 0.12, 0.88);
  return Math.random() < inwardProbability ? 1 : -1; // 1 = inward/down, -1 = outward/up
}


// Create moving ion particles
// These are the reusable ions that flow through channels or park on either side.
function makeParticle(type, index) {
  const img = document.createElement('img');
  img.className = `ion ${type}-ion`;
  img.alt = '';
  img.dataset.type = type;

  const particle = {
    element: img,
    type,
    index,
    phase: Math.random(),
    progress: 0,
    lastRaw: 0,
    wobble: Math.random() * Math.PI * 2,
    offset: (Math.random() - 0.5) * 44,
    parkedX: 10 + Math.random() * 80,
    parkedY: Math.random() < 0.5 ? 9 + Math.random() * 22 : 69 + Math.random() * 22,
    speed: 0.2 + Math.random() * 0.2,
    direction: 1,
    channelX: CHANNEL_X.leak,
  };

  particle.progress = particle.phase;
  particle.lastRaw = particle.phase;

  if (type === 'sodium') {
    img.src = ASSETS.sodium.particle;
    particle.speed = 0.24 + Math.random() * 0.18;
    particle.parkedY = 10 + Math.random() * 24;
    particle.channelX = CHANNEL_X.sodium;
  } else if (type === 'potassium') {
    img.src = ASSETS.potassium.particle;
    particle.speed = 0.18 + Math.random() * 0.15;
    particle.parkedY = 68 + Math.random() * 22;
    particle.channelX = CHANNEL_X.potassium;
  } else {
    img.src = randomLeakAsset();
    particle.speed = 0.10 + Math.random() * 0.13;
    particle.offset = (Math.random() - 0.5) * 34;
    particle.direction = chooseLeakDirection();
    particle.channelX = CHANNEL_X.leak;
  }

  ionLayer.appendChild(img);
  particles.push(particle);
}


// Initial particle population
// Creates a pool of Na+, K+, and leak particles at page load.
for (let i = 0; i < 18; i += 1) makeParticle('sodium', i);
for (let i = 0; i < 16; i += 1) makeParticle('potassium', i);
for (let i = 0; i < 22; i += 1) makeParticle('leak', i);


// Hodgkin-Huxley graph constants
// These values control the voltage-clamp conductance and total-current plots.
const HH_CONSTANTS = {
  tMax: 15,
  dt: 0.05,

  // Voltage-clamp plotting convention from the PDF summary
  v0: -65,
  vInf: -20,
  stepTime: 1.0,
  tauC: 0.15,
  rM: 18,

  // Voltage-clamp conductance/current constants from the PDF summary
  eNa: 60.6,
  eK: -90,
  gNaBar: 60,
  gKBar: 48
};


// Slider value helpers
// These read the alpha/beta sliders and update the displayed numeric output values.
function getRateValue(id) {
  return Number.parseFloat(rateControls[id].value);
}

function syncRateLabels() {
  rateControlIds.forEach((id) => {
    rateOutputs[id].textContent = getRateValue(id).toFixed(2);
  });
}


// Voltage-clamp command functions
// Vm follows an exponential transition from the holding voltage to the command voltage.
function voltageAtTime(t) {
  if (t < HH_CONSTANTS.stepTime) return HH_CONSTANTS.v0;

  const elapsed = t - HH_CONSTANTS.stepTime;
  return (HH_CONSTANTS.v0 - HH_CONSTANTS.vInf) * Math.exp(-elapsed / HH_CONSTANTS.tauC) + HH_CONSTANTS.vInf;
}

function capacitiveCurrentAtTime(t, vM) {
  if (t < HH_CONSTANTS.stepTime) return 0;

  // PDF voltage-clamp current term: I_C = (V_inf - V_m) / r_m
  return (HH_CONSTANTS.vInf - vM) / HH_CONSTANTS.rM;
}


// Initial gate values
// Starting m, h, and n values are chosen based on the selected channel states.
function getGateInitialValues() {
  const sodiumState = sodiumStateEl.value;
  const potassiumState = potassiumStateEl.value;

  let m0 = 0.06;
  let h0 = 0.92;
  let n0 = 0.08;

  if (sodiumState === 'open') {
    m0 = 0.82;
    h0 = 0.82;
  } else if (sodiumState === 'inactivated') {
    m0 = 0.82;
    h0 = 0.08;
  }

  if (potassiumState === 'open') {
    n0 = 0.78;
  }

  return { m0, h0, n0 };
}


// Gate kinetics
// General HH gate equation solution using alpha opening and beta closing/inactivation rates.
function gateValueAtTime(alpha, beta, x0, t) {
  const steadyState = alpha / (alpha + beta);
  const tau = 1 / (alpha + beta);
  return steadyState + (x0 - steadyState) * Math.exp(-t / tau);
}




// Gate open-fraction helper
// Higher alpha relative to beta means a larger steady-state open fraction.
function gateOpenFraction(alpha, beta) {
  return alpha / (alpha + beta);
}

function getSodiumClosureThreshold() {
  // Higher alpha_m/alpha_h keeps the Na channel permissive longer.
  // Higher beta_m/beta_h makes buildup force closure/inactivation sooner.
  const alphaM = getRateValue('alphaM');
  const betaM = getRateValue('betaM');
  const alphaH = getRateValue('alphaH');
  const betaH = getRateValue('betaH');
  const openSupport = gateOpenFraction(alphaM, betaM) * gateOpenFraction(alphaH, betaH);
  const inactivationPressure = betaH / (alphaH + betaH);
  return clamp(0.36 + 0.42 * openSupport - 0.16 * inactivationPressure, 0.24, 0.86);
}

function getPotassiumClosureThreshold() {
  // Higher alpha_n keeps the K channel open longer; higher beta_n makes it close sooner.
  const alphaN = getRateValue('alphaN');
  const betaN = getRateValue('betaN');
  const openSupport = gateOpenFraction(alphaN, betaN);
  return clamp(0.34 + 0.50 * openSupport, 0.28, 0.88);
}


// Flux slowdown model
// As Na+ or K+ buildup increases, flux speed decreases exponentially toward zero.
function exponentialFluxFromBuildup(buildup) {
  // Smooth exponential slowdown relative to ion buildup.
  // buildup = 0 -> full flux; buildup = 1 -> visually zero flux.
  const b = clamp(buildup, 0, 1);
  const floor = Math.exp(-FLUX_DECAY_STEEPNESS);
  return clamp((Math.exp(-FLUX_DECAY_STEEPNESS * b) - floor) / (1 - floor), 0, 1);
}

function getSodiumFluxFactor() {
  // Intracellular Na+ buildup directly opposes inward Na+ flux.
  return exponentialFluxFromBuildup(sodiumBuildup);
}

function getPotassiumFluxFactor() {
  // Extracellular K+ buildup directly opposes outward K+ flux.
  return exponentialFluxFromBuildup(potassiumBuildup);
}


// Residue particle creation
// Residues represent built-up Na+ in ICM or K+ in ECF after ions cross the membrane.
function spawnResidue(type) {
  const img = document.createElement('img');
  img.className = `ion residue ${type}-residue`;
  img.alt = '';
  img.src = type === 'sodium' ? ASSETS.sodium.particle : ASSETS.potassium.particle;

  const bounds = type === 'sodium'
    ? { minX: 7, maxX: 93, minY: 68, maxY: 94 }   // ICM / intracellular side
    : { minX: 7, maxX: 93, minY: 6, maxY: 33 };    // ECF / extracellular side

  // Residues appear throughout the receiving matrix, not only at the channel exit.
  // That makes the buildup look like concentration spreading through ECF/ICM.
  const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
  const y = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);

  const residue = {
    element: img,
    type,
    x,
    y,
    bounds,
    opacity: 0.78,
    age: 0,
    wobble: Math.random() * Math.PI * 2,
    scale: 0.58 + Math.random() * 0.22,
    vx: (Math.random() - 0.5) * 1.6,
    vy: (Math.random() - 0.5) * 1.1,
    dissolving: false
  };

  ionLayer.appendChild(img);
  residues.push(residue);
}


// Residue diffusion
// Built-up ions wander only within the side where they accumulated.
function diffuseResidue(r, dt, t) {
  // Small random walk so built-up ions spread through the ECF or ICM matrix.
  r.vx += (Math.random() - 0.5) * dt * 1.15;
  r.vy += (Math.random() - 0.5) * dt * 0.90;
  r.vx = clamp(r.vx, -2.2, 2.2);
  r.vy = clamp(r.vy, -1.7, 1.7);

  r.x += r.vx * dt * 4.2 + Math.sin(t * 1.2 + r.wobble) * dt * 0.45;
  r.y += r.vy * dt * 3.2 + Math.cos(t * 1.0 + r.wobble) * dt * 0.35;

  if (r.x < r.bounds.minX || r.x > r.bounds.maxX) {
    r.vx *= -0.75;
    r.x = clamp(r.x, r.bounds.minX, r.bounds.maxX);
  }
  if (r.y < r.bounds.minY || r.y > r.bounds.maxY) {
    r.vy *= -0.75;
    r.y = clamp(r.y, r.bounds.minY, r.bounds.maxY);
  }
}

function countResiduesOfType(type) {
  return residues.filter((r) => r.type === type).length;
}


// Residue fading chunks
// During channel closure, about 25% of remaining residues begin dissolving at each fade pulse.
function triggerResidueFadeChunk(type) {
  const candidates = residues.filter((r) => r.type === type && !r.dissolving);
  if (candidates.length === 0) return;

  // About 25% of the remaining visible ions start dissolving at each pulse.
  const chunkSize = Math.max(1, Math.ceil(candidates.length * 0.25));
  candidates
    .sort(() => Math.random() - 0.5)
    .slice(0, chunkSize)
    .forEach((r) => {
      r.dissolving = true;
    });
}


// Update residue animation
// Open channels let residues diffuse; closed channels make residues dissolve in place.
function updateResidues(dt, t) {
  const sodiumOpen = isSodiumConducting();
  const potassiumOpen = isPotassiumConducting();

  for (let i = residues.length - 1; i >= 0; i -= 1) {
    const r = residues[i];
    const channelOpen = r.type === 'sodium' ? sodiumOpen : potassiumOpen;
    r.age += dt;

    if (channelOpen) {
      // During open flux, residues diffuse only within the receiving side: Na+ in ICM, K+ in ECF.
      diffuseResidue(r, dt, t);
      r.opacity = clamp(r.opacity - dt * 0.002, 0.28, 0.82);
    } else {
      // During the closed pause, residues dissolve in place on the same side.
      // They do not fly back across the membrane. Chunked residues fade faster.
      diffuseResidue(r, dt * 0.10, t);
      r.opacity -= dt * (r.dissolving ? 0.95 : 0.035);
    }

    r.element.style.left = `${r.x}%`;
    r.element.style.top = `${r.y}%`;
    r.element.style.opacity = clamp(r.opacity, 0, 0.84);
    r.element.style.transform = `translate(-50%, -50%) scale(${r.scale})`;

    if (r.opacity <= 0.02) {
      r.element.remove();
      residues.splice(i, 1);
    }
  }
}


// Clear residue particles
// Used when a channel reopens or when the reset button clears the simulation.
function removeResiduesOfType(type) {
  for (let i = residues.length - 1; i >= 0; i -= 1) {
    if (residues[i].type === type) {
      residues[i].element.remove();
      residues.splice(i, 1);
    }
  }
}


// Buildup and auto-close model
// Controls the open/closed feedback loop for Na+ and K+ based on buildup over time.
function updateBuildupModel(dt) {
  const sodiumConducting = isSodiumConducting();
  const potassiumConducting = isPotassiumConducting();
  const sodiumSelectedOpen = sodiumStateEl.value === 'open';
  const potassiumSelectedOpen = potassiumStateEl.value === 'open';

  if (sodiumConducting) {
    sodiumOpenElapsed += dt;
    sodiumBuildup = clamp(sodiumOpenElapsed / SODIUM_OPEN_PHASE_DURATION, 0, 1);

    // Continuous residue production, tapering smoothly to zero as ICM Na+ builds up.
    sodiumResidueClock += dt * (5.0 * getSodiumFluxFactor());
    while (sodiumResidueClock >= 1) {
      spawnResidue('sodium');
      sodiumResidueClock -= 1;
    }

    if (sodiumOpenElapsed >= SODIUM_OPEN_PHASE_DURATION || getSodiumFluxFactor() <= 0.01) {
      sodiumAutoClosed = true;
      sodiumReopenTimer = SODIUM_REOPEN_DELAY;
      sodiumOpenElapsed = 0;
      sodiumResidueClock = 0;
      sodiumFadePulseIndex = 0;
      updateUI();
    }
  } else if (sodiumAutoClosed) {
    sodiumReopenTimer -= dt;
    const elapsedClosed = SODIUM_REOPEN_DELAY - Math.max(sodiumReopenTimer, 0);
    const pulseIndex = clamp(Math.floor((elapsedClosed / SODIUM_REOPEN_DELAY) * RESIDUE_FADE_CHUNKS), 0, RESIDUE_FADE_CHUNKS);

    while (sodiumFadePulseIndex < pulseIndex) {
      triggerResidueFadeChunk('sodium');
      sodiumFadePulseIndex += 1;
    }

    sodiumBuildup = clamp(sodiumReopenTimer / SODIUM_REOPEN_DELAY, 0, 1);

    if (!sodiumSelectedOpen) {
      sodiumAutoClosed = false;
      sodiumReopenTimer = 0;
      sodiumBuildup = 0;
      sodiumFadePulseIndex = 0;
    } else if (sodiumReopenTimer <= 0) {
      // Any remaining transparent residue is cleared exactly at reopening.
      sodiumBuildup = 0;
      removeResiduesOfType('sodium');
      sodiumAutoClosed = false;
      sodiumFadePulseIndex = 0;
      particles.filter((p) => p.type === 'sodium').forEach((p) => {
        p.progress = Math.random();
        p.lastRaw = p.progress;
      });
      updateUI();
    }
  } else {
    sodiumOpenElapsed = 0;
    sodiumResidueClock = 0;
    sodiumFadePulseIndex = 0;
    if (!sodiumSelectedOpen) sodiumBuildup = clamp(sodiumBuildup - dt * 0.22, 0, 1);
  }

  if (potassiumConducting) {
    potassiumOpenElapsed += dt;
    potassiumBuildup = clamp(potassiumOpenElapsed / POTASSIUM_OPEN_PHASE_DURATION, 0, 1);

    // Continuous residue production, tapering smoothly to zero as ECF K+ builds up.
    potassiumResidueClock += dt * (5.0 * getPotassiumFluxFactor());
    while (potassiumResidueClock >= 1) {
      spawnResidue('potassium');
      potassiumResidueClock -= 1;
    }

    if (potassiumOpenElapsed >= POTASSIUM_OPEN_PHASE_DURATION || getPotassiumFluxFactor() <= 0.01) {
      potassiumAutoClosed = true;
      potassiumReopenTimer = POTASSIUM_REOPEN_DELAY;
      potassiumOpenElapsed = 0;
      potassiumResidueClock = 0;
      potassiumFadePulseIndex = 0;
      updateUI();
    }
  } else if (potassiumAutoClosed) {
    potassiumReopenTimer -= dt;
    const elapsedClosed = POTASSIUM_REOPEN_DELAY - Math.max(potassiumReopenTimer, 0);
    const pulseIndex = clamp(Math.floor((elapsedClosed / POTASSIUM_REOPEN_DELAY) * RESIDUE_FADE_CHUNKS), 0, RESIDUE_FADE_CHUNKS);

    while (potassiumFadePulseIndex < pulseIndex) {
      triggerResidueFadeChunk('potassium');
      potassiumFadePulseIndex += 1;
    }

    potassiumBuildup = clamp(potassiumReopenTimer / POTASSIUM_REOPEN_DELAY, 0, 1);

    if (!potassiumSelectedOpen) {
      potassiumAutoClosed = false;
      potassiumReopenTimer = 0;
      potassiumBuildup = 0;
      potassiumFadePulseIndex = 0;
    } else if (potassiumReopenTimer <= 0) {
      // Any remaining transparent residue is cleared exactly at reopening.
      potassiumBuildup = 0;
      removeResiduesOfType('potassium');
      potassiumAutoClosed = false;
      potassiumFadePulseIndex = 0;
      particles.filter((p) => p.type === 'potassium').forEach((p) => {
        p.progress = Math.random();
        p.lastRaw = p.progress;
      });
      updateUI();
    }
  } else {
    potassiumOpenElapsed = 0;
    potassiumResidueClock = 0;
    potassiumFadePulseIndex = 0;
    if (!potassiumSelectedOpen) potassiumBuildup = clamp(potassiumBuildup - dt * 0.22, 0, 1);
  }
}


// Buildup readouts
// Updates the percentage text, progress bars, and flux meters shown in the logic cards.
function updateBuildupReadout() {
  const sodiumPct = Math.round(sodiumBuildup * 100);
  const potassiumPct = Math.round(potassiumBuildup * 100);

  if (sodiumBuildupValueEl) sodiumBuildupValueEl.textContent = `${sodiumPct}%`;
  if (potassiumBuildupValueEl) potassiumBuildupValueEl.textContent = `${potassiumPct}%`;
  if (sodiumBuildupBarEl) sodiumBuildupBarEl.style.width = `${sodiumPct}%`;
  if (potassiumBuildupBarEl) potassiumBuildupBarEl.style.width = `${potassiumPct}%`;

  if (isSodiumConducting()) sodiumMeterEl.style.width = `${Math.round(getSodiumFluxFactor() * 100)}%`;
  if (isPotassiumConducting()) potassiumMeterEl.style.width = `${Math.round(getPotassiumFluxFactor() * 82)}%`;
}


// Graph data calculation
// Uses alpha/beta gate values to calculate gNa, gK, INa, IK, IC, and total current.
function buildGateData() {
  const alphaM = getRateValue('alphaM');
  const betaM = getRateValue('betaM');
  const alphaH = getRateValue('alphaH');
  const betaH = getRateValue('betaH');
  const alphaN = getRateValue('alphaN');
  const betaN = getRateValue('betaN');
  const { m0, h0, n0 } = getGateInitialValues();

  const points = [];
  for (let t = 0; t <= HH_CONSTANTS.tMax + 1e-9; t += HH_CONSTANTS.dt) {
    const m = gateValueAtTime(alphaM, betaM, m0, t);
    const h = gateValueAtTime(alphaH, betaH, h0, t);
    const n = gateValueAtTime(alphaN, betaN, n0, t);

    // PDF formulas:
    // g_Na = g_Na_bar * m^3 * h, with g_Na_bar = 60 mS/cm^2
    // g_K  = g_K_bar  * n^4,     with g_K_bar  = 48 mS/cm^2
    const gNa = HH_CONSTANTS.gNaBar * Math.pow(m, 3) * h;
    const gK = HH_CONSTANTS.gKBar * Math.pow(n, 4);

    const vM = voltageAtTime(t);

    // PDF voltage-clamp graph currents. The /1000 converts to mA/cm^2.
    const iNa = (gNa * (vM - HH_CONSTANTS.eNa)) / 1000;
    const iK = (gK * (vM - HH_CONSTANTS.eK)) / 1000;
    const iCap = capacitiveCurrentAtTime(t, vM);

    // Voltage-clamp total membrane current, not injected I_app.
    const iTotal = iK + iNa + iCap;

    points.push({ t, gNa, gK, iNa, iK, iCap, iTotal, vM });
  }
  return points;
}


// Canvas setup
// Resizes the canvas for crisp drawing on high-DPI displays.
function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}


// Graph axes drawing
// Draws the grid, x-axis, y-axis, labels, and tick marks.
function drawAxes(ctx, width, height, options) {
  const margin = { left: 52, right: 18, top: 24, bottom: 42 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(23, 48, 79, 0.10)';
  ctx.lineWidth = 1;
  ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#5f7694';

  const yTicks = options.yTicks || 5;
  for (let i = 0; i <= yTicks; i += 1) {
    const y = margin.top + (plotHeight * i) / yTicks;
    const value = options.yMax - ((options.yMax - options.yMin) * i) / yTicks;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(width - margin.right, y);
    ctx.stroke();
    ctx.fillText(value.toFixed(options.yDecimals ?? 1), 10, y + 4);
  }

  const xTicks = 5;
  for (let i = 0; i <= xTicks; i += 1) {
    const x = margin.left + (plotWidth * i) / xTicks;
    const value = (HH_CONSTANTS.tMax * i) / xTicks;
    ctx.beginPath();
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, height - margin.bottom);
    ctx.stroke();
    ctx.fillText(value.toFixed(0), x - 4, height - 16);
  }

  ctx.strokeStyle = 'rgba(23, 48, 79, 0.42)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, height - margin.bottom);
  ctx.lineTo(width - margin.right, height - margin.bottom);
  ctx.stroke();

  ctx.fillStyle = '#17304f';
  ctx.font = '700 12px Inter, system-ui, sans-serif';
  ctx.fillText('time (ms)', width / 2 - 24, height - 6);
  ctx.save();
  ctx.translate(16, height / 2 + 40);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(options.yLabel, 0, 0);
  ctx.restore();

  return {
    margin,
    plotWidth,
    plotHeight,
    xToPx: (t) => margin.left + (t / HH_CONSTANTS.tMax) * plotWidth,
    yToPx: (y) => margin.top + ((options.yMax - y) / (options.yMax - options.yMin)) * plotHeight
  };
}


// Graph line drawing
// Draws one continuous trace from the calculated data points.
function drawTrace(ctx, points, xToPx, yToPx, key, color, lineWidth = 3) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xToPx(point.t);
    const y = yToPx(point[key]);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}


// Conductance graph
// Left graph: sodium conductance gNa and potassium conductance gK.
function drawGateGraph(points) {
  const { ctx, width, height } = prepareCanvas(gateCanvas);
  const maxConductance = Math.max(
    HH_CONSTANTS.gNaBar,
    HH_CONSTANTS.gKBar,
    ...points.map((p) => Math.max(p.gNa, p.gK))
  );
  const axes = drawAxes(ctx, width, height, {
    yMin: 0,
    yMax: Math.ceil(maxConductance / 10) * 10,
    yTicks: 6,
    yDecimals: 0,
    yLabel: 'conductance mS/cm²'
  });

  drawTrace(ctx, points, axes.xToPx, axes.yToPx, 'gNa', '#f15a3b', 3.5);
  drawTrace(ctx, points, axes.xToPx, axes.yToPx, 'gK', '#70b82f', 3.5);
}


// Total current graph
// Right graph: voltage-clamp total membrane current Itotal.
function drawCurrentGraph(points) {
  const { ctx, width, height } = prepareCanvas(currentCanvas);
  const values = points.map((p) => p.iTotal);
  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  if (Math.abs(yMax - yMin) < 0.1) {
    yMin -= 0.1;
    yMax += 0.1;
  }
  const padding = (yMax - yMin) * 0.15;
  yMin -= padding;
  yMax += padding;

  const axes = drawAxes(ctx, width, height, {
    yMin,
    yMax,
    yTicks: 5,
    yDecimals: 2,
    yLabel: 'I_total mA/cm²'
  });

  if (yMin < 0 && yMax > 0) {
    const zeroY = axes.yToPx(0);
    ctx.strokeStyle = 'rgba(23, 48, 79, 0.28)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(axes.margin.left, zeroY);
    ctx.lineTo(width - axes.margin.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawTrace(ctx, points, axes.xToPx, axes.yToPx, 'iTotal', '#17304f', 3.5);
  const finalCurrent = points[points.length - 1].iTotal;
  currentValueEl.textContent = `${finalCurrent.toFixed(3)} mA/cm²`;
}


// Render both graphs
// Called after slider changes, window resizing, reset, or state updates.
function renderGraphs() {
  if (!gateCanvas || !currentCanvas) return;
  syncRateLabels();
  const points = buildGateData();
  drawGateGraph(points);
  drawCurrentGraph(points);
}


// Update visible interface
// Changes channel images, status text, arrows, meters, buildup bars, and graphs.
function updateUI() {
  const sodiumState = getEffectiveSodiumState();
  const potassiumState = getEffectivePotassiumState();
  const leakState = leakStateEl.value;

  sodiumChannelEl.src = ASSETS.sodium[sodiumState];
  potassiumChannelEl.src = ASSETS.potassium[potassiumState];
  leakChannelEl.src = ASSETS.leak[leakState];

  const sodiumOpen = sodiumState === 'open';
  const potassiumOpen = potassiumState === 'open';
  const leakOpen = leakState === 'open';

  sodiumArrowEl.classList.toggle('active', sodiumOpen);
  potassiumArrowEl.classList.toggle('active', potassiumOpen);
  leakArrowEl.classList.toggle('active', leakOpen);

  if (sodiumState === 'open') {
    sodiumStatusEl.innerHTML = 'Na<sup>+</sup>: open → inward depolarizing flux';
    sodiumExplanationEl.innerHTML = 'Both the activation gate and inactivation gate are open, so Na<sup>+</sup> can enter the cell.';
    sodiumMeterEl.style.width = '100%';
  } else if (sodiumState === 'closed') {
    sodiumStatusEl.innerHTML = 'Na<sup>+</sup>: closed → no Na<sup>+</sup> flux';
    sodiumExplanationEl.innerHTML = 'The activation m-gate is closed, so no 'Na<sup>+</sup> ions can flow through.';
    sodiumMeterEl.style.width = '0%';
  } else {
    sodiumStatusEl.innerHTML = 'Na<sup>+</sup>: inactivated → blocked pore';
    sodiumExplanationEl.innerHTML = 'The inactivation h-gate blocks the channel, so Na<sup>+</sup> cannot pass even if m-gate is activated.';
    sodiumMeterEl.style.width = '0%';
  }

  if (potassiumState === 'open') {
    potassiumStatusEl.innerHTML = 'K<sup>+</sup>: open → outward repolarizing flux';
    potassiumExplanationEl.innerHTML = 'The K<sup>+</sup> channel is open, so K<sup>+</sup> exits the cell down its electrochemical gradient.';
    potassiumMeterEl.style.width = '82%';
  } else {
    potassiumStatusEl.innerHTML = 'K<sup>+</sup>: closed → no K<sup>+</sup> flux';
    potassiumExplanationEl.innerHTML = 'The potassium pore is closed, so K<sup>+</sup> flux is blocked.';
    potassiumMeterEl.style.width = '0%';
  }

  if (leakState === 'open') {
    leakStatusEl.innerHTML = 'Leak: open → slow stochastic mixed-ion flux';
    leakExplanationEl.innerHTML = 'Random leak particles can cross in both directions. Their direction is based on the simulated gradient, so the flow shifts inward or outward as the gradient builds.';
  } else {
    leakStatusEl.innerHTML = 'Leak: closed → random ions drift but do not cross';
    leakExplanationEl.innerHTML = 'The leak channel is closed, so the mixed leak particles only drift on each side of the membrane. However, they do not cross the closed channel';
  }

  if (sodiumAutoClosed && sodiumState === 'closed') {
    sodiumStatusEl.innerHTML = `Na<sup>+</sup>: auto-closed → buildup pause (${Math.max(0, sodiumReopenTimer).toFixed(1)} s)`;
    sodiumExplanationEl.innerHTML += ' Intracellular Na<sup>+</sup> buildup slowed the flux and forced the channel closed. It will reopen once the channel is repolarized.';
  }

  if (potassiumAutoClosed && potassiumState === 'closed') {
    potassiumStatusEl.innerHTML = `K<sup>+</sup>: auto-closed → buildup pause (${Math.max(0, potassiumReopenTimer).toFixed(1)} s)`;
    potassiumExplanationEl.innerHTML += ' Extracellular K<sup>+</sup> buildup slowed the flux and forced the channel closed. It will reopen once the channel is repolarized.';
  }

  updateBuildupReadout();
  renderGraphs();
}


// Leak gradient update
// Na+ and K+ flux shift the qualitative gradient, while the leak channel relaxes it.
function updateLeakGradient(dt) {
  const sodiumOpen = isSodiumConducting();
  const potassiumOpen = isPotassiumConducting();
  const leakOpen = leakStateEl.value === 'open';

  // Open Na+ and K+ channels create a qualitative concentration/electrical imbalance.
  if (sodiumOpen) leakGradient += 0.10 * dt;
  if (potassiumOpen) leakGradient -= 0.08 * dt;

  // If leak is closed, the hidden gradient can build more strongly.
  // If leak is open, the gradient relaxes as particles passively cross.
  leakGradient *= leakOpen ? 0.998 : 0.9995;
  leakGradient = clamp(leakGradient, -1, 1);

  const markerLeft = 50 + leakGradient * 44;
  leakGradientMarkerEl.style.left = `${markerLeft}%`;

  if (leakGradient > 0.18) {
    gradientTextEl.textContent = 'Inward biased';
  } else if (leakGradient < -0.18) {
    gradientTextEl.textContent = 'Outward biased';
  } else {
    gradientTextEl.textContent = 'Balanced';
  }
}


// Parked particle behavior
// When a channel is closed, particles drift gently without crossing the membrane.
function placeParkedParticle(p, t) {
  const el = p.element;
  const drift = Math.sin(t * 0.8 + p.wobble) * 1.1;
  const x = p.parkedX + drift;
  const y = p.parkedY + Math.cos(t * 0.7 + p.wobble) * 0.9;
  el.classList.add('parked');
  el.classList.remove('flowing');
  el.style.left = `${x}%`;
  el.style.top = `${y}%`;
  el.style.opacity = p.type === 'leak' ? 0.42 : 0.32;
  el.style.transform = 'translate(-50%, -50%) scale(0.86)';
}


// Main animation loop
// Runs every frame and updates ion flux, buildup, residues, leak particles, and UI readouts.
function animate(now) {
  const t = (now - startTime) / 1000;
  const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  const sodiumOpen = isSodiumConducting();
  const potassiumOpen = isPotassiumConducting();
  const leakOpen = leakStateEl.value === 'open';

  updateLeakGradient(dt);
  updateBuildupModel(dt);
  updateBuildupReadout();

  particles.forEach((p) => {
    const el = p.element;
    let x;
    let y;
    let opacity;
    let scale = 1;

    if (p.type === 'sodium' && sodiumOpen) {
      p.progress = (p.progress + dt * p.speed * getSodiumFluxFactor()) % 1;
      const raw = p.progress;
      p.lastRaw = raw;

      const progress = smoothstep(raw);
      x = p.channelX + p.offset / 10 + Math.sin(t * 4 + p.wobble) * 0.9;
      y = 14 + progress * 72;
      opacity = raw < 0.08 || raw > 0.94 ? 0.18 : 0.96;
      scale = 0.82 + Math.sin(raw * Math.PI) * 0.28;
      el.classList.add('flowing');
      el.classList.remove('parked');
    } else if (p.type === 'potassium' && potassiumOpen) {
      p.progress = (p.progress + dt * p.speed * getPotassiumFluxFactor()) % 1;
      const raw = p.progress;
      p.lastRaw = raw;

      const progress = smoothstep(raw);
      x = p.channelX + p.offset / 10 + Math.sin(t * 4 + p.wobble) * 0.9;
      y = 86 - progress * 72;
      opacity = raw < 0.08 || raw > 0.94 ? 0.18 : 0.92;
      scale = 0.82 + Math.sin(raw * Math.PI) * 0.28;
      el.classList.add('flowing');
      el.classList.remove('parked');
    } else if (p.type === 'leak' && leakOpen) {
      const raw = (p.phase + t * p.speed) % 1;
      if (raw < p.lastRaw) {
        p.direction = chooseLeakDirection();
        p.element.src = randomLeakAsset();
        // A completed leak crossing slightly dissipates the gradient it followed.
        leakGradient -= p.direction * 0.028;
        leakGradient = clamp(leakGradient, -1, 1);
      }
      p.lastRaw = raw;

      const progress = smoothstep(raw);
      const startY = p.direction === 1 ? 16 : 84;
      const endY = p.direction === 1 ? 84 : 16;
      x = p.channelX + p.offset / 10 + Math.sin(t * 3.2 + p.wobble) * 1.2;
      y = startY + (endY - startY) * progress;
      opacity = raw < 0.10 || raw > 0.94 ? 0.16 : 0.86;
      scale = 0.74 + Math.sin(raw * Math.PI) * 0.20;
      el.classList.add('flowing');
      el.classList.remove('parked');
    } else {
      placeParkedParticle(p, t);
      return;
    }

    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.opacity = opacity;
    el.style.transform = `translate(-50%, -50%) scale(${scale})`;
  });

  updateResidues(dt, t);

  requestAnimationFrame(animate);
}


// User interaction: sodium selector
// Manual changes cancel the sodium auto-close loop and refresh the interface.
sodiumStateEl.addEventListener('change', () => {
  sodiumAutoClosed = false;
  sodiumReopenTimer = 0;
  sodiumOpenElapsed = 0;
  sodiumResidueClock = 0;
  sodiumFadePulseIndex = 0;
  if (sodiumStateEl.value === 'closed') sodiumBuildup = 0;
  updateUI();
});


// User interaction: potassium selector
// Manual changes cancel the potassium auto-close loop and refresh the interface.
potassiumStateEl.addEventListener('change', () => {
  potassiumAutoClosed = false;
  potassiumReopenTimer = 0;
  potassiumOpenElapsed = 0;
  potassiumResidueClock = 0;
  potassiumFadePulseIndex = 0;
  if (potassiumStateEl.value === 'closed') potassiumBuildup = 0;
  updateUI();
});


// User interaction: leak selector
// Leak state changes only need a UI refresh.
leakStateEl.addEventListener('change', updateUI);


// User interaction: alpha/beta sliders
// Slider movement redraws the HH graphs and updates buildup-related readouts.
Object.values(rateControls).forEach((input) => {
  input.addEventListener('input', () => {
    renderGraphs();
    updateBuildupReadout();
  });
});


// Responsive graph redraw
// Redraws canvas graphs when the browser size changes.
window.addEventListener('resize', renderGraphs);


// Reset button
// Closes all channels, clears buildup/residue ions, and restarts particle positions.
resetBtn.addEventListener('click', () => {
  sodiumStateEl.value = 'closed';
  potassiumStateEl.value = 'closed';
  leakStateEl.value = 'closed';

  startTime = performance.now();
  lastFrameTime = startTime;
  leakGradient = 0.18;
  sodiumBuildup = 0;
  potassiumBuildup = 0;
  sodiumAutoClosed = false;
  potassiumAutoClosed = false;
  sodiumReopenTimer = 0;
  potassiumReopenTimer = 0;
  sodiumOpenElapsed = 0;
  potassiumOpenElapsed = 0;
  sodiumResidueClock = 0;
  potassiumResidueClock = 0;
  sodiumFadePulseIndex = 0;
  potassiumFadePulseIndex = 0;
  sodiumFadePulseIndex = 0;
  potassiumFadePulseIndex = 0;

  while (residues.length > 0) {
    const residue = residues.pop();
    residue.element.remove();
  }

  particles.forEach((p) => {
    p.phase = Math.random();
    p.progress = Math.random();
    p.lastRaw = p.progress;
    if (p.type === 'leak') {
      p.direction = chooseLeakDirection();
      p.element.src = randomLeakAsset();
    }
  });

  updateUI();
});


// Start simulator
// Initialize UI once, then begin the continuous animation loop.
updateUI();
requestAnimationFrame(animate);
