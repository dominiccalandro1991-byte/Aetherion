import { describe, it, expect } from 'vitest';
import { FMEARegistry, recomputeRanks, AFM_REGISTRY } from '../src/foundation/08-atomic-failure-modes.js';

describe('08 Atomic Failure Modes', () => {
  it('registry contains critical modes', () => {
    const reg = new FMEARegistry();
    const critical = reg.getCritical();
    expect(critical.length).toBeGreaterThan(0);
    expect(critical.every((m) => m.priority === 'Critical')).toBe(true);
  });

  it('recomputeRanks orders by RPN then severity', () => {
    const ranked = recomputeRanks(AFM_REGISTRY);
    // AFM-005 has highest RPN (81) in the seed registry
    expect(ranked[0].id).toBe('AFM-005');
    expect(ranked[0].rpn).toBeGreaterThanOrEqual(ranked[1].rpn);
    // All critical modes retain Critical priority
    expect(ranked.filter((m) => m.severity >= 9).every((m) => m.priority === 'Critical')).toBe(true);
  });

  it('getById returns known mode', () => {
    const reg = new FMEARegistry();
    expect(reg.getById('AFM-002')?.name).toContain('Genetic Fitness');
  });
});
