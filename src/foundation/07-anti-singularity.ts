/**
 * Engine 07 — Anti-Singularity Safeguards (TRIZ 1 + 35)
 */

import type { UUID } from './types.js';

export type ContainmentState =
  | 'Normal'
  | 'Watch'
  | 'Segmented'
  | 'ParameterLocked'
  | 'ForcedCooling'
  | 'Quarantined';

export interface MonitoredGrowthObject {
  objectId: UUID;
  type: 'SeedCascade' | 'Lineage' | 'Empire' | 'Faction';
  currentFitness: number;
  cascadeRate: number;
  resourceShare: number;
  giniConcentration: number;
  cascadeDepth: number;
  cascadeBreadth: number;
  sri: number;
  state: ContainmentState;
  interventionCount: number;
}

export interface ParameterModulationEnvelope {
  growthRateMultiplier: number;
  mutationFlexibility: number;
  cascadeBranchingFactor: number;
  resourceConcentrationCap: number;
  temperature: number;
  durationTicks: number;
  reasonCode: string;
}

export function computeSRI(obj: {
  resourceShare: number;
  sectorFairShare: number;
  currentFitness: number;
  sectorMedianFitness: number;
  cascadeRate: number;
  baselineCascadeRate: number;
  cascadeDepth: number;
  cascadeBreadth: number;
}): number {
  const G = Math.min(1, obj.resourceShare / (obj.sectorFairShare * 3));
  const F = 1 / (1 + Math.exp(-4 * (obj.currentFitness - obj.sectorMedianFitness)));
  const C = Math.min(1, obj.cascadeRate / (obj.baselineCascadeRate * 4));
  const D = Math.min(1, obj.cascadeDepth / 12);
  const B = Math.min(1, obj.cascadeBreadth / 40);
  return 0.3 * G + 0.25 * F + 0.25 * C + 0.1 * D + 0.1 * B;
}

export function decideIntervention(sri: number): {
  state: ContainmentState;
  envelope?: ParameterModulationEnvelope;
} {
  if (sri < 0.45) return { state: 'Normal' };
  if (sri < 0.65) return { state: 'Watch' };
  if (sri < 0.8) {
    const t = (sri - 0.65) / 0.15;
    return {
      state: 'ParameterLocked',
      envelope: {
        growthRateMultiplier: 1 - 0.6 * t,
        mutationFlexibility: 1 - 0.7 * t,
        cascadeBranchingFactor: 1 - 0.5 * t,
        resourceConcentrationCap: 0.4,
        temperature: 1 - 0.5 * t,
        durationTicks: Math.round(120 + 360 * t),
        reasonCode: `PARAM_SOFT_${sri.toFixed(2)}`,
      },
    };
  }
  if (sri < 0.92) return { state: 'Segmented' };
  return {
    state: 'ForcedCooling',
    envelope: {
      growthRateMultiplier: 0.08,
      mutationFlexibility: 0.05,
      cascadeBranchingFactor: 0.1,
      resourceConcentrationCap: 0.15,
      temperature: 0.15,
      durationTicks: 300,
      reasonCode: 'FORCED_COOLING',
    },
  };
}

export class AntiSingularityEngine {
  objects = new Map<UUID, MonitoredGrowthObject>();

  update(obj: MonitoredGrowthObject, baselineCascadeRate = 0.18): void {
    const sri = computeSRI({
      resourceShare: obj.resourceShare,
      sectorFairShare: 1 / 20,
      currentFitness: obj.currentFitness,
      sectorMedianFitness: 0.5,
      cascadeRate: obj.cascadeRate,
      baselineCascadeRate,
      cascadeDepth: obj.cascadeDepth,
      cascadeBreadth: obj.cascadeBreadth,
    });
    obj.sri = sri;
    const decision = decideIntervention(sri);
    obj.state = decision.state;
    this.objects.set(obj.objectId, obj);
  }
}
