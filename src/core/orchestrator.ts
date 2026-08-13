/**
 * AetherionRuntime — Unified Simulation Orchestrator
 * Wires all 14 foundation engines into a single tick-based loop.
 */

import { RetentionProxyEngine } from '../foundation/01-retention-proxies.js';
import { EconomicStabilityMonitor } from '../foundation/02-economic-stability.js';
import { aggregateReviews } from '../foundation/03-peer-review.js';
import { GeneticPopulation, DEFAULT_GENOME_CONFIG } from '../foundation/04-genetic-mutation.js';
import { LawEnforcementEngine, Rank } from '../foundation/05-law-enforcement.js';
import {
  updateSeedCascade,
  effectiveRate,
  DEFAULT_SEED_CONFIG,
  type SeedNode,
} from '../foundation/06-seed-cascade.js';
import { AntiSingularityEngine } from '../foundation/07-anti-singularity.js';
import { FMEARegistry } from '../foundation/08-atomic-failure-modes.js';
import { ConcurrentActivityLog } from '../foundation/09-concurrent-activity-logs.js';
import { assessNovelty } from '../foundation/10-prior-art.js';
import { ALCOATrailStore } from '../foundation/11-alcoa-trails.js';
import { ServerMetricsCollector, computeEconomicStabilityScore } from '../foundation/12-server-metrics.js';
import { IndustrialControlSystem } from '../foundation/13-industrial-controls.js';
import { TOCEngine } from '../foundation/14-toc-bottleneck.js';
import type { UUID } from '../foundation/types.js';

export type RuntimeStatus = 'idle' | 'running' | 'paused' | 'stopped';

export interface RuntimeState {
  status: RuntimeStatus;
  tick: number;
  startedAt: number | null;
  lastTickAt: number | null;
  aggregateCSS: number;
  activeAlerts: number;
  criticalAFMs: number;
  seedTotal: number;
  sriMax: number;
  logEntries: number;
}

export class AetherionRuntime {
  readonly retention = new RetentionProxyEngine();
  readonly economy = new EconomicStabilityMonitor();
  readonly genetics = new GeneticPopulation({ ...DEFAULT_GENOME_CONFIG, populationSize: 32 });
  readonly law = new LawEnforcementEngine();
  readonly antiSingularity = new AntiSingularityEngine();
  readonly fmea = new FMEARegistry();
  readonly activityLog = new ConcurrentActivityLog();
  readonly trails = new ALCOATrailStore();
  readonly metrics = new ServerMetricsCollector();
  readonly industrial = new IndustrialControlSystem();
  readonly toc = new TOCEngine();

  private nodes = new Map<string, SeedNode>();
  private status: RuntimeStatus = 'idle';
  private tickCount = 0;
  private startedAt: number | null = null;
  private lastTickAt: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickIntervalMs = 100;

  constructor() {
    // Seed a minimal world so the loop has something to drive
    this.nodes.set('alpha', {
      id: 'alpha',
      S_total: 10,
      S_mature: 4,
      K: DEFAULT_SEED_CONFIG.Kbase,
      fractionalAccumulator: 0,
      neighbors: [],
    });
    // Auto-seed Engine 04 with 20 base genomes (Generation 0 → advances on first step)
    this.genetics.seedInitialPopulation(20);
    this.genetics.evaluateAll(() => [
      0.55 + Math.random() * 0.3,
      0.5 + Math.random() * 0.3,
      0.6 + Math.random() * 0.25,
      0.45 + Math.random() * 0.3,
      0.4 + Math.random() * 0.3,
      0.5 + Math.random() * 0.3,
    ]);
  }

  start(intervalMs = 100): void {
    if (this.status === 'running') return;
    this.status = 'running';
    this.startedAt = Date.now();
    this.tickIntervalMs = intervalMs;
    this.timer = setInterval(() => this.tick(), intervalMs);
    this.logSystem('RUNTIME_START', { intervalMs });
  }

  pause(): void {
    if (this.status !== 'running') return;
    this.status = 'paused';
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logSystem('RUNTIME_PAUSE', { tick: this.tickCount });
  }

  stop(): void {
    this.pause();
    this.status = 'stopped';
    this.logSystem('RUNTIME_STOP', { tick: this.tickCount });
  }

