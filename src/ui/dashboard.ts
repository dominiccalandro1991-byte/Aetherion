/**
 * Aetherion Live Dashboard — binds UI controls to AetherionRuntime
 */

import { AetherionRuntime } from '../core/orchestrator.js';

const runtime = new AetherionRuntime();
const MAX_LOG_LINES = 80;

// ── DOM refs ───────────────────────────────────────────────────────────────
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const btnStart = $<HTMLButtonElement>('btn-start');
const btnPause = $<HTMLButtonElement>('btn-pause');
const btnTick = $<HTMLButtonElement>('btn-tick');
const btnReset = $<HTMLButtonElement>('btn-reset');

const statusDot = $('status-dot');
const statusLabel = $('status-label');
const tickBadge = $('tick-badge');

const metaTick = $('meta-tick');
const metaSeeds = $('meta-seeds');
const metaCss = $('meta-css');
const metaSri = $('meta-sri');
const metaAlerts = $('meta-alerts');
const metaAfms = $('meta-afms');

const econFill = $('econ-gauge-fill');
const econValue = $('econ-css-value');
const econAlerts = $('econ-alerts');

const genGeneration = $('gen-generation');
const genFitness = $('gen-fitness');
const genPop = $('gen-pop');
const genVariance = $('gen-variance');

const tocPhase = $('toc-phase');
const tocConstraint = $('toc-constraint');
const tocCis = $('toc-cis');
const tocPlan = $('toc-plan');

const lawUnits = $('law-units');
const lawCases = $('law-cases');
const lawThreat = $('law-threat');
const lawThreatBar = $('law-threat-bar');

const asSri = $('as-sri');
const asCount = $('as-count');
const asState = $('as-state');

const seedTotal = $('seed-total');
const seedNodes = $('seed-nodes');

const icsAndon = $('ics-andon');
const icsRed = $('ics-red');
const icsList = $('ics-list');

const afmCritical = $('afm-critical');
const afmTotal = $('afm-total');
const afmList = $('afm-list');

const logFeed = $('log-feed');

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function appendLog(kind: string, message: string): void {
  const line = document.createElement('div');
  line.className = 'log-line';
  const ts = new Date().toISOString().slice(11, 23);
  line.innerHTML = `<span class="ts">${ts}</span><span class="kind">[${kind}]</span>${message}`;
  logFeed.prepend(line);
  while (logFeed.children.length > MAX_LOG_LINES) {
    logFeed.removeChild(logFeed.lastChild!);
  }
}

function setStatus(status: string): void {
  statusDot.dataset.status = status;
  statusLabel.textContent = status.toUpperCase();
}

function updateControls(status: string): void {
  const running = status === 'running';
  const paused = status === 'paused';
  btnStart.disabled = running;
  btnPause.disabled = !running;
  btnTick.disabled = running;
}

