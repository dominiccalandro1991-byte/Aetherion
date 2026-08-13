import { describe, it, expect } from 'vitest';
import {
  effectiveRate,
  updateSeedCascade,
  DEFAULT_SEED_CONFIG,
  type SeedNode,
} from '../src/foundation/06-seed-cascade.js';

describe('06 Seed Cascade', () => {
  it('effective rate clamps to rhoMax', () => {
    const r = effectiveRate(0.18, 10, 10, 10, 10);
    expect(r).toBeLessThanOrEqual(DEFAULT_SEED_CONFIG.rhoMax);
  });

  it('no generation when no mature seeds', () => {
    const node: SeedNode = {
      id: 'n1',
      S_total: 5,
      S_mature: 0,
      K: 250,
      fractionalAccumulator: 0,
      neighbors: [],
    };
    const r = updateSeedCascade(node, 0.18);
    expect(r.localAdded).toBe(0);
  });

  it('generates seeds under capacity', () => {
    const node: SeedNode = {
      id: 'n2',
      S_total: 10,
      S_mature: 5,
      K: 250,
      fractionalAccumulator: 0,
      neighbors: [],
    };
    // run enough ticks to accumulate integers
    let totalLocal = 0;
    for (let i = 0; i < 20; i++) {
      const r = updateSeedCascade(node, 0.18);
      totalLocal += r.localAdded;
    }
    expect(totalLocal).toBeGreaterThan(0);
    expect(node.S_total).toBeGreaterThan(10);
  });

  it('respects hard ceiling', () => {
    const node: SeedNode = {
      id: 'n3',
      S_total: DEFAULT_SEED_CONFIG.maxSeedsPerNode,
      S_mature: 100,
      K: 250,
      fractionalAccumulator: 0,
      neighbors: [],
    };
    const r = updateSeedCascade(node, 0.18);
    expect(r.localAdded).toBe(0);
  });
});
