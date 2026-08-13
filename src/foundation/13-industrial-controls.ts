/**
 * Engine 13 — Industrial Control Layers (Poka-Yoke, Andon, SPC)
 */

import type { UUID, Timestamp } from './types.js';

export type AndonSeverity = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'CRITICAL';

export interface AndonEvent {
  eventId: UUID;
  timestamp: Timestamp;
  severity: AndonSeverity;
  sourceSubsystem: string;
  signalCode: string;
  description: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'ESCALATED';
  linkedLogEntries: string[];
}

export interface PokaYokeResult {
  ruleId: string;
  isValid: boolean;
  reasonCode: string;
  severity: 'BLOCK' | 'WARN_AND_LOG' | 'CORRECT_AND_PROCEED';
}

export function seedCascadeRateGuard(
  proposedRate: number,
  baselineRate: number,
  maxDeviation = 0.15
): PokaYokeResult {
  if (proposedRate > baselineRate * (1 + maxDeviation)) {
    return {
      ruleId: 'SeedCascadeRateGuard',
      isValid: false,
      reasonCode: 'RATE_EXCEEDS_MAX_DEVIATION',
      severity: 'BLOCK',
    };
  }
  return {
    ruleId: 'SeedCascadeRateGuard',
    isValid: true,
    reasonCode: 'OK',
    severity: 'CORRECT_AND_PROCEED',
  };
}

/** Simplified XmR control limits */
export function computeXmRLimits(values: number[]): {
  centerline: number;
  ucl: number;
  lcl: number;
} {
  if (values.length < 2) return { centerline: 0, ucl: 0, lcl: 0 };
  const centerline = values.reduce((a, b) => a + b, 0) / values.length;
  const mrs: number[] = [];
  for (let i = 1; i < values.length; i++) {
    mrs.push(Math.abs(values[i] - values[i - 1]));
  }
  const avgMR = mrs.reduce((a, b) => a + b, 0) / mrs.length;
  const ucl = centerline + 2.66 * avgMR;
  const lcl = Math.max(0, centerline - 2.66 * avgMR);
  return { centerline, ucl, lcl };
}

export function checkWesternElectric(
  points: number[],
  centerline: number,
  ucl: number,
  lcl: number
): string[] {
  const rules: string[] = [];
  if (points.length === 0) return rules;
  const last = points[points.length - 1];
  if (last > ucl || last < lcl) rules.push('Rule1_Beyond3Sigma');
  // Rule 4 simplified: 8 consecutive same side
  if (points.length >= 8) {
    const last8 = points.slice(-8);
    if (last8.every((p) => p > centerline) || last8.every((p) => p < centerline)) {
      rules.push('Rule4_EightSameSide');
    }
  }
  return rules;
}

export class IndustrialControlSystem {
  andonEvents: AndonEvent[] = [];

  raiseAndon(
    severity: AndonSeverity,
    sourceSubsystem: string,
    signalCode: string,
    description: string
  ): AndonEvent {
    const evt: AndonEvent = {
      eventId: crypto.randomUUID(),
      timestamp: Date.now(),
      severity,
      sourceSubsystem,
      signalCode,
      description,
      status: 'OPEN',
      linkedLogEntries: [],
    };
    this.andonEvents.push(evt);
    return evt;
  }

  evaluateGuards(
    subsystem: string,
    context: Record<string, number>
  ): PokaYokeResult[] {
    const results: PokaYokeResult[] = [];
    if (subsystem === 'SEED_CASCADE' && context.proposedRate !== undefined) {
      results.push(
        seedCascadeRateGuard(context.proposedRate, context.baselineRate ?? 0.18)
      );
    }
    return results;
  }
}
