import { describe, it, expect } from 'vitest';
import {
  computeEVI,
  computeRBR,
  computePCS,
  computeCSS,
  EconomicStabilityMonitor,
  type EconomicUnit,
  type EconomicStateVector,
} from '../src/foundation/02-economic-stability.js';

function makeState(overrides: Partial<EconomicStateVector> = {}): EconomicStateVector {
  return {
    timestamp: Date.now(),
    production: 100,
    consumption: 40,
    netFlow: 60,
    reserves: 500,
    tradeVolume: 20,
    wealth: 1000,
    inflationRate: 0.01,
    activeTradeLinks: 3,
    ...overrides,
  };
}

describe('02 Economic Stability', () => {
  it('EVI returns 1.0 for short history', () => {
    expect(computeEVI([makeState()], 1e-6)).toBe(1.0);
  });

  it('RBR computes buffer ratio', () => {
    const rbr = computeRBR(makeState({ reserves: 4800, consumption: 40 }), 120);
    expect(rbr).toBeCloseTo(1.0);
  });

  it('PCS drops with consecutive negative netFlow', () => {
    const hist = Array.from({ length: 30 }, () => makeState({ netFlow: -10 }));
    const pcs = computePCS(hist, 60);
    expect(pcs).toBeLessThan(1);
  });

  it('CSS is bounded [0,1]', () => {
    const css = computeCSS({
      evi: 0.9,
      rbr: 1.5,
      pcs: 0.8,
      tem: 0.2,
      wds: 0.95,
      msai: 0.7,
      scr: 0.1,
    });
    expect(css).toBeGreaterThan(0);
    expect(css).toBeLessThanOrEqual(1);
  });

  it('monitor registers and ticks', () => {
    const mon = new EconomicStabilityMonitor();
    const eu: EconomicUnit = {
      uniqueId: 'eu-1',
      parentId: null,
      type: 'Planet',
      economicParameters: {},
      currentState: makeState(),
      mutationHistory: [],
      alertState: 'Green',
    };
    mon.registerEU(eu);
    mon.tick(1);
    expect(mon.getMetrics('eu-1')).toBeDefined();
    expect(mon.getAggregateCSS()).toBeGreaterThan(0);
  });
});
