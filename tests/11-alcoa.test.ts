import { describe, it, expect } from 'vitest';
import { ALCOATrailStore } from '../src/foundation/11-alcoa-trails.js';

describe('11 ALCOA+ Trails', () => {
  it('records and verifies domain chain', () => {
    const store = new ALCOATrailStore();
    store.record('Genetic', { kind: 'SystemComponent', id: 'mut' }, 'MutationApplied', { genomeId: 'g1' });
    store.record('Genetic', { kind: 'SystemComponent', id: 'mut' }, 'FitnessEvaluate', { score: 0.8 });
    expect(store.verifyDomain('Genetic')).toBe(true);
    expect(store.getChain('Genetic').length).toBe(2);
  });

  it('independent domains stay separate', () => {
    const store = new ALCOATrailStore();
    store.record('Economic', { kind: 'Player', id: 'p1' }, 'Transfer', { amount: 100 });
    store.record('Cascade', { kind: 'SystemComponent', id: 'c' }, 'Seed', { count: 5 });
    expect(store.getChain('Economic').length).toBe(1);
    expect(store.getChain('Cascade').length).toBe(1);
  });
});
