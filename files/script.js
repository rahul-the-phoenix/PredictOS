/* ===================================================
   AI CPU Scheduling Simulator — SEVEN UP
   script.js — Full Logic: FCFS, SJF, RR + AI Predict
=================================================== */

// ── STATE ──────────────────────────────────────────
let processes = [];
let pidCounter = 1;
let alpha = 0.4;           // exponential smoothing factor
let rrQuantum = 2;
let simulationResults = {}; // { fcfs:{..}, sjf:{..}, rr:{..} }
let currentGanttAlgo = 'fcfs';
let activeMode = 'original';
let barChartInst = null;
let lineChartInst = null;
let aiMemory = {};         // { pid: [burstHistory], smoothed: lastPred }

// ── PROCESS COLORS ──────────────────────────────────
const COLORS = ['#63cab7','#f0a04b','#e05c7e','#7b8cde','#a3e87a','#e87af0','#f0d44b'];

// ── DOM HELPERS ─────────────────────────────────────
const $ = id => document.getElementById(id);
const processBody = () => $('processBody');

// ── INIT ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  if (processes.length === 0) generateDefault();
  renderProcessTable();
  bindEvents();
});

function bindEvents() {
  // Nav tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const sec = tab.dataset.section;
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      $('section-' + sec).classList.add('active');
    });
  });

  $('btnRandom').addEventListener('click', () => { generateRandom(); renderProcessTable(); });
  $('btnAddProcess').addEventListener('click', addProcess);
  $('btnClear').addEventListener('click', () => { processes = []; pidCounter = 1; renderProcessTable(); });

  $('rrQuantum').addEventListener('input', function() {
    rrQuantum = +this.value;
    $('rrVal').textContent = this.value + ' ms';
  });

  $('alphaSlider').addEventListener('input', function() {
    alpha = this.value / 10;
    $('alphaVal').textContent = alpha.toFixed(1);
    renderAIPanel();
  });

  $('btnRunSim').addEventListener('click', () => {
    collectInputValues();
    goToSection('simulation');
  });

  $('btnExecute').addEventListener('click', executeSimulation);

  // Mode cards
  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      activeMode = card.dataset.mode;
    });
  });

  // Algo toggles
  document.querySelectorAll('.algo-toggle').forEach(t => {
    t.addEventListener('click', () => t.classList.toggle('active'));
  });

  $('themeToggle').addEventListener('click', () => {
    const html = document.documentElement;
    const dark = html.dataset.theme === 'dark';
    html.dataset.theme = dark ? 'light' : 'dark';
    $('themeIcon').textContent = dark ? '🌙' : '☀';
    updateChartTheme();
  });

  $('btnDownloadGantt').addEventListener('click', downloadGantt);
  $('btnExportPDF').addEventListener('click', exportPDF);
  $('btnResetAI').addEventListener('click', resetAI);
}

// ── NAVIGATION ──────────────────────────────────────
function goToSection(sec) {
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.section === sec);
  });
  document.querySelectorAll('.section').forEach(s => {
    s.classList.toggle('active', s.id === 'section-' + sec);
  });
}

// ── PROCESS MANAGEMENT ──────────────────────────────
function generateDefault() {
  processes = [
    { pid:'P1', arrival:0, burst:5 },
    { pid:'P2', arrival:1, burst:3 },
    { pid:'P3', arrival:2, burst:8 },
    { pid:'P4', arrival:3, burst:2 },
  ];
  pidCounter = 5;
}

function generateRandom() {
  const n = 3 + Math.floor(Math.random() * 4);
  processes = [];
  pidCounter = 1;
  for (let i = 0; i < n; i++) {
    processes.push({
      pid: 'P' + pidCounter++,
      arrival: Math.floor(Math.random() * 6),
      burst: 1 + Math.floor(Math.random() * 10),
    });
  }
}

function addProcess() {
  processes.push({ pid: 'P' + pidCounter++, arrival: 0, burst: 4 });
  renderProcessTable();
}

