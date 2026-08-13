import { describe, it, expect } from 'vitest';
import { TOCEngine, computeCIS } from '../src/foundation/14-toc-bottleneck.js';

describe('14 TOC Bottleneck', () => {
  it('CIS is zero when capacity covers flow', () => {
    const cis = computeCIS(100, 50, 0.5, 0.2);
    expect(cis).toBeLessThan(0.3);
  });

  it('identifies highest impact constraint', () => {
    const toc = new TOCEngine();
    const c = toc.identify([
      {
        type: 'SeedCascadePropagation',
        location: 'alpha',
        capacity: 50,
        flow: 200,
        contribution: 0.6,
        queuePressure: 0.9,
      },
      {
        type: 'PlayerActionQueue',
        location: 'gate',
        capacity: 1000,
        flow: 100,
        contribution: 0.1,
        queuePressure: 0.1,
      },
    ]);
    expect(c).not.toBeNull();
    expect(c!.type).toBe('SeedCascadePropagation');
    expect(toc.phase).toBe('Exploit');
  });

  it('generates elevation plan', () => {
    const toc = new TOCEngine();
    const c = toc.identify([
      {
        type: 'SeedCascadePropagation',
        location: 'alpha',
        capacity: 10,
        flow: 100,
        contribution: 0.8,
        queuePressure: 1,
      },
    ]);
    expect(c).not.toBeNull();
    const plan = toc.generateElevationPlan(c!);
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.constraintId).toBe(c!.constraintId);
  });
});
