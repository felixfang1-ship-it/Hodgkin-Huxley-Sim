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

const rateControlIds = ['alphaM', 'betaM', 'alphaH', 'betaH', 'alphaN', 'betaN'];
const rateControls = Object.fromEntries(rateControlIds.map((id) => [id, document.getElementById(id)]));
const rateOutputs = Object.fromEntries(rateControlIds.map((id) => [id, document.getElementById(`${id}Val`)]));

const particles = [];
const CHANNEL_X = {
  leak: 20,
  sodium: 50,
  potassium: 80
};

let startTime = performance.now();
let lastFrameTime = startTime;

// Positive = leak gradient favors inward movement. Negative = favors outward movement.
let leakGradient = 0.18;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(x) {
  return x * x * (3 - 2 * x);
}

function randomLeakAsset() {
  return ASSETS.leak.particles[Math.floor(Math.random() * ASSETS.leak.particles.length)];
}

function chooseLeakDirection() {
  // When the gradient is near zero, flux is roughly random.
  // As the gradient builds, particles are more likely to move down the gradient.
  const inwardProbability = clamp(0.5 + leakGradient * 0.38, 0.12, 0.88);
  return Math.random() < inwardProbability ? 1 : -1; // 1 = inward/down, -1 = outward/up
}

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
    lastRaw: Math.random(),
    wobble: Math.random() * Math.PI * 2,
    offset: (Math.random() - 0.5) * 44,
    parkedX: 10 + Math.random() * 80,
    parkedY: Math.random() < 0.5 ? 9 + Math.random() * 22 : 69 + Math.random() * 22,
    speed: 0.2 + Math.random() * 0.2,
    direction: 1,
    channelX: CHANNEL_X.leak,
  };

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

for (let i = 0; i < 18; i += 1) makeParticle('sodium', i);
for (let i = 0; i < 16; i += 1) makeParticle('potassium', i);
for (let i = 0; i < 22; i += 1) makeParticle('leak', i);

const HH_CONSTANTS = {
  tMax: 15,
  dt: 0.05,
  vCommand: -20,
  eNa: 50,
  eK: -77,
  eL: -54.4,
  gNaBar: 120,
  gKBar: 36,
  gLBar: 0.3
};

function getRateValue(id) {
  return Number.parseFloat(rateControls[id].value);
}

function syncRateLabels() {
  rateControlIds.forEach((id) => {
    rateOutputs[id].textContent = getRateValue(id).toFixed(2);
  });
}

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

function gateValueAtTime(alpha, beta, x0, t) {
  const steadyState = alpha / (alpha + beta);
  const tau = 1 / (alpha + beta);
  return steadyState + (x0 - steadyState) * Math.exp(-t / tau);
}

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
    const gNa = HH_CONSTANTS.gNaBar * Math.pow(m, 3) * h;
    const gK = HH_CONSTANTS.gKBar * Math.pow(n, 4);
    const iNa = gNa * (HH_CONSTANTS.vCommand - HH_CONSTANTS.eNa);
    const iK = gK * (HH_CONSTANTS.vCommand - HH_CONSTANTS.eK);
    const iL = HH_CONSTANTS.gLBar * (HH_CONSTANTS.vCommand - HH_CONSTANTS.eL);
    const iApp = iNa + iK + iL;
    points.push({ t, m, h, n, iApp });
  }
  return points;
}

function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

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

function drawGateGraph(points) {
  const { ctx, width, height } = prepareCanvas(gateCanvas);
  const axes = drawAxes(ctx, width, height, {
    yMin: 0,
    yMax: 1,
    yTicks: 5,
    yDecimals: 1,
    yLabel: 'gate value'
  });

  drawTrace(ctx, points, axes.xToPx, axes.yToPx, 'm', '#f15a3b');
  drawTrace(ctx, points, axes.xToPx, axes.yToPx, 'h', '#7b53d6');
  drawTrace(ctx, points, axes.xToPx, axes.yToPx, 'n', '#70b82f');
}

