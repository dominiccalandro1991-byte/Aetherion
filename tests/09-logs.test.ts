import { describe, it, expect } from 'vitest';
import { ConcurrentActivityLog } from '../src/foundation/09-concurrent-activity-logs.js';

describe('09 Concurrent Activity Logs', () => {
  it('appends and verifies chain', () => {
    const log = new ConcurrentActivityLog();
    const corr = crypto.randomUUID();
    log.append('faction:f1', {
      actorId: 'player-1',
      actorType: 'HumanPlayer',
      activityType: 'AGENT_ACTION',
      outcome: 'SUCCESS',
      correlationId: corr,
    });
    log.append('faction:f1', {
      actorId: 'player-1',
      actorType: 'HumanPlayer',
      activityType: 'AGENT_ACTION',
      outcome: 'SUCCESS',
      correlationId: corr,
    });
    const v = log.verifyChain('faction:f1');
    expect(v.valid).toBe(true);
  });

  it('retrieves by correlation', () => {
    const log = new ConcurrentActivityLog();
    const corr = crypto.randomUUID();
    log.append('global:system', {
      actorId: 'sys',
      actorType: 'SystemService',
      activityType: 'SYSTEM_TICK',
      outcome: 'SUCCESS',
      correlationId: corr,
    });
    const entries = log.getByCorrelation(corr);
    expect(entries.length).toBe(1);
  });
});
