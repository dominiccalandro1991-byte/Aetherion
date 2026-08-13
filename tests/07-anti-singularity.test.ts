import { describe, it, expect } from 'vitest';
import { computeSRI, decideIntervention, AntiSingularityEngine } from '../src/foundation/07-anti-singularity.js';

describe('07 Anti-Singularity', () => {
  it('SRI is bounded [0,1]', () => {
    const sri = computeSRI({
      resourceShare: 0.5,
      sectorFairShare: 0.05,
      currentFitness: 0.9,
      sectorMedianFitness: 0.5,
      cascadeRate: 0.5,
      baselineCascadeRate: 0.18,
      cascadeDepth: 5,
      cascadeBreadth: 10,
    });
    expect(sri).toBeGreaterThanOrEqual(0);
    expect(sri).toBeLessThanOrEqual(1);
  });

  it('low SRI stays Normal', () => {
    expect(decideIntervention(0.2).state).toBe('Normal');
  });

  it('high SRI forces cooling', () => {
    const d = decideIntervention(0.95);
    expect(d.state).toBe('ForcedCooling');
    expect(d.envelope?.growthRateMultiplier).toBeLessThan(0.2);
  });

  it('engine updates object state', () => {
    const eng = new AntiSingularityEngine();
    eng.update({
      objectId: 'obj-1',
      type: 'Empire',
      currentFitness: 0.9,
      cascadeRate: 0.8,
      resourceShare: 0.6,
      giniConcentration: 0.4,
      cascadeDepth: 10,
      cascadeBreadth: 30,
      sri: 0,
      state: 'Normal',
      interventionCount: 0,
    });
    const obj = eng.objects.get('obj-1');
    expect(obj).toBeDefined();
    expect(obj!.sri).toBeGreaterThan(0);
  });
});