function drawCurrentGraph(points) {
  const { ctx, width, height } = prepareCanvas(currentCanvas);
  const values = points.map((p) => p.iApp);
  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  if (Math.abs(yMax - yMin) < 1) {
    yMin -= 1;
    yMax += 1;
  }
  const padding = (yMax - yMin) * 0.15;
  yMin -= padding;
  yMax += padding;

  const axes = drawAxes(ctx, width, height, {
    yMin,
    yMax,
    yTicks: 5,
    yDecimals: 0,
    yLabel: 'Iapp µA/cm²'
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

  drawTrace(ctx, points, axes.xToPx, axes.yToPx, 'iApp', '#17304f', 3.5);
  const finalCurrent = points[points.length - 1].iApp;
  currentValueEl.textContent = `${finalCurrent.toFixed(1)} µA/cm²`;
}

function renderGraphs() {
  if (!gateCanvas || !currentCanvas) return;
  syncRateLabels();
  const points = buildGateData();
  drawGateGraph(points);
  drawCurrentGraph(points);
}

function updateUI() {
  const sodiumState = sodiumStateEl.value;
  const potassiumState = potassiumStateEl.value;
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
    sodiumExplanationEl.innerHTML = 'The activation m-gate is closed, so the pore is not conductive.';
    sodiumMeterEl.style.width = '0%';
  } else {
    sodiumStatusEl.innerHTML = 'Na<sup>+</sup>: inactivated → blocked pore';
    sodiumExplanationEl.innerHTML = 'The inactivation h-gate blocks the channel, so Na<sup>+</sup> cannot pass even if activation had occurred.';
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
    leakExplanationEl.innerHTML = 'Random leak ions cross in both directions. Their direction is biased by the simulated gradient, so the flow shifts inward or outward as the gradient builds.';
  } else {
    leakStatusEl.innerHTML = 'Leak: closed → random ions drift but do not cross';
    leakExplanationEl.innerHTML = 'The leak pore is closed, so the mixed leak particles only drift on each side of the membrane.';
  }

  renderGraphs();
}

function updateLeakGradient(dt) {
  const sodiumOpen = sodiumStateEl.value === 'open';
  const potassiumOpen = potassiumStateEl.value === 'open';
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

function animate(now) {
  const t = (now - startTime) / 1000;
  const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  const sodiumOpen = sodiumStateEl.value === 'open';
  const potassiumOpen = potassiumStateEl.value === 'open';
  const leakOpen = leakStateEl.value === 'open';

  updateLeakGradient(dt);

  particles.forEach((p) => {
    const el = p.element;
    let x;
    let y;
    let opacity;
    let scale = 1;

    if (p.type === 'sodium' && sodiumOpen) {
      const raw = (p.phase + t * p.speed) % 1;
      const progress = smoothstep(raw);
      x = p.channelX + p.offset / 10 + Math.sin(t * 4 + p.wobble) * 0.9;
      y = 14 + progress * 72;
      opacity = raw < 0.08 || raw > 0.94 ? 0.18 : 0.96;
      scale = 0.82 + Math.sin(raw * Math.PI) * 0.28;
      el.classList.add('flowing');
      el.classList.remove('parked');
    } else if (p.type === 'potassium' && potassiumOpen) {
      const raw = (p.phase + t * p.speed) % 1;
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

  requestAnimationFrame(animate);
}

[sodiumStateEl, potassiumStateEl, leakStateEl].forEach((select) => {
  select.addEventListener('change', updateUI);
});

Object.values(rateControls).forEach((input) => {
  input.addEventListener('input', renderGraphs);
});

window.addEventListener('resize', renderGraphs);

resetBtn.addEventListener('click', () => {
  sodiumStateEl.value = 'closed';
  potassiumStateEl.value = 'closed';
  leakStateEl.value = 'closed';

  startTime = performance.now();
  lastFrameTime = startTime;
  leakGradient = 0.18;
  particles.forEach((p) => {
    p.phase = Math.random();
    p.lastRaw = Math.random();
    if (p.type === 'leak') {
      p.direction = chooseLeakDirection();
      p.element.src = randomLeakAsset();
    }
  });

  updateUI();
});

updateUI();
requestAnimationFrame(animate);