// ── Render telemetry from runtime state ────────────────────────────────────
function render(): void {
  const state = runtime.getState();

  setStatus(state.status);
  updateControls(state.status);
  tickBadge.textContent = `T-${state.tick}`;

  metaTick.textContent = String(state.tick);
  metaSeeds.textContent = String(Math.round(state.seedTotal));
  metaCss.textContent = fmt(state.aggregateCSS, 3);
  metaSri.textContent = fmt(state.sriMax, 3);
  metaAlerts.textContent = String(state.activeAlerts);
  metaAfms.textContent = String(state.criticalAFMs);

  // Economic gauge
  const cssPct = Math.max(0, Math.min(100, state.aggregateCSS * 100));
  econFill.style.width = `${cssPct}%`;
  econValue.textContent = fmt(state.aggregateCSS, 3);

  const alerts = runtime.economy.getActiveAlerts();
  econAlerts.innerHTML = '';
  for (const a of alerts.slice(-5)) {
    const li = document.createElement('li');
    li.textContent = `${a.severity}: ${a.metricName}=${fmt(a.metricValue)}`;
    econAlerts.appendChild(li);
  }

  // Genetics
  genGeneration.textContent = String(runtime.genetics.generation);
  genFitness.textContent = fmt(runtime.genetics.meanFitness, 3);
  genPop.textContent = String(runtime.genetics.genomes.length);
  genVariance.textContent = fmt(runtime.genetics.geneVariance, 4);

  // TOC
  tocPhase.textContent = runtime.toc.phase;
  const c = runtime.toc.currentConstraint;
  tocConstraint.textContent = c ? c.type : '—';
  tocCis.textContent = c ? fmt(c.constraintImpactScore, 3) : '—';
  const plan = runtime.toc.activePlans[runtime.toc.activePlans.length - 1];
  if (plan && plan.actions.length) {
    tocPlan.textContent = plan.actions
      .map((a) => `${a.description} (ΔT≈${fmt(a.expectedTIncrease)})`)
      .join(' · ');
  } else {
    tocPlan.textContent = 'No active elevation plan';
  }

  // Law (placeholder counts until units registered by sim)
  lawUnits.textContent = String(runtime.law.units.size);
  lawCases.textContent = String(runtime.law.cases.size);
  const threatLevel = state.sriMax > 0.7 ? 'HIGH' : state.sriMax > 0.45 ? 'ELEVATED' : 'LOW';
  lawThreat.textContent = threatLevel;
  const threatPct = Math.min(100, state.sriMax * 100);
  lawThreatBar.style.width = `${Math.max(8, threatPct)}%`;
  lawThreatBar.style.background =
    threatPct > 70
      ? '#ff6b85'
      : threatPct > 45
        ? 'var(--aetherion-accent-gold)'
        : 'var(--aetherion-accent-cyan)';

  // Anti-singularity
  asSri.textContent = fmt(state.sriMax, 3);
  asCount.textContent = String(runtime.antiSingularity.objects.size);
  let highest = 'Normal';
  for (const o of runtime.antiSingularity.objects.values()) {
    if (o.state !== 'Normal') highest = o.state;
  }
  asState.textContent = highest;

  // Seed
  seedTotal.textContent = String(Math.round(state.seedTotal));
  seedNodes.textContent = '1';

  // Industrial
  const andons = runtime.industrial.andonEvents;
  icsAndon.textContent = String(andons.length);
  const reds = andons.filter((e) => e.severity === 'RED' || e.severity === 'CRITICAL');
  icsRed.textContent = String(reds.length);
  icsList.innerHTML = '';
  for (const e of andons.slice(-4)) {
    const li = document.createElement('li');
    li.textContent = `${e.severity} · ${e.signalCode}`;
    icsList.appendChild(li);
  }

  // AFM
  const critical = runtime.fmea.getCritical();
  afmCritical.textContent = String(critical.length);
  afmTotal.textContent = String(runtime.fmea.modes.length);
  afmList.innerHTML = '';
  for (const m of critical.slice(0, 4)) {
    const li = document.createElement('li');
    li.textContent = `${m.id} · ${m.name}`;
    afmList.appendChild(li);
  }
}

// ── UI event bindings ──────────────────────────────────────────────────────
btnStart.addEventListener('click', () => {
  runtime.start(200);
  appendLog('RUNTIME', 'Simulation started (200 ms interval)');
  render();
});

btnPause.addEventListener('click', () => {
  runtime.pause();
  appendLog('RUNTIME', 'Simulation paused');
  render();
});

btnTick.addEventListener('click', () => {
  runtime.tick();
  appendLog('TICK', `Manual tick → T-${runtime.getState().tick}`);
  render();
});

btnReset.addEventListener('click', () => {
  runtime.stop();
  // Re-instantiate clean runtime
  location.reload();
});

// Poll while running so gauges stay live even if tick interval is long
setInterval(() => {
  if (runtime.getState().status === 'running') {
    render();
  }
}, 250);

// Initial paint
appendLog('SYSTEM', 'Aetherion dashboard online · 14 foundation engines loaded');
render();