function collectInputValues() {
  processes.forEach((p, i) => {
    const arr = document.querySelector(`input[data-field="arrival"][data-idx="${i}"]`);
    const bst = document.querySelector(`input[data-field="burst"][data-idx="${i}"]`);
    if (arr) p.arrival = +arr.value || 0;
    if (bst) p.burst = +bst.value || 1;
  });
  saveToStorage();
}

function getAIPrediction(pid, burst) {
  if (!aiMemory[pid]) {
    aiMemory[pid] = { history: [burst], smoothed: burst };
  }
  const mem = aiMemory[pid];
  // Exponential smoothing
  const predicted = alpha * mem.smoothed + (1 - alpha) * (mem.history[mem.history.length - 1] || burst);
  return Math.max(1, Math.round(predicted * 10) / 10);
}

function recordAIRun(pid, burst) {
  if (!aiMemory[pid]) aiMemory[pid] = { history: [], smoothed: burst };
  const mem = aiMemory[pid];
  mem.smoothed = alpha * burst + (1 - alpha) * mem.smoothed;
  mem.history.push(burst);
  if (mem.history.length > 10) mem.history.shift();
  saveToStorage();
}

function resetAI() {
  aiMemory = {};
  saveToStorage();
  renderProcessTable();
  renderAIPanel();
}

// ── RENDER PROCESS TABLE ─────────────────────────────
function renderProcessTable() {
  const tbody = processBody();
  tbody.innerHTML = '';
  processes.forEach((p, i) => {
    const pred = getAIPrediction(p.pid, p.burst);
    const row = document.createElement('tr');
    row.className = 'proc-row-enter';
    row.innerHTML = `
      <td><strong style="font-family:var(--font-mono);color:${COLORS[i%COLORS.length]}">${p.pid}</strong></td>
      <td><input type="number" min="0" value="${p.arrival}" data-field="arrival" data-idx="${i}"></td>
      <td><input type="number" min="1" value="${p.burst}" data-field="burst" data-idx="${i}"></td>
      <td>
        <div class="pred-cell pulse-glow">
          ${pred} ms
          <span class="pred-badge">AI</span>
        </div>
      </td>
      <td><button class="btn-del" data-idx="${i}">✕</button></td>
    `;
    tbody.appendChild(row);
  });

  // Input listeners
  tbody.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = +inp.dataset.idx;
      if (inp.dataset.field === 'arrival') processes[idx].arrival = +inp.value || 0;
      if (inp.dataset.field === 'burst') processes[idx].burst = +inp.value || 1;
      renderProcessTable();
    });
  });

  // Delete buttons
  tbody.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', () => {
      processes.splice(+btn.dataset.idx, 1);
      renderProcessTable();
    });
  });
}

// ── SCHEDULING ALGORITHMS ────────────────────────────

// FCFS
function fcfs(procs) {
  const sorted = [...procs].sort((a,b) => a.arrival - b.arrival);
  let t = 0, gantt = [], metrics = [];
  sorted.forEach(p => {
    if (t < p.arrival) t = p.arrival;
    gantt.push({ pid: p.pid, start: t, end: t + p.burst });
    const finish = t + p.burst;
    metrics.push({
      pid: p.pid,
      arrival: p.arrival,
      burst: p.burst,
      start: t,
      finish,
      turnaround: finish - p.arrival,
      waiting: t - p.arrival,
      response: t - p.arrival,
    });
    t = finish;
  });
  return { gantt, metrics };
}

// SJF Non-Preemptive
function sjf(procs) {
  let remaining = procs.map(p => ({ ...p }));
  let t = 0, gantt = [], metrics = [];
  let done = [];
  while (remaining.length > 0) {
    const available = remaining.filter(p => p.arrival <= t);
    if (available.length === 0) { t = remaining[0].arrival; continue; }
    available.sort((a,b) => a.burst - b.burst || a.arrival - b.arrival);
    const p = available[0];
    remaining = remaining.filter(r => r.pid !== p.pid);
    gantt.push({ pid: p.pid, start: t, end: t + p.burst });
    const finish = t + p.burst;
    done.push({
      pid: p.pid, arrival: p.arrival, burst: p.burst,
      start: t, finish,
      turnaround: finish - p.arrival,
      waiting: t - p.arrival,
      response: t - p.arrival,
    });
    t = finish;
  }
  return { gantt, metrics: done };
}

