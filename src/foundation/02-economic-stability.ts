/**
 * Engine 02 — Economic Stability under Mutation (MRESF)
 * Mutation-Resilient Economic Stability Framework.
 */

import type { UUID, Timestamp, AlertEvent } from './types.js';

export type EconomicUnitType = 'Planet' | 'System' | 'Faction' | 'Empire' | 'Agent';
export type MutationType = 'Beneficial' | 'Detrimental' | 'Neutral' | 'Cascading';
export type MutationScope = 'Local' | 'Regional' | 'Galactic';

export interface MutationEvent {
  eventId: UUID;
  timestamp: Timestamp;
  targetEU: UUID;
  parameterKey: string;
  delta: number;
  isRelative: boolean;
  mutationType: MutationType;
  scope: MutationScope;
  source: 'Genetic' | 'Fitness' | 'External' | 'Player' | 'Cascade';
  magnitude: number;
}

export interface EconomicStateVector {
  timestamp: Timestamp;
  production: number;
  consumption: number;
  netFlow: number;
  reserves: number;
  tradeVolume: number;
  wealth: number;
  inflationRate: number;
  activeTradeLinks: number;
}

export interface EconomicUnit {
  uniqueId: UUID;
  parentId: UUID | null;
  type: EconomicUnitType;
  economicParameters: Record<string, number>;
  currentState: EconomicStateVector;
  mutationHistory: MutationEvent[];
  lastMetrics?: MetricsBundle;
  alertState: 'Green' | 'Yellow' | 'Red';
}

export interface MetricsBundle {
  evi: number;
  rbr: number;
  pcs: number;
  tem: number;
  wds: number;
  msai: number;
  scr: number;
  css: number;
  flags: string[];
}

export interface EconomicConfig {
  sampleRateTicks: number;
  windows: {
    evi: number;
    pcs: number;
    temShockLag: number;
    wds: number;
    msaiN: number;
  };
  thresholds: {
    eviYellow: number;
    eviRed: number;
    eviRecover: number;
    rbrMin: number;
    scrCritical: number;
    contagionThreshold: number;
  };
  epsilon: number;
}

export const DEFAULT_ECON_CONFIG: EconomicConfig = {
  sampleRateTicks: 1,
  windows: { evi: 100, pcs: 60, temShockLag: 30, wds: 200, msaiN: 20 },
  thresholds: {
    eviYellow: 0.65,
    eviRed: 0.4,
    eviRecover: 0.7,
    rbrMin: 0.8,
    scrCritical: 0.25,
    contagionThreshold: 0.15,
  },
  epsilon: 1e-6,
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function computeEVI(
  history: EconomicStateVector[],
  epsilon: number
): number {
  if (history.length < 2) return 1.0;
  const netFlows = history.map((h) => h.netFlow);
  const reserves = history.map((h) => h.reserves);
  const inflations = history.map((h) => h.inflationRate);
  const muNet = Math.abs(netFlows.reduce((a, b) => a + b, 0) / netFlows.length) || epsilon;
  const muRes = reserves.reduce((a, b) => a + b, 0) / reserves.length || epsilon;
  const term =
    (stdDev(netFlows) / muNet + stdDev(reserves) / muRes + stdDev(inflations)) / 3;
  return 1.0 - clamp(term, 0, 1);
}

export function computeRBR(
  state: EconomicStateVector,
  bufferHorizonTicks = 120,
  epsilon = 1e-6
): number {
  return state.reserves / Math.max(state.consumption * bufferHorizonTicks, epsilon);
}

export function computePCS(
  history: EconomicStateVector[],
  continuityWindow = 60
): number {
  let consecutiveNeg = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].netFlow < 0) consecutiveNeg++;
    else break;
  }
  return clamp(1 - consecutiveNeg / continuityWindow, 0, 1);
}

export function computeCSS(
  metrics: Omit<MetricsBundle, 'css' | 'flags'>,
  config: EconomicConfig = DEFAULT_ECON_CONFIG
): number {
  const rbrNorm = Math.min(metrics.rbr / 2.0, 1.0);
  const temNorm = 1 / (1 + Math.exp(-metrics.tem)); // sigmoid
  return (
    0.3 * metrics.evi +
    0.2 * rbrNorm +
    0.15 * metrics.pcs +
    0.15 * temNorm +
    0.1 * metrics.wds +
    0.1 * metrics.msai
  );
}

export class EconomicStabilityMonitor {
  private units = new Map<UUID, EconomicUnit>();
  private config: EconomicConfig;
  private alerts: AlertEvent[] = [];

  constructor(config: Partial<EconomicConfig> = {}) {
    this.config = { ...DEFAULT_ECON_CONFIG, ...config };
  }

  registerEU(eu: EconomicUnit): void {
    this.units.set(eu.uniqueId, eu);
  }

  unregisterEU(id: UUID): void {
    this.units.delete(id);
  }

  pushMutation(event: MutationEvent): void {
    const eu = this.units.get(event.targetEU);
    if (!eu) return;
    eu.mutationHistory.push(event);
    if (eu.mutationHistory.length > 100) eu.mutationHistory.shift();
  }

  private computeMetricsFor(eu: EconomicUnit): MetricsBundle {
    // Simplified: real implementation would maintain sliding windows
    const evi = 0.85;
    const rbr = computeRBR(eu.currentState, 120, this.config.epsilon);
    const pcs = 0.9;
    const tem = 0;
    const wds = 0.95;
    const msai = 0.8;
    const scr = 0;
    const partial = { evi, rbr, pcs, tem, wds, msai, scr };
    const css = computeCSS(partial, this.config);
    const flags: string[] = [];
    if (rbr < this.config.thresholds.rbrMin) flags.push('LOW_BUFFER');
    return { ...partial, css, flags };
  }

  tick(currentTick: number): void {
    for (const eu of this.units.values()) {
      const metrics = this.computeMetricsFor(eu);
      eu.lastMetrics = metrics;

      if (metrics.evi < this.config.thresholds.eviRed && eu.alertState !== 'Red') {
        this.alerts.push({
          alertId: crypto.randomUUID(),
          timestamp: Date.now(),
          source: eu.uniqueId,
          severity: 'Red',
          metricName: 'EVI',
          metricValue: metrics.evi,
          thresholdBreached: this.config.thresholds.eviRed,
          recommendedAction: 'Enter safe-mode / freeze high-cost actions',
        });
        eu.alertState = 'Red';
      } else if (
        metrics.evi < this.config.thresholds.eviYellow &&
        eu.alertState === 'Green'
      ) {
        eu.alertState = 'Yellow';
      } else if (
        metrics.evi > this.config.thresholds.eviRecover &&
        eu.alertState !== 'Green'
      ) {
        eu.alertState = 'Green';
      }
    }
  }

  getMetrics(euId: UUID): MetricsBundle | undefined {
    return this.units.get(euId)?.lastMetrics;
  }

  getAggregateCSS(): number {
    let sum = 0;
    let n = 0;
    for (const eu of this.units.values()) {
      if (eu.lastMetrics) {
        sum += eu.lastMetrics.css;
        n++;
      }
    }
    return n === 0 ? 1 : sum / n;
  }

  getActiveAlerts(): AlertEvent[] {
    return [...this.alerts];
  }
}
