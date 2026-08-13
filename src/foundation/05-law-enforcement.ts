/**
 * Engine 05 — Law-Enforcement Hierarchy / State Machine
 */

import type { UUID, Timestamp, Severity } from './types.js';

export enum Rank {
  SENTINEL = 1,
  WARDEN = 2,
  MARSHAL = 3,
  OVERSEER = 4,
  JUSTICAR = 5,
  SUPREME_ARBITER = 6,
}

export type EnforcementState =
  | 'DORMANT'
  | 'ACTIVE_PATROL'
  | 'ALERT'
  | 'INVESTIGATION'
  | 'WARRANT_PENDING'
  | 'PURSUIT'
  | 'CONFRONTATION'
  | 'CONTAINMENT'
  | 'ADJUDICATION'
  | 'SANCTION_ENFORCEMENT'
  | 'ESCALATION_PENDING'
  | 'RESOLVED'
  | 'FAILED_ENFORCEMENT'
  | 'APPEAL_HOLD';

export type ViolationType =
  | 'EconomicSabotage'
  | 'UnauthorizedMutation'
  | 'SeedCascadeBreach'
  | 'SingularityPrecursor'
  | 'JurisdictionViolation'
  | 'ResourceTheft'
  | 'OrderCollapse';

export interface Case {
  caseId: UUID;
  suspects: string[];
  violation: ViolationType;
  severity: Severity;
  evidenceScore: number;
  threatScore: number;
  economicImpactScore: number;
  mutationRiskScore: number;
  handlerRank: Rank;
  stateHistory: Array<{ state: EnforcementState; ts: Timestamp; actor: string }>;
  lockedBy: Rank | null;
}

export interface EnforcementUnit {
  unitId: UUID;
  rank: Rank;
  jurisdiction: string;
  state: EnforcementState;
  activeCases: UUID[];
  forceBudget: number;
  lastTransitionTs: Timestamp;
}

export function computeThreatScore(
  hostility: number,
  capability: number,
  intent: number
): number {
  return Math.min(1, Math.max(0, 0.4 * hostility + 0.3 * capability + 0.3 * intent));
}

export function canTransition(
  unit: EnforcementUnit,
  event: string,
  caseObj?: Case
): { ok: boolean; next?: EnforcementState; reason?: string } {
  const s = unit.state;
  if (event === 'ApexOverride' && unit.rank === Rank.SUPREME_ARBITER) {
    return { ok: true, next: 'RESOLVED' };
  }
  if (s === 'DORMANT' && event === 'PatrolOrder') return { ok: true, next: 'ACTIVE_PATROL' };
  if (s === 'ACTIVE_PATROL' && event === 'SuspiciousSignal' && (caseObj?.threatScore ?? 0) >= 0.25)
    return { ok: true, next: 'ALERT' };
  if (s === 'ALERT' && event === 'EvidenceThresholdReached' && (caseObj?.evidenceScore ?? 0) >= 0.4)
    return { ok: true, next: 'INVESTIGATION' };
  if (s === 'INVESTIGATION' && event === 'SeverityUpgrade') return { ok: true, next: 'WARRANT_PENDING' };
  if (s === 'PURSUIT' && event === 'SuspectLocated') return { ok: true, next: 'CONFRONTATION' };
  if (s === 'CONFRONTATION' && event === 'ComplianceAchieved') return { ok: true, next: 'CONTAINMENT' };
  if (s === 'FAILED_ENFORCEMENT' && event === 'AutoEscalate') return { ok: true, next: 'ESCALATION_PENDING' };
  return { ok: false, reason: `No valid transition from ${s} on ${event}` };
}

export class LawEnforcementEngine {
  units = new Map<UUID, EnforcementUnit>();
  cases = new Map<UUID, Case>();

  registerUnit(u: EnforcementUnit): void {
    this.units.set(u.unitId, u);
  }

  openCase(c: Case): void {
    this.cases.set(c.caseId, c);
  }

  attemptTransition(
    unitId: UUID,
    event: string,
    caseId?: UUID
  ): { success: boolean; newState?: EnforcementState; message: string } {
    const unit = this.units.get(unitId);
    if (!unit) return { success: false, message: 'Unit not found' };
    const c = caseId ? this.cases.get(caseId) : undefined;
    const result = canTransition(unit, event, c);
    if (!result.ok || !result.next) {
      return { success: false, message: result.reason ?? 'Rejected' };
    }
    unit.state = result.next;
    unit.lastTransitionTs = Date.now();
    if (c) {
      c.stateHistory.push({ state: result.next, ts: Date.now(), actor: unitId });
    }
    return { success: true, newState: result.next, message: 'Transition applied' };
  }
}
