/**
 * Engine 01 — Retention Proxies
 * Verified specification from Planet Builders master package.
 * Deterministic cohort, asset, genetic, economic, and loyalty retention metrics.
 */

import type { UUID, Timestamp } from './types.js';

export type RetentionEventType =
  | 'SESSION_START'
  | 'SESSION_END'
  | 'ASSET_DELTA'
  | 'POPULATION_DELTA'
  | 'TRAIT_MUTATION'
  | 'ECONOMIC_DELTA'
  | 'LOYALTY_DELTA'
  | 'CASCADE_SEED'
  | 'TERRITORY_CHANGE';

export interface RetentionEvent {
  eventId: UUID;
  timestamp: Timestamp;
  empireId: string;
  playerId: string | null;
  eventType: RetentionEventType;
  payload: Record<string, number | string | boolean>;
  sequence: number;
  checksum: string;
}

export interface EmpireRetentionSnapshot {
  empireId: string;
  date: string; // YYYY-MM-DD
  activePlayersD1: number;
  activePlayersD7: number;
  activePlayersD30: number;
  totalControlledSystems: number;
  totalPopulation: number;
  economicValue: number;
  traitRetentionVector: number[];
  loyaltyScore: number;
  lastEventSeq: number;
  flags: string[];
}

export interface RetentionConfig {
  windows: ('1d' | '7d' | '30d')[];
  geneLociCount: number;
  crpiWeights: [number, number, number, number, number]; // PCRR, EARR, PGTRI, EVCS, FLPM
  epsilon: number;
  maxLoyaltyClamp: number;
  dataGapThresholdHours: number;
}

export const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  windows: ['1d', '7d', '30d'],
  geneLociCount: 64,
  crpiWeights: [0.25, 0.25, 0.2, 0.15, 0.15],
  epsilon: 1e-9,
  maxLoyaltyClamp: 2.0,
  dataGapThresholdHours: 6,
};

/** Player Cohort Retention Rate */
export function computePCRR(
  cohortSize: number,
  retainedCount: number
): { value: number; flag?: string } {
  if (cohortSize === 0) return { value: 1.0, flag: 'EMPTY_COHORT' };
  return { value: retainedCount / cohortSize };
}

/** Empire Asset Retention Rate */
export function computeEARR(
  currentAssetSum: number,
  priorAssetSum: number
): { value: number; flag?: string } {
  if (priorAssetSum <= 0) return { value: 1.0, flag: 'NO_PRIOR_ASSETS' };
  return { value: Math.max(0, currentAssetSum) / priorAssetSum };
}

/** Population Genetic Trait Retention Index (weighted Hamming) */
export function computePGTRI(
  currentVectors: number[][],
  priorVectors: number[][],
  geneLociCount: number
): { value: number; flag?: string } {
  if (currentVectors.length === 0 || priorVectors.length === 0) {
    return { value: 1.0, flag: 'NO_OVERLAP_POP' };
  }
  let total = 0;
  const pairs = Math.min(currentVectors.length, priorVectors.length);
  for (let i = 0; i < pairs; i++) {
    const a = currentVectors[i];
    const b = priorVectors[i];
    const len = Math.min(a.length, b.length, geneLociCount);
    let hamming = 0;
    for (let g = 0; g < len; g++) {
      if (a[g] !== b[g]) hamming++;
    }
    total += 1 - hamming / Math.max(len, 1);
  }
  return { value: total / pairs };
}

/** Economic Value Continuity Score */
export function computeEVCS(
  currentE: number,
  priorE: number,
  epsilon = 1e-9
): number {
  const maxE = Math.max(currentE, priorE, epsilon);
  return 1 - Math.abs(currentE - priorE) / maxE;
}

/** Faction Loyalty Persistence Metric */
export function computeFLPM(
  currentLoyalties: number[],
  priorLoyalties: number[],
  maxClamp = 2.0
): { value: number; flag?: string } {
  if (currentLoyalties.length === 0) return { value: 1.0, flag: 'EMPTY_FACTION' };
  let sum = 0;
  const n = Math.min(currentLoyalties.length, priorLoyalties.length);
  for (let i = 0; i < n; i++) {
    const ratio = currentLoyalties[i] / Math.max(priorLoyalties[i], 0.01);
    sum += Math.min(Math.max(ratio, 0), maxClamp);
  }
  return { value: sum / n };
}

/** Composite Retention Proxy Index */
export function computeCRPI(
  pcrr30: number,
  earr30: number,
  pgtri30: number,
  evcs30: number,
  flpm30: number,
  weights: [number, number, number, number, number] = DEFAULT_RETENTION_CONFIG.crpiWeights
): number {
  const clip = (v: number) => Math.min(1, Math.max(0, v));
  return (
    weights[0] * clip(pcrr30) +
    weights[1] * clip(earr30) +
    weights[2] * clip(pgtri30) +
    weights[3] * clip(evcs30) +
    weights[4] * clip(flpm30)
  );
}

export class RetentionProxyEngine {
  private events: Map<string, RetentionEvent[]> = new Map();
  private config: RetentionConfig;

  constructor(config: Partial<RetentionConfig> = {}) {
    this.config = { ...DEFAULT_RETENTION_CONFIG, ...config };
  }

  ingest(event: RetentionEvent): void {
    const list = this.events.get(event.empireId) ?? [];
    list.push(event);
    list.sort((a, b) => a.sequence - b.sequence);
    this.events.set(event.empireId, list);
  }

  getEvents(empireId: string): RetentionEvent[] {
    return this.events.get(empireId) ?? [];
  }

  /** Placeholder materialization – full daily job would query a time-series store */
  materializeSnapshot(empireId: string, date: string): EmpireRetentionSnapshot {
    const events = this.getEvents(empireId);
    return {
      empireId,
      date,
      activePlayersD1: 0,
      activePlayersD7: 0,
      activePlayersD30: 0,
      totalControlledSystems: 0,
      totalPopulation: 0,
      economicValue: 0,
      traitRetentionVector: new Array(this.config.geneLociCount).fill(1),
      loyaltyScore: 1,
      lastEventSeq: events.length ? events[events.length - 1].sequence : 0,
      flags: events.length === 0 ? ['NEW_EMPIRE'] : [],
    };
  }
}
