import { describe, it, expect } from 'vitest';
import {
  computePCRR,
  computeEARR,
  computePGTRI,
  computeEVCS,
  computeFLPM,
  computeCRPI,
  RetentionProxyEngine,
} from '../src/foundation/01-retention-proxies.js';

describe('01 Retention Proxies', () => {
  it('PCRR returns 1.0 for empty cohort', () => {
    const r = computePCRR(0, 0);
    expect(r.value).toBe(1.0);
    expect(r.flag).toBe('EMPTY_COHORT');
  });

  it('PCRR computes retained fraction', () => {
    expect(computePCRR(100, 80).value).toBeCloseTo(0.8);
  });

  it('EARR returns 1.0 when no prior assets', () => {
    const r = computeEARR(50, 0);
    expect(r.value).toBe(1.0);
    expect(r.flag).toBe('NO_PRIOR_ASSETS');
  });

  it('EARR computes asset ratio', () => {
    expect(computeEARR(80, 100).value).toBeCloseTo(0.8);
  });

  it('PGTRI handles no overlap', () => {
    const r = computePGTRI([], [], 64);
    expect(r.value).toBe(1.0);
    expect(r.flag).toBe('NO_OVERLAP_POP');
  });

  it('EVCS is 1.0 when unchanged', () => {
    expect(computeEVCS(1000, 1000)).toBeCloseTo(1.0);
  });

  it('FLPM empty faction', () => {
    const r = computeFLPM([], []);
    expect(r.value).toBe(1.0);
    expect(r.flag).toBe('EMPTY_FACTION');
  });

  it('CRPI weights sum correctly on perfect scores', () => {
    const crpi = computeCRPI(1, 1, 1, 1, 1);
    expect(crpi).toBeCloseTo(1.0);
  });

  it('engine ingests and materializes', () => {
    const eng = new RetentionProxyEngine();
    eng.ingest({
      eventId: 'e1',
      timestamp: Date.now(),
      empireId: 'emp-1',
      playerId: 'p1',
      eventType: 'SESSION_START',
      payload: {},
      sequence: 1,
      checksum: 'abc',
    });
    const snap = eng.materializeSnapshot('emp-1', '2026-08-13');
    expect(snap.empireId).toBe('emp-1');
    expect(snap.lastEventSeq).toBe(1);
  });
});
