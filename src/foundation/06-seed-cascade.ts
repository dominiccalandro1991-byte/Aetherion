/**
 * Engine 06 — Seed Cascade
 * Baseline rate ρ₀ = 0.18 S·GC⁻¹·Seed⁻¹, logistic growth, fractional accumulator.
 */

export interface SeedNode {
  id: string;
  S_total: number;
  S_mature: number;
  K: number;
  fractionalAccumulator: number;
  neighbors: Array<{ targetId: string; weight: number }>;
}

export interface SeedCascadeConfig {
  rho0: number;
  tauM: number;
  delta: number;
  Kbase: number;
  epsilon: number;
  maxSeedsPerNode: number;
  rhoMax: number;
}

export const DEFAULT_SEED_CONFIG: SeedCascadeConfig = {
  rho0: 0.18,
  tauM: 3.0,
  delta: 0.35,
  Kbase: 250,
  epsilon: 1e-6,
  maxSeedsPerNode: 1_000_000,
  rhoMax: 2.5,
};

export function effectiveRate(
  rho0: number,
  fitnessMod = 1,
  envMod = 1,
  enforcementMod = 1,
  resourceMod = 1,
  rhoMax = 2.5
): number {
  return Math.min(rhoMax, Math.max(0, rho0 * fitnessMod * envMod * enforcementMod * resourceMod));
}

export function updateSeedCascade(
  node: SeedNode,
  rhoEff: number,
  deltaT = 1.0,
  cfg: SeedCascadeConfig = DEFAULT_SEED_CONFIG
): { localAdded: number; dispersed: number } {
  if (node.S_total >= cfg.maxSeedsPerNode) return { localAdded: 0, dispersed: 0 };
  if (node.S_mature <= 0) return { localAdded: 0, dispersed: 0 };

  const capacityFactor = Math.max(0, 1 - node.S_total / Math.max(node.K, cfg.epsilon));
  const generation = rhoEff * node.S_mature * capacityFactor * deltaT;

  node.fractionalAccumulator += generation;
  const newInteger = Math.floor(node.fractionalAccumulator);
  node.fractionalAccumulator -= newInteger;

  if (newInteger <= 0) return { localAdded: 0, dispersed: 0 };

  const disperseCount = Math.floor(newInteger * cfg.delta);
  const localCount = newInteger - disperseCount;

  node.S_total += localCount;
  // real implementation would age seeds and update S_mature

  return { localAdded: localCount, dispersed: disperseCount };
}
