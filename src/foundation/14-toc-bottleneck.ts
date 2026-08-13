/**
 * Engine 14 — TOC Bottleneck Analysis / Elevation Plans
 * Five focusing steps + Drum-Buffer-Rope.
 */

import type { UUID, Timestamp } from './types.js';

export type ConstraintType =
  | 'ComputationalTickLag'
  | 'GeneticPipelineBacklog'
  | 'SeedCascadePropagation'
  | 'EconomicFlowChokepoint'
  | 'LawEnforcementTransition'
  | 'DataIntegrityTrailGeneration'
  | 'ConcurrentActivityLogPressure'
  | 'PlayerActionQueue'
  | 'CustomExternal';

export type TOCPhase = 'Identify' | 'Exploit' | 'Subordinate' | 'Elevate' | 'Recycle';

export interface ConstraintRecord {
  constraintId: string;
  type: ConstraintType;
  location: string;
  constraintImpactScore: number;
  currentUtilization: number;
  queueDepth: number;
  contributionToT: number;
  detectedAt: Timestamp;
}

export interface ElevationAction {
  actionId: string;
  description: string;
  targetSubsystem: string;
  parameters: Record<string, number | string>;
  expectedTIncrease: number;
  expectedOEIncrease: number;
  priorityScore: number;
  requiresHumanApproval: boolean;
}

export interface ElevationPlan {
  planId: string;
  constraintId: string;
  actions: ElevationAction[];
  createdAt: Timestamp;
  currentPhase: TOCPhase;
  projectedTAfter: number;
  approvalStatus: 'Pending' | 'Approved' | 'Rejected' | 'AutoApplied';
}

export function computeCIS(
  localCapacity: number,
  actualFlow: number,
  contribution: number,
  queuePressure: number
): number {
  if (localCapacity <= 0) return 0;
  return (
    (1 - Math.min(1, localCapacity / Math.max(actualFlow, 1e-9))) *
    contribution *
    (0.6 + 0.4 * queuePressure)
  );
}

export class TOCEngine {
  phase: TOCPhase = 'Identify';
  currentConstraint: ConstraintRecord | null = null;
  consecutiveCycles = 0;
  activePlans: ElevationPlan[] = [];

  identify(
    candidates: Array<{
      type: ConstraintType;
      location: string;
      capacity: number;
      flow: number;
      contribution: number;
      queuePressure: number;
    }>
  ): ConstraintRecord | null {
    let best: ConstraintRecord | null = null;
    for (const c of candidates) {
      const cis = computeCIS(c.capacity, c.flow, c.contribution, c.queuePressure);
      if (cis < 0.05) continue;
      if (!best || cis > best.constraintImpactScore) {
        best = {
          constraintId: crypto.randomUUID(),
          type: c.type,
          location: c.location,
          constraintImpactScore: cis,
          currentUtilization: c.flow / Math.max(c.capacity, 1e-9),
          queueDepth: c.queuePressure,
          contributionToT: c.contribution,
          detectedAt: Date.now(),
        };
      }
    }
    this.currentConstraint = best;
    if (best) {
      this.phase = 'Exploit';
      this.consecutiveCycles = 1;
    }
    return best;
  }

  generateElevationPlan(constraint: ConstraintRecord): ElevationPlan {
    const actions: ElevationAction[] = [];
    if (constraint.type === 'SeedCascadePropagation') {
      actions.push({
        actionId: crypto.randomUUID(),
        description: 'Raise cascade rate cap (respect baseline units)',
        targetSubsystem: 'SeedCascade',
        parameters: { rateMultiplier: 1.15 },
        expectedTIncrease: 0.12,
        expectedOEIncrease: 0.04,
        priorityScore: 3.0,
        requiresHumanApproval: false,
      });
    }
    // additional templates can be added per ConstraintType
    const plan: ElevationPlan = {
      planId: crypto.randomUUID(),
      constraintId: constraint.constraintId,
      actions,
      createdAt: Date.now(),
      currentPhase: 'Elevate',
      projectedTAfter: 1.15,
      approvalStatus: actions.every((a) => a.priorityScore > 4) ? 'AutoApplied' : 'Pending',
    };
    this.activePlans.push(plan);
    this.phase = 'Recycle';
    return plan;
  }

  recycle(): void {
    if (this.consecutiveCycles > 12 || !this.currentConstraint) {
      this.phase = 'Identify';
      this.consecutiveCycles = 0;
      this.currentConstraint = null;
    }
  }
}
