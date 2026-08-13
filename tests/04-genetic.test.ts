import { describe, it, expect } from 'vitest';
import {
  computeMutationRate,
  computeFitness,
  mutateGene,
  GeneticPopulation,
  DEFAULT_GENOME_CONFIG,
  type Gene,
} from '../src/foundation/04-genetic-mutation.js';

describe('04 Genetic Mutation', () => {
  it('mutation rate rises under low diversity', () => {
    const rate = computeMutationRate(0.05, DEFAULT_GENOME_CONFIG);
    expect(rate).toBeGreaterThan(DEFAULT_GENOME_CONFIG.mutationRateBase);
  });

  it('mutation rate falls under high diversity', () => {
    const rate = computeMutationRate(0.5, DEFAULT_GENOME_CONFIG);
    expect(rate).toBeLessThan(DEFAULT_GENOME_CONFIG.mutationRateBase);
  });

  it('fitness is clamped to hardCap', () => {
    const f = computeFitness([10, 10, 10, 10, 10, 10], DEFAULT_GENOME_CONFIG);
    expect(f).toBeLessThanOrEqual(DEFAULT_GENOME_CONFIG.hardCap);
  });

  it('mutateGene respects bounds', () => {
    const g: Gene = {
      id: 0,
      type: 'Continuous',
      value: 0.5,
      min: 0,
      max: 1,
      mutationSigma: 0.1,
      label: 'CombatPower',
    };
    const next = mutateGene(g, 1.0, () => 0.5);
    expect(next.value).toBeGreaterThanOrEqual(0);
    expect(next.value).toBeLessThanOrEqual(1);
  });

  it('population evaluates and advances', () => {
    const pop = new GeneticPopulation({ populationSize: 16, eliteCount: 2 });
    // seed a few genomes
    for (let i = 0; i < 8; i++) {
      pop.genomes.push({
        id: crypto.randomUUID(),
        generation: 0,
        genes: [],
        parentIds: [null, null],
        fitness: 0,
        rawScores: [],
        age: 0,
        lineageHash: i,
        lastEvaluatedAt: 0,
        isElite: false,
        isInvalid: false,
      });
    }
    pop.evaluateAll(() => [0.7, 0.6, 0.5, 0.4, 0.3, 0.2]);
    expect(pop.meanFitness).toBeGreaterThan(0);
    pop.nextGeneration();
    expect(pop.generation).toBe(1);
    expect(pop.genomes.length).toBe(16);
  });
});

  it('seedInitialPopulation creates base cohort', () => {
    const pop = new GeneticPopulation({ populationSize: 32, eliteCount: 4 });
    pop.seedInitialPopulation(20);
    expect(pop.genomes.length).toBe(20);
    expect(pop.genomes.every((g) => g.genes.length > 0)).toBe(true);
    pop.evaluateAll(() => [0.7, 0.6, 0.5, 0.4, 0.3, 0.2]);
    expect(pop.meanFitness).toBeGreaterThan(0);
    pop.nextGeneration();
    expect(pop.generation).toBe(1);
    expect(pop.genomes.length).toBe(32);
  });

  it('step auto-seeds when empty', () => {
    const pop = new GeneticPopulation({ populationSize: 16, eliteCount: 2 });
    expect(pop.genomes.length).toBe(0);
    pop.step(() => [0.6, 0.5, 0.5, 0.5, 0.4, 0.3]);
    expect(pop.genomes.length).toBe(16);
    expect(pop.generation).toBe(1);
    expect(pop.meanFitness).toBeGreaterThanOrEqual(0);
  });

  it('injectFromSeeds respects population cap', () => {
    const pop = new GeneticPopulation({ populationSize: 10, eliteCount: 2 });
    pop.seedInitialPopulation(8);
    const added = pop.injectFromSeeds(5);
    expect(added).toBe(2);
    expect(pop.genomes.length).toBe(10);
  });
