import { describe, it, expect } from 'vitest';
import {
  ServerMetricsCollector,
  computeEconomicStabilityScore,
} from '../src/foundation/12-server-metrics.js';

describe('12 Server Metrics', () => {
  it('stability score is bounded', () => {
    const s = computeEconomicStabilityScore({
      cascadeRate: 0.18,
      baseline: 0.18,
      fitnessStddev: 0.1,
      fitnessMean: 0.6,
      currencyVelocityAnomaly: 0.05,
      lawTransitionAnomaly: 0.02,
    });
    expect(s).toBeGreaterThan(0.5);
    expect(s).toBeLessThanOrEqual(1);
  });

  it('collector emits and queries', () => {
    const c = new ServerMetricsCollector();
    c.emit({
      metricName: 'sim.tick.duration_ms',
      category: 'SIM',
      value: 12.5,
      unit: 'ms',
      labels: { server_id: 's1' },
      aggregationWindow: 'raw',
      sampleCount: 1,
      sourceLogIds: [],
    });
    const latest = c.latest('sim.tick.duration_ms');
    expect(latest?.value).toBe(12.5);
  });
});
