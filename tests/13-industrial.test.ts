import { describe, it, expect } from 'vitest';
import {
  seedCascadeRateGuard,
  computeXmRLimits,
  checkWesternElectric,
  IndustrialControlSystem,
} from '../src/foundation/13-industrial-controls.js';

describe('13 Industrial Controls', () => {
  it('blocks excessive cascade rate', () => {
    const r = seedCascadeRateGuard(0.5, 0.18, 0.15);
    expect(r.isValid).toBe(false);
    expect(r.severity).toBe('BLOCK');
  });

  it('allows rate within deviation', () => {
    const r = seedCascadeRateGuard(0.19, 0.18, 0.15);
    expect(r.isValid).toBe(true);
  });

  it('XmR limits produce UCL > centerline', () => {
    const values = [10, 11, 9, 12, 10, 11, 10];
    const limits = computeXmRLimits(values);
    expect(limits.ucl).toBeGreaterThan(limits.centerline);
  });

  it('detects point beyond 3 sigma', () => {
    const limits = computeXmRLimits([10, 10, 10, 10, 10]);
    const rules = checkWesternElectric([10, 10, 10, 10, 100], limits.centerline, limits.ucl, limits.lcl);
    expect(rules).toContain('Rule1_Beyond3Sigma');
  });

  it('raises Andon events', () => {
    const ics = new IndustrialControlSystem();
    const evt = ics.raiseAndon('RED', 'SEED_CASCADE', 'RATE_BREACH', 'Rate exceeded');
    expect(evt.status).toBe('OPEN');
    expect(ics.andonEvents.length).toBe(1);
  });
});
