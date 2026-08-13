import { describe, it, expect, afterEach } from 'vitest';
import { AetherionRuntime } from '../src/core/orchestrator.js';

describe('AetherionRuntime Orchestrator', () => {
  let runtime: AetherionRuntime;

  afterEach(() => {
    runtime?.stop();
  });

  it('starts in idle and advances ticks', () => {
    runtime = new AetherionRuntime();
    expect(runtime.getState().status).toBe('idle');
    runtime.tick();
    runtime.tick();
    const state = runtime.getState();
    expect(state.tick).toBe(2);
    expect(state.seedTotal).toBeGreaterThan(0);
    expect(runtime.genetics.genomes.length).toBeGreaterThan(0);
    expect(runtime.genetics.meanFitness).toBeGreaterThan(0);
  });

  it('start / pause / stop lifecycle', () => {
    runtime = new AetherionRuntime();
    runtime.start(50);
    expect(runtime.getState().status).toBe('running');
    runtime.pause();
    expect(runtime.getState().status).toBe('paused');
    runtime.stop();
    expect(runtime.getState().status).toBe('stopped');
  });

  it('emits metrics and trails across engines', () => {
    runtime = new AetherionRuntime();
    for (let i = 0; i < 5; i++) runtime.tick();
    const state = runtime.getState();
    expect(state.tick).toBe(5);
    expect(state.aggregateCSS).toBeGreaterThan(0);
    expect(runtime.trails.getChain('System').length).toBeGreaterThan(0);
  });
});
