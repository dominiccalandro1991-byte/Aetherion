/**
 * Engine 12 — Server Metrics
 */

import type { Timestamp } from './types.js';

export type MetricCategory =
  | 'INFRA'
  | 'SIM'
  | 'PLAYER'
  | 'ECON'
  | 'INTEGRITY'
  | 'CAPACITY';

export interface MetricRecord {
  metricId: string;
  metricName: string;
  category: MetricCategory;
  timestampUtc: string;
  value: number | string | boolean;
  unit: string;
  labels: Record<string, string>;
  aggregationWindow: string;
  sampleCount: number;
  checksum?: string;
  sourceLogIds: string[];
}

export function computeEconomicStabilityScore(inputs: {
  cascadeRate: number;
  baseline: number;
  fitnessStddev: number;
  fitnessMean: number;
  currencyVelocityAnomaly: number;
  lawTransitionAnomaly: number;
}): number {
  const cascadeTerm = 1 - Math.abs(inputs.cascadeRate - inputs.baseline) / Math.max(inputs.baseline, 1e-9);
  const fitnessTerm = Math.min(1, Math.max(0, 1 - inputs.fitnessStddev / Math.max(inputs.fitnessMean, 1e-9)));
  return (
    0.4 * cascadeTerm +
    0.3 * fitnessTerm +
    0.2 * (1 - inputs.currencyVelocityAnomaly) +
    0.1 * (1 - inputs.lawTransitionAnomaly)
  );
}

export class ServerMetricsCollector {
  private buffer: MetricRecord[] = [];

  emit(record: Omit<MetricRecord, 'metricId' | 'timestampUtc'>): MetricRecord {
    const full: MetricRecord = {
      ...record,
      metricId: crypto.randomUUID(),
      timestampUtc: new Date().toISOString(),
    };
    this.buffer.push(full);
    if (this.buffer.length > 10_000) this.buffer.shift();
    return full;
  }

  query(namePrefix: string, limit = 100): MetricRecord[] {
    return this.buffer
      .filter((r) => r.metricName.startsWith(namePrefix))
      .slice(-limit);
  }

  latest(name: string): MetricRecord | undefined {
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      if (this.buffer[i].metricName === name) return this.buffer[i];
    }
    return undefined;
  }
}