// Round Robin
function roundRobin(procs, quantum) {
  let queue = procs.map(p => ({ ...p, remaining: p.burst, firstRun: -1 }))
    .sort((a,b) => a.arrival - b.arrival);
  let t = 0, gantt = [], readyQ = [], done = [];
  let remaining = [...queue];
  let visited = new Set();

  while (remaining.length > 0 || readyQ.length > 0) {
    // Enqueue arrived processes
    remaining = remaining.filter(p => {
      if (p.arrival <= t && !visited.has(p.pid)) {
        visited.add(p.pid);
        readyQ.push(p);
        return false;
      }
      return true;
    });

    if (readyQ.length === 0) {
      if (remaining.length > 0) { t = remaining[0].arrival; continue; }
      break;
    }

    const p = readyQ.shift();
    if (p.firstRun === -1) p.firstRun = t;

    const run = Math.min(quantum, p.remaining);
    gantt.push({ pid: p.pid, start: t, end: t + run });
    t += run;
    p.remaining -= run;

    // Enqueue newly arrived
    remaining = remaining.filter(np => {
      if (np.arrival <= t && !visited.has(np.pid)) {
        visited.add(np.pid);
        readyQ.push(np);
        return false;
      }
      return true;
    });

    if (p.remaining > 0) {
      readyQ.push(p);
    } else {
      done.push({
        pid: p.pid, arrival: p.arrival, burst: p.burst,
        start: p.firstRun, finish: t,
        turnaround: t - p.arrival,
        waiting: (t - p.arrival) - p.burst,
        response: p.firstRun - p.arrival,
      });
    }
  }
  return { gantt, metrics: done };
}

function computeAvg(metrics, field) {
  return metrics.reduce((s,m) => s + m[field], 0) / metrics.length;
}

function computeUtilization(gantt) {
  const busy = gantt.reduce((s,g) => s + (g.end - g.start), 0);
  const total = gantt[gantt.length-1]?.end || 1;
  return (busy / total * 100).toFixed(1);
}

function computeThroughput(metrics, gantt) {
  const total = gantt[gantt.length-1]?.end || 1;
  return (metrics.length / total).toFixed(3);
}

// ── EXECUTE SIMULATION ───────────────────────────────
function executeSimulation() {
  collectInputValues();
  if (processes.length === 0) { alert('Add at least one process!'); return; }

  const loader = $('loader');
  loader.style.display = 'flex';

  setTimeout(() => {
    const activeAlgos = [...document.querySelectorAll('.algo-toggle.active')].map(t => t.dataset.algo);

    // Determine which burst times to use
    const procs = processes.map(p => {
      let b = p.burst;
      if (activeMode === 'ai') b = Math.round(getAIPrediction(p.pid, p.burst));
      return { ...p, burst: Math.max(1, b) };
    });

    // Record AI memory for this run
    processes.forEach(p => recordAIRun(p.pid, p.burst));

    simulationResults = {};
    if (activeAlgos.includes('fcfs')) simulationResults.fcfs = fcfs(procs);
    if (activeAlgos.includes('sjf'))  simulationResults.sjf  = sjf(procs);
    if (activeAlgos.includes('rr'))   simulationResults.rr   = roundRobin(procs, rrQuantum);

    loader.style.display = 'none';

    renderGanttSection();
    renderMetrics();
    renderAIPanel();
    goToSection('gantt');
  }, 600);
}

// ── GANTT CHART ──────────────────────────────────────
const ALGO_LABELS = { fcfs: 'FCFS', sjf: 'SJF', rr: 'Round Robin' };

function renderGanttSection() {
  const tabBar = $('ganttAlgoTabs');
  tabBar.innerHTML = '';
  const algos = Object.keys(simulationResults);
  algos.forEach((algo, i) => {
    const btn = document.createElement('button');
    btn.className = 'gantt-tab' + (i === 0 ? ' active' : '');
    btn.textContent = ALGO_LABELS[algo];
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gantt-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentGanttAlgo = algo;
      drawGantt(algo);
    });
    tabBar.appendChild(btn);
  });
  if (algos.length > 0) {
    currentGanttAlgo = algos[0];
    drawGantt(algos[0]);
  }
}

