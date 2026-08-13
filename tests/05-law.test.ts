import { describe, it, expect } from 'vitest';
import {
  LawEnforcementEngine,
  Rank,
  computeThreatScore,
  canTransition,
  type EnforcementUnit,
} from '../src/foundation/05-law-enforcement.js';

describe('05 Law Enforcement', () => {
  it('threat score is bounded', () => {
    const t = computeThreatScore(1, 1, 1);
    expect(t).toBeLessThanOrEqual(1);
    expect(t).toBeGreaterThan(0);
  });

  it('dormant -> active_patrol on PatrolOrder', () => {
    const unit: EnforcementUnit = {
      unitId: 'u1',
      rank: Rank.SENTINEL,
      jurisdiction: 'LocalCell',
      state: 'DORMANT',
      activeCases: [],
      forceBudget: 10,
      lastTransitionTs: 0,
    };
    const r = canTransition(unit, 'PatrolOrder');
    expect(r.ok).toBe(true);
    expect(r.next).toBe('ACTIVE_PATROL');
  });

  it('engine applies transition', () => {
    const eng = new LawEnforcementEngine();
    eng.registerUnit({
      unitId: 'u2',
      rank: Rank.WARDEN,
      jurisdiction: 'Planetary',
      state: 'DORMANT',
      activeCases: [],
      forceBudget: 20,
      lastTransitionTs: 0,
    });
    const result = eng.attemptTransition('u2', 'PatrolOrder');
    expect(result.success).toBe(true);
    expect(result.newState).toBe('ACTIVE_PATROL');
  });
});
