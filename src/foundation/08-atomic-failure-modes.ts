/**
 * Engine 08 — Atomic Failure Modes (FMEA registry)
 */

export type ActionPriority = 'Critical' | 'High' | 'Medium' | 'Low' | 'Monitor';

export interface AtomicFailureMode {
  id: string;
  name: string;
  primarySubsystem: string;
  severity: number;
  occurrence: number;
  detection: number;
  rpn: number;
  rank: number;
  priority: ActionPriority;
  mitigationStrategy: string;
  detectionAlgorithm: string;
  recoveryProcedure: string;
  linkedItems: string;
}

export const AFM_REGISTRY: AtomicFailureMode[] = [
  {
    id: 'AFM-001',
    name: 'Unbounded Seed Cascade Exponential Overflow',
    primarySubsystem: 'SeedCascade',
    severity: 10,
    occurrence: 3,
    detection: 2,
    rpn: 60,
    rank: 1,
    priority: 'Critical',
    mitigationStrategy: 'Soft throttle + sector quarantine + checkpoint rollback',
    detectionAlgorithm: 'growthRate > baseline * dynamicK && consecutiveTicks > T',
    recoveryProcedure: 'Isolate → throttle to 0.1× → restore last consistent checkpoint',
    linkedItems: '6,7,9,12,13',
  },
  {
    id: 'AFM-002',
    name: 'Genetic Fitness Divergence to Infinity / NaN',
    primarySubsystem: 'GeneticMutation',
    severity: 10,
    occurrence: 2,
    detection: 2,
    rpn: 40,
    rank: 2,
    priority: 'Critical',
    mitigationStrategy: 'Genome quarantine + safe-subspace recompute',
    detectionAlgorithm: 'Any NaN/Inf in fitness vector',
    recoveryProcedure: 'Rollback generation, re-seed from elite archive',
    linkedItems: '4,7,3',
  },
  {
    id: 'AFM-003',
    name: 'Law-Enforcement State-Machine Deadlock',
    primarySubsystem: 'LawEnforcement',
    severity: 9,
    occurrence: 3,
    detection: 2,
    rpn: 54,
    rank: 3,
    priority: 'Critical',
    mitigationStrategy: 'State-machine isolation + forced safe-state',
    detectionAlgorithm: 'Cycle detector + heartbeat timeout',
    recoveryProcedure: 'Force nearest safe state, log full path',
    linkedItems: '5,9,13',
  },
  {
    id: 'AFM-004',
    name: 'Anti-Singularity Safeguard Bypass via Parameter Drift',
    primarySubsystem: 'AntiSingularity',
    severity: 10,
    occurrence: 2,
    detection: 3,
    rpn: 60,
    rank: 4,
    priority: 'Critical',
    mitigationStrategy: 'Immutable control snapshot + automatic rollback',
    detectionAlgorithm: 'Hash mismatch or SPC violation on control parameters',
    recoveryProcedure: 'Restore last verified control set, quarantine subsystems',
    linkedItems: '7,3,12,13',
  },
  {
    id: 'AFM-005',
    name: 'Economic Negative Resource Feedback Loop',
    primarySubsystem: 'EconomicStability',
    severity: 9,
    occurrence: 3,
    detection: 3,
    rpn: 81,
    rank: 5,
    priority: 'Critical',
    mitigationStrategy: 'Economic quarantine + positive floor injection',
    detectionAlgorithm: 'Resource derivative < –threshold for consecutive windows',
    recoveryProcedure: 'Isolate zone, inject stabilizing stimulus',
    linkedItems: '2,4,1,13',
  },
];

export function recomputeRanks(modes: AtomicFailureMode[]): AtomicFailureMode[] {
  const ordered = [...modes].sort((a, b) => {
    if (b.rpn !== a.rpn) return b.rpn - a.rpn;
    if (b.severity !== a.severity) return b.severity - a.severity;
    return a.id.localeCompare(b.id);
  });
  return ordered.map((m, i) => {
    const priority: ActionPriority =
      m.severity >= 9 || m.rpn >= 200
        ? 'Critical'
        : m.rpn >= 100
          ? 'High'
          : m.rpn >= 40
            ? 'Medium'
            : 'Low';
    return { ...m, rank: i + 1, priority, rpn: m.severity * m.occurrence * m.detection };
  });
}

export class FMEARegistry {
  modes: AtomicFailureMode[] = recomputeRanks(AFM_REGISTRY);

  getById(id: string): AtomicFailureMode | undefined {
    return this.modes.find((m) => m.id === id);
  }

  getCritical(): AtomicFailureMode[] {
    return this.modes.filter((m) => m.priority === 'Critical');
  }
}