  /** Single simulation step — data flows across engines */
  tick(): void {
    const now = Date.now();
    this.tickCount += 1;
    this.lastTickAt = now;

    // 1. Seed Cascade step
    let seedTotal = 0;
    for (const node of this.nodes.values()) {
      const rho = effectiveRate(DEFAULT_SEED_CONFIG.rho0);
      const result = updateSeedCascade(node, rho, 1.0);
      seedTotal += node.S_total;
      if (result.localAdded > 0) {
        this.activityLog.append(`cascade:${node.id}`, {
          actorId: 'system:cascade',
          actorType: 'CascadeController',
          activityType: 'SEED_CASCADE_STEP',
          outcome: 'SUCCESS',
          correlationId: crypto.randomUUID(),
          parameters: { localAdded: result.localAdded, dispersed: result.dispersed },
        });
      }
    }

    // 2. Genetic evaluation + generational step
    // Seed-to-genome pipeline: mature cascade growth injects new organisms
    let cascadeSpawned = 0;
    for (const node of this.nodes.values()) {
      // use fractional mature growth as spawn signal (at least 1 when cascade added seeds)
      cascadeSpawned += Math.max(0, Math.floor(node.S_mature / 4));
    }
    // Cap injection per tick so population grows smoothly toward populationSize
    const injectCount = Math.min(2, Math.max(0, cascadeSpawned > 0 ? 1 : 0));
    if (injectCount > 0) {
      this.genetics.injectFromSeeds(injectCount);
    }

    const telemetry = () => [
      0.55 + Math.random() * 0.35,
      0.5 + Math.random() * 0.35,
      0.6 + Math.random() * 0.3,
      0.45 + Math.random() * 0.35,
      0.4 + Math.random() * 0.35,
      0.5 + Math.random() * 0.35,
    ];
    // Evaluate every tick; advance generation every tick so UI metrics move live
    this.genetics.evaluateAll(telemetry);
    this.genetics.nextGeneration();

    // 3. Economic stability tick
    this.economy.tick(this.tickCount);
    const css = this.economy.getAggregateCSS();

    // 4. Anti-singularity scan on cascade nodes
    let sriMax = 0;
    for (const node of this.nodes.values()) {
      this.antiSingularity.update({
        objectId: node.id,
        type: 'SeedCascade',
        currentFitness: this.genetics.meanFitness || 0.5,
        cascadeRate: DEFAULT_SEED_CONFIG.rho0,
        resourceShare: node.S_total / Math.max(node.K, 1),
        giniConcentration: 0.3,
        cascadeDepth: 2,
        cascadeBreadth: 5,
        sri: 0,
        state: 'Normal',
        interventionCount: 0,
      });
      const obj = this.antiSingularity.objects.get(node.id);
      if (obj) sriMax = Math.max(sriMax, obj.sri);
    }

    // 5. Industrial controls guard on cascade rate
    const guards = this.industrial.evaluateGuards('SEED_CASCADE', {
      proposedRate: DEFAULT_SEED_CONFIG.rho0,
      baselineRate: DEFAULT_SEED_CONFIG.rho0,
    });
    for (const g of guards) {
      if (!g.isValid) {
        this.industrial.raiseAndon('RED', 'SEED_CASCADE', g.reasonCode, g.reasonCode);
      }
    }

    // 6. Metrics emission
    this.metrics.emit({
      metricName: 'sim.tick',
      category: 'SIM',
      value: this.tickCount,
      unit: 'count',
      labels: { runtime: 'aetherion' },
      aggregationWindow: 'raw',
      sampleCount: 1,
      sourceLogIds: [],
    });
    this.metrics.emit({
      metricName: 'econ.stability.score',
      category: 'ECON',
      value: css,
      unit: 'ratio',
      labels: {},
      aggregationWindow: '1s',
      sampleCount: 1,
      sourceLogIds: [],
    });
    this.metrics.emit({
      metricName: 'sim.cascade.active_seeds',
      category: 'SIM',
      value: seedTotal,
      unit: 'count',
      labels: {},
      aggregationWindow: 'raw',
      sampleCount: 1,
      sourceLogIds: [],
    });

    // 7. ALCOA trail for the tick itself
    this.trails.record(
      'System',
      { kind: 'SystemComponent', id: 'runtime' },
      'TICK',
      { tick: this.tickCount, seedTotal, css, sriMax }
    );

    // 8. TOC identification every 20 ticks
    if (this.tickCount % 20 === 0) {
      this.toc.identify([
        {
          type: 'SeedCascadePropagation',
          location: 'alpha',
          capacity: DEFAULT_SEED_CONFIG.Kbase,
          flow: seedTotal,
          contribution: 0.4,
          queuePressure: seedTotal / DEFAULT_SEED_CONFIG.Kbase,
        },
      ]);
    }
  }

  getState(): RuntimeState {
    let seedTotal = 0;
    for (const n of this.nodes.values()) seedTotal += n.S_total;
    let sriMax = 0;
    for (const o of this.antiSingularity.objects.values()) {
      sriMax = Math.max(sriMax, o.sri);
    }
    return {
      status: this.status,
      tick: this.tickCount,
      startedAt: this.startedAt,
      lastTickAt: this.lastTickAt,
      aggregateCSS: this.economy.getAggregateCSS(),
      activeAlerts: this.economy.getActiveAlerts().length,
      criticalAFMs: this.fmea.getCritical().length,
      seedTotal,
      sriMax,
      logEntries: 0, // simplified; full partition scan available via activityLog
    };
  }

  private logSystem(activityType: string, parameters: Record<string, unknown>): void {
    this.activityLog.append('global:system', {
      actorId: 'runtime',
      actorType: 'SystemService',
      activityType,
      outcome: 'SUCCESS',
      correlationId: crypto.randomUUID(),
      parameters,
      retentionClass: 'CRITICAL',
    });
  }
}

export default AetherionRuntime;
