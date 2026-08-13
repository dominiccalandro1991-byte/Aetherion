export type UUID = string;
export type Timestamp = number;

export interface ActorRef {
  kind: 'Player' | 'SystemComponent' | 'EnforcementAgent' | 'AIAgent' | 'AmendmentAuthority';
  id: UUID;
  keyId?: string;
}

export interface HLC {
  physical: number;
  logical: number;
  nodeId: string;
}

export enum Severity {
  Minor = 'Minor',
  Major = 'Major',
  Critical = 'Critical',
  Existential = 'Existential',
}

export interface MetricsSnapshot {
  timestamp: Timestamp;
  values: Record<string, number>;
  labels?: Record<string, string>;
}

export interface AlertEvent {
  alertId: UUID;
  timestamp: Timestamp;
  source: string;
  severity: 'Yellow' | 'Red' | 'Critical';
  metricName: string;
  metricValue: number;
  thresholdBreached: number;
  recommendedAction?: string;
  context?: Record<string, unknown>;
}
