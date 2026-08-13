/**
 * Engine 04 — Genetic Mutation / Fitness Function
 * Complete genome, adaptive mutation rate, SBX crossover, multi-component fitness.
 */

import type { UUID, Timestamp } from './types.js';

export type GeneType = 'Continuous' | 'Discrete' | 'Threshold';

export interface Gene {
  id: number;
  type: GeneType;
  value: number;
  min: number;
  max: number;
  mutationSigma: number;
  label: string;
}

export interface Genome {
  id: UUID;
  generation: number;
  genes: Gene[];
  parentIds: [UUID | null, UUID | null];
  fitness: number;
  rawScores: number[];
  age: number;
  lineageHash: number;
  lastEvaluatedAt: Timestamp;
  isElite: boolean;
  isInvalid: boolean;
}

export interface GenomeConfig {
  chromosomeLength: number;
  continuousGeneCount: number;
  discreteGeneCount: number;
  populationSize: number;
  eliteCount: number;
  tournamentSize: number;
  crossoverRate: number;
  mutationRateBase: number;
  mutationRateMin: number;
  mutationRateMax: number;
  diversityTarget: number;
  fitnessWeights: number[];
  softCap: number;
  hardCap: number;
}

export const DEFAULT_GENOME_CONFIG: GenomeConfig = {
  chromosomeLength: 48,
  continuousGeneCount: 36,
  discreteGeneCount: 12,
  populationSize: 128,
  eliteCount: 8,
  tournamentSize: 3,
  crossoverRate: 0.85,
  mutationRateBase: 0.04,
  mutationRateMin: 0.008,
  mutationRateMax: 0.12,
  diversityTarget: 0.22,
  fitnessWeights: [0.28, 0.22, 0.18, 0.15, 0.1, 0.07],
  softCap: 1.0,
  hardCap: 1.35,
};

export function computeMutationRate(
  geneVariance: number,
  cfg: GenomeConfig
): number {
  let rate = cfg.mutationRateBase;
  if (geneVariance < cfg.diversityTarget * 0.6) rate *= 1.8;
  else if (geneVariance > cfg.diversityTarget * 1.4) rate *= 0.55;
  return Math.min(cfg.mutationRateMax, Math.max(cfg.mutationRateMin, rate));
}

export function mutateGene(g: Gene, rate: number, rng: () => number): Gene {
  if (rng() > rate) return { ...g };
  const next = { ...g };
  if (g.type === 'Continuous' || g.type === 'Threshold') {
    // Box-Muller approx for normal
    const u1 = Math.max(1e-12, rng());
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    next.value = Math.min(g.max, Math.max(g.min, g.value + z * g.mutationSigma));
  } else {
    if (rng() < 0.7) {
      const dir = rng() < 0.5 ? 1 : -1;
      next.value =
        ((Math.round(g.value) + dir) % (g.max + 1) + (g.max + 1)) % (g.max + 1);
    } else {
      next.value = Math.floor(rng() * (g.max - g.min + 1)) + g.min;
    }
  }
  return next;
}

export function computeFitness(
  rawScores: number[],
  cfg: GenomeConfig
): number {
  let f = 0;
  for (let i = 0; i < Math.min(rawScores.length, cfg.fitnessWeights.length); i++) {
    f += cfg.fitnessWeights[i] * rawScores[i];
  }
  // soft tanh saturation then hard clamp
  const soft = cfg.softCap * Math.tanh(f / cfg.softCap);
  return Math.min(cfg.hardCap, Math.max(0, soft));
}

export class GeneticPopulation {
  genomes: Genome[] = [];
  generation = 0;
  meanFitness = 0;
  geneVariance = 0;
  config: GenomeConfig;

  constructor(config: Partial<GenomeConfig> = {}) {
    this.config = { ...DEFAULT_GENOME_CONFIG, ...config };
  }

  evaluateAll(telemetryFn: (g: Genome) => number[]): void {
    for (const g of this.genomes) {
      if (g.isInvalid) {
        g.fitness = 0;
        continue;
      }
      g.rawScores = telemetryFn(g);
      g.fitness = computeFitness(g.rawScores, this.config);
      g.lastEvaluatedAt = Date.now();
    }
    this.recomputeStats();
  }

  private recomputeStats(): void {
    if (this.genomes.length === 0) return;
    this.meanFitness =
      this.genomes.reduce((s, g) => s + g.fitness, 0) / this.genomes.length;
    // simple variance proxy on continuous genes
    let varSum = 0;
    let count = 0;
    for (const g of this.genomes) {
      for (const gene of g.genes) {
        if (gene.type === 'Continuous') {
          varSum += (gene.value - 0.5) ** 2;
          count++;
        }
      }
    }
    this.geneVariance = count ? varSum / count : 0;
  }