function drawGantt(algo) {
  const result = simulationResults[algo];
  if (!result) return;

  const canvas = $('ganttCanvas');
  const wrap = $('ganttWrap');
  const gantt = result.gantt;

  const ROW_H = 48;
  const LABEL_W = 60;
  const TIME_H = 28;
  const PAD = 16;
  const maxT = gantt[gantt.length - 1]?.end || 1;
  const SCALE = Math.min(1, 800 / maxT);
  const PX_PER_T = Math.max(28, SCALE * 40);

  const W = LABEL_W + maxT * PX_PER_T + PAD * 2;
  const H = ROW_H + TIME_H + PAD * 2;

  canvas.width = Math.max(W, wrap.clientWidth - 40);
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const isDark = document.documentElement.dataset.theme !== 'light';
  const textCol = isDark ? '#e8eaf0' : '#1a1e2e';
  const dimCol = isDark ? '#7a8099' : '#5a607a';
  const bgRow = isDark ? '#181c26' : '#d8dde8';

  // Background row
  ctx.fillStyle = bgRow;
  ctx.beginPath();
  roundRect(ctx, LABEL_W, PAD, maxT * PX_PER_T, ROW_H, 6);
  ctx.fill();

  gantt.forEach((block, i) => {
    const pIdx = processes.findIndex(p => p.pid === block.pid);
    const color = COLORS[pIdx % COLORS.length];
    const x = LABEL_W + block.start * PX_PER_T;
    const w = (block.end - block.start) * PX_PER_T;

    // Bar
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    roundRect(ctx, x + 2, PAD + 4, w - 4, ROW_H - 8, 5);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Label
    if (w > 24) {
      ctx.fillStyle = '#0a0c10';
      ctx.font = 'bold 12px "Space Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(block.pid, x + w / 2, PAD + ROW_H / 2);
    }
  });

  // Time axis
  const ticks = new Set([0]);
  gantt.forEach(b => { ticks.add(b.start); ticks.add(b.end); });
  [...ticks].sort((a,b) => a-b).forEach(tick => {
    const x = LABEL_W + tick * PX_PER_T;
    ctx.fillStyle = dimCol;
    ctx.font = '10px "Space Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(tick, x, PAD + ROW_H + TIME_H / 2 + 4);
    ctx.strokeStyle = dimCol;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(x, PAD + ROW_H);
    ctx.lineTo(x, PAD + ROW_H + 8);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // "Time →" label
  ctx.fillStyle = dimCol;
  ctx.font = '10px "Space Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Time (ms) →', LABEL_W, PAD + ROW_H + TIME_H / 2 + 4);

  // Legend
  renderGanttLegend();

  // Tooltip via mousemove
  canvas.onmousemove = e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const tip = $('ganttTooltip');

    for (const block of gantt) {
      const x = LABEL_W + block.start * PX_PER_T;
      const w = (block.end - block.start) * PX_PER_T;
      if (mx >= x && mx <= x + w && my >= PAD && my <= PAD + ROW_H) {
        tip.style.display = 'block';
        tip.style.left = (e.offsetX + 14) + 'px';
        tip.style.top = (e.offsetY - 10) + 'px';
        tip.innerHTML = `<b>${block.pid}</b><br>Start: ${block.start} ms<br>End: ${block.end} ms<br>Burst: ${block.end - block.start} ms`;
        return;
      }
    }
    tip.style.display = 'none';
  };
  canvas.onmouseleave = () => { $('ganttTooltip').style.display = 'none'; };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function renderGanttLegend() {
  const legend = $('ganttLegend');
  legend.innerHTML = '';
  processes.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<div class="legend-dot" style="background:${COLORS[i%COLORS.length]}"></div><span>${p.pid}</span>`;
    legend.appendChild(item);
  });
}

// ── METRICS ──────────────────────────────────────────
function renderMetrics() {
  const grid = $('metricsGrid');
  grid.innerHTML = '';

  const metricSets = {};
  Object.entries(simulationResults).forEach(([algo, res]) => {
    metricSets[algo] = {
      avgWait: computeAvg(res.metrics, 'waiting'),
      avgTT:   computeAvg(res.metrics, 'turnaround'),
      avgRT:   computeAvg(res.metrics, 'response'),
      util:    computeUtilization(res.gantt),
      thru:    computeThroughput(res.metrics, res.gantt),
    };
  });

  // Find best values
  const vals = Object.values(metricSets);
  const bestWait = Math.min(...vals.map(v => v.avgWait));
  const bestTT = Math.min(...vals.map(v => v.avgTT));

  Object.entries(metricSets).forEach(([algo, m]) => {
    const card = document.createElement('div');
    card.className = 'metric-card';
    card.innerHTML = `
      <div class="metric-algo">${ALGO_LABELS[algo]} ${activeMode === 'ai' ? '<span style="color:var(--accent);font-size:9px">AI</span>' : ''}</div>
      <div class="metric-row"><span class="metric-key">Avg Waiting Time</span><span class="metric-val ${m.avgWait === bestWait ? 'metric-best' : ''}">${m.avgWait.toFixed(2)} ms</span></div>
      <div class="metric-row"><span class="metric-key">Avg Turnaround</span><span class="metric-val ${m.avgTT === bestTT ? 'metric-best' : ''}">${m.avgTT.toFixed(2)} ms</span></div>
      <div class="metric-row"><span class="metric-key">Avg Response</span><span class="metric-val">${m.avgRT.toFixed(2)} ms</span></div>
      <div class="metric-row"><span class="metric-key">CPU Utilization</span><span class="metric-val">${m.util}%</span></div>
      <div class="metric-row"><span class="metric-key">Throughput</span><span class="metric-val">${m.thru} proc/ms</span></div>
    `;
    grid.appendChild(card);
  });

  renderCharts(metricSets);
  renderAIInsight(metricSets);
}

function chartColors() {
  return {
    grid: document.documentElement.dataset.theme === 'light'
      ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)',
    text: document.documentElement.dataset.theme === 'light'
      ? '#5a607a' : '#7a8099',
  };
}

function renderCharts(metricSets) {
  const labels = Object.keys(metricSets).map(a => ALGO_LABELS[a]);
  const waitData = Object.values(metricSets).map(m => m.avgWait.toFixed(2));
  const ttData   = Object.values(metricSets).map(m => m.avgTT.toFixed(2));
  const { grid, text } = chartColors();

  if (barChartInst) barChartInst.destroy();
  barChartInst = new Chart($('barChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Avg Waiting Time', data: waitData, backgroundColor: 'rgba(99,202,183,0.7)', borderRadius: 6 },
        { label: 'Avg Turnaround',   data: ttData,   backgroundColor: 'rgba(240,160,75,0.7)', borderRadius: 6 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { labels: { color: text, font: { family: 'Syne' } } } },
      scales: {
        x: { ticks: { color: text }, grid: { color: grid } },
        y: { ticks: { color: text }, grid: { color: grid }, beginAtZero: true }
      }
    }
  });

  // Line chart: per-process waiting comparison
  const processLabels = processes.map(p => p.pid);
  const datasets = Object.entries(simulationResults).map(([algo, res], i) => {
    const data = processes.map(p => {
      const m = res.metrics.find(m => m.pid === p.pid);
      return m ? m.waiting : 0;
    });
    return {
      label: ALGO_LABELS[algo],
      data,
      borderColor: [COLORS[0], COLORS[1], COLORS[2]][i],
      backgroundColor: 'transparent',
      tension: 0.4, pointRadius: 5,
    };
  });

  if (lineChartInst) lineChartInst.destroy();
  lineChartInst = new Chart($('lineChart'), {
    type: 'line',
    data: { labels: processLabels, datasets },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { labels: { color: text, font: { family: 'Syne' } } } },
      scales: {
        x: { ticks: { color: text }, grid: { color: grid } },
        y: { ticks: { color: text }, grid: { color: grid }, beginAtZero: true, title: { display: true, text: 'Waiting Time (ms)', color: text } }
      }
    }
  });
}

function renderAIInsight(metricSets) {
  const insight = $('aiInsight');
  const algos = Object.keys(metricSets);
  if (algos.length < 2) { insight.innerHTML = ''; return; }

  const waits = algos.map(a => ({ algo: a, w: metricSets[a].avgWait }));
  waits.sort((a,b) => a.w - b.w);
  const best = waits[0];
  const worst = waits[waits.length-1];
  const improv = (((worst.w - best.w) / worst.w) * 100).toFixed(1);

  const modeLabel = activeMode === 'ai' ? ' (with AI Burst Prediction)' : '';

  insight.innerHTML = `
    <strong>🤖 SEVEN UP AI Insight${modeLabel}:</strong><br>
    <strong>${ALGO_LABELS[best.algo]}</strong> achieved the best avg waiting time of <strong>${best.w.toFixed(2)} ms</strong>,
    outperforming <strong>${ALGO_LABELS[worst.algo]}</strong> (${worst.w.toFixed(2)} ms) by <strong>${improv}%</strong>.
    ${activeMode === 'ai' ? `AI-predicted burst times were applied using exponential smoothing (α=${alpha.toFixed(1)}), which adapts predictions based on process history.` : 'Switch to "AI Predicted Burst" mode in Simulate section to see AI performance comparison.'}
  `;
}

function updateChartTheme() {
  if (barChartInst || lineChartInst) {
    const metricSets = {};
    Object.entries(simulationResults).forEach(([algo, res]) => {
      metricSets[algo] = {
        avgWait: computeAvg(res.metrics, 'waiting'),
        avgTT:   computeAvg(res.metrics, 'turnaround'),
      };
    });
    if (Object.keys(metricSets).length > 0) renderCharts(metricSets);
  }
  if (currentGanttAlgo && simulationResults[currentGanttAlgo]) {
    drawGantt(currentGanttAlgo);
  }
}

// ── AI PANEL ─────────────────────────────────────────
function renderAIPanel() {
  const tbody = $('aiHistoryBody');
  tbody.innerHTML = '';
  processes.forEach((p, i) => {
    const mem = aiMemory[p.pid];
    const hist = mem ? mem.history : [p.burst];
    const smoothed = mem ? mem.smoothed.toFixed(1) : p.burst;
    const lastActual = hist[hist.length - 1] || p.burst;
    const pred = getAIPrediction(p.pid, p.burst);
    const acc = lastActual > 0 ? Math.max(0, 100 - Math.abs(pred - lastActual) / lastActual * 100).toFixed(1) : '—';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong style="font-family:var(--font-mono);color:${COLORS[i%COLORS.length]}">${p.pid}</strong></td>
      <td style="font-family:var(--font-mono);font-size:12px;color:var(--text-dim)">${hist.join(' → ')}</td>
      <td style="font-family:var(--font-mono);color:var(--accent)" class="pulse-glow">${smoothed} ms</td>
      <td style="font-family:var(--font-mono)">${acc}%</td>
    `;
    tbody.appendChild(row);
  });
}

// ── DOWNLOAD / EXPORT ────────────────────────────────
function downloadGantt() {
  const canvas = $('ganttCanvas');
  const link = document.createElement('a');
  link.download = 'gantt-chart-sevenup.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function exportPDF() {
  alert('📄 PDF Export: To save as PDF, use your browser\'s Print function (Ctrl/Cmd+P) and select "Save as PDF". This keeps full styling and charts intact.\n\n— SEVEN UP Team');
}

// ── LOCAL STORAGE ─────────────────────────────────────
function saveToStorage() {
  try {
    localStorage.setItem('sevenup_processes', JSON.stringify(processes));
    localStorage.setItem('sevenup_pidCounter', pidCounter);
    localStorage.setItem('sevenup_aiMemory', JSON.stringify(aiMemory));
  } catch(e) {}
}

function loadFromStorage() {
  try {
    const p = localStorage.getItem('sevenup_processes');
    const c = localStorage.getItem('sevenup_pidCounter');
    const m = localStorage.getItem('sevenup_aiMemory');
    if (p) processes = JSON.parse(p);
    if (c) pidCounter = +c;
    if (m) aiMemory = JSON.parse(m);
  } catch(e) {}
}