  nextGeneration(rng: () => number = Math.random): void {
    if (this.genomes.length === 0) {
      this.seedInitialPopulation(Math.min(20, this.config.populationSize), rng);
    }
    this.genomes.sort((a, b) => b.fitness - a.fitness);
    const next: Genome[] = [];
    for (let i = 0; i < this.config.eliteCount && i < this.genomes.length; i++) {
      const elite = { ...this.genomes[i], isElite: true, age: this.genomes[i].age + 1 };
      next.push(elite);
    }
    const rate = computeMutationRate(this.geneVariance, this.config);
    while (next.length < this.config.populationSize) {
      const p1 = this.tournamentSelect(rng);
      const p2 = this.tournamentSelect(rng);
      // simplified crossover + mutation
      const childGenes = p1.genes.map((g, i) => {
        const from = rng() < 0.5 ? g : p2.genes[i];
        return mutateGene(from, rate, rng);
      });
      next.push({
        id: crypto.randomUUID(),
        generation: this.generation + 1,
        genes: childGenes,
        parentIds: [p1.id, p2.id],
        fitness: 0,
        rawScores: [],
        age: 0,
        lineageHash: (p1.lineageHash ^ p2.lineageHash) >>> 0,
        lastEvaluatedAt: 0,
        isElite: false,
        isInvalid: false,
      });
    }
    this.genomes = next;
    this.generation++;
  }


  /** Create a randomized gene set for a new organism */
  createRandomGenome(generation = 0, rng: () => number = Math.random): Genome {
    const genes: Gene[] = [];
    const labels = [
      'CombatPower', 'Resilience', 'TradeAffinity', 'CascadeBias',
      'ResourceEfficiency', 'Loyalty', 'ExplorationDrive', 'MutationTolerance',
    ];
    for (let i = 0; i < this.config.chromosomeLength; i++) {
      const isDiscrete = i >= this.config.continuousGeneCount;
      genes.push({
        id: i,
        type: isDiscrete ? 'Discrete' : 'Continuous',
        value: isDiscrete
          ? Math.floor(rng() * 5)
          : Math.min(1, Math.max(0, 0.35 + rng() * 0.4)),
        min: 0,
        max: isDiscrete ? 4 : 1,
        mutationSigma: isDiscrete ? 0.5 : 0.08,
        label: labels[i % labels.length] + (i >= labels.length ? `_${i}` : ''),
      });
    }
    return {
      id: crypto.randomUUID(),
      generation,
      genes,
      parentIds: [null, null],
      fitness: 0,
      rawScores: [],
      age: 0,
      lineageHash: Math.floor(rng() * 0xffffffff) >>> 0,
      lastEvaluatedAt: 0,
      isElite: false,
      isInvalid: false,
    };
  }

  /** Populate with N base organisms (Generation 1 baseline after first evaluation) */
  seedInitialPopulation(count = 20, rng: () => number = Math.random): void {
    const n = Math.max(1, Math.min(count, this.config.populationSize));
    this.genomes = [];
    this.generation = 0;
    this.meanFitness = 0;
    this.geneVariance = 0;
    for (let i = 0; i < n; i++) {
      this.genomes.push(this.createRandomGenome(0, rng));
    }
  }

  /** Spawn genomes from cascade mature seeds (capped by populationSize) */
  injectFromSeeds(seedCount: number, rng: () => number = Math.random): number {
    if (seedCount <= 0) return 0;
    let added = 0;
    const room = this.config.populationSize - this.genomes.length;
    const toAdd = Math.min(seedCount, Math.max(0, room));
    for (let i = 0; i < toAdd; i++) {
      this.genomes.push(this.createRandomGenome(this.generation, rng));
      added++;
    }
    return added;
  }

  /**
   * Full generational step: evaluate fitness, then advance population.
   * Safe when empty — auto-seeds a minimal cohort first.
   */
  step(
    telemetryFn: (g: Genome) => number[] = () => [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    rng: () => number = Math.random
  ): void {
    if (this.genomes.length === 0) {
      this.seedInitialPopulation(Math.min(20, this.config.populationSize), rng);
    }
    this.evaluateAll(telemetryFn);
    this.nextGeneration(rng);
  }

  private tournamentSelect(rng: () => number): Genome {
    let best: Genome | null = null;
    for (let i = 0; i < this.config.tournamentSize; i++) {
      const c = this.genomes[Math.floor(rng() * this.genomes.length)];
      if (!best || c.fitness > best.fitness) best = c;
    }
    return best!;
  }
}
