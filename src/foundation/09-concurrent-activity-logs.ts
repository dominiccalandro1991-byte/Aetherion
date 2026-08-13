/**
 * Engine 09 — Concurrent Activity Logs
 * Append-only, hash-chained, HLC-ordered partitions.
 */

import { createHash } from 'crypto';
import type { UUID, Timestamp, HLC } from './types.js';

export type ActorType =
  | 'HumanPlayer'
  | 'AIAgent'
  | 'SystemService'
  | 'MutationEngine'
  | 'LawEnforcer'
  | 'CascadeController'
  | 'EconomicAgent'
  | 'Other';

export type Outcome =
  | 'SUCCESS'
  | 'FAILURE'
  | 'PARTIAL'
  | 'PENDING'
  | 'REVERTED'
  | 'ABORTED';

export interface ActivityLogEntry {
  schemaVersion: string;
  logId: UUID;
  partitionKey: string;
  sequenceNumber: number;
  hlc: HLC;
  actorId: string;
  actorType: ActorType;
  activityType: string;
  activitySubtype: string | null;
  targetIds: string[];
  parameters: Record<string, unknown>;
  outcome: Outcome;
  correlationId: UUID;
  causationId: UUID | null;
  previousHash: string;
  entryHash: string;
  signature: string | null;
  retentionClass: 'CRITICAL' | 'STANDARD' | 'DEBUG';
  metadata: Record<string, string>;
}

const GENESIS_HASH = '0'.repeat(64);

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function canonicalJson(obj: Record<string, unknown>): string {
  // Minimal RFC 8785-style: sorted keys, no whitespace
  return JSON.stringify(obj, Object.keys(obj).sort());
}

export function computeEntryHash(
  entry: Omit<ActivityLogEntry, 'entryHash' | 'signature' | 'metadata'>,
  previousHash: string
): string {
  const payload = { ...entry, previousHash };
  return sha256(previousHash + canonicalJson(payload as any));
}

export class ConcurrentActivityLog {
  private partitions = new Map<string, ActivityLogEntry[]>();
  private lastHlc: HLC = { physical: 0, logical: 0, nodeId: 'aetherion-0' };

  private advanceHlc(now: number): HLC {
    if (now > this.lastHlc.physical) {
      this.lastHlc = { physical: now, logical: 0, nodeId: this.lastHlc.nodeId };
    } else {
      this.lastHlc = {
        physical: this.lastHlc.physical,
        logical: this.lastHlc.logical + 1,
        nodeId: this.lastHlc.nodeId,
      };
    }
    return { ...this.lastHlc };
  }

  append(
    partitionKey: string,
    partial: {
      actorId: string;
      actorType: ActorType;
      activityType: string;
      activitySubtype?: string | null;
      targetIds?: string[];
      parameters?: Record<string, unknown>;
      outcome: Outcome;
      correlationId: UUID;
      causationId?: UUID | null;
      retentionClass?: 'CRITICAL' | 'STANDARD' | 'DEBUG';
    }
  ): ActivityLogEntry {
    const list = this.partitions.get(partitionKey) ?? [];
    const last = list[list.length - 1];
    const seq = last ? last.sequenceNumber + 1 : 1;
    const hlc = this.advanceHlc(Date.now());
    const previousHash = last ? last.entryHash : GENESIS_HASH;

    const base = {
      schemaVersion: '1.0.0',
      logId: crypto.randomUUID(),
      partitionKey,
      sequenceNumber: seq,
      hlc,
      actorId: partial.actorId,
      actorType: partial.actorType,
      activityType: partial.activityType,
      activitySubtype: partial.activitySubtype ?? null,
      targetIds: partial.targetIds ?? [],
      parameters: partial.parameters ?? {},
      outcome: partial.outcome,
      correlationId: partial.correlationId,
      causationId: partial.causationId ?? null,
      previousHash,
      retentionClass: partial.retentionClass ?? 'STANDARD',
    };

    const entryHash = computeEntryHash(base, previousHash);
    const entry: ActivityLogEntry = {
      ...base,
      entryHash,
      signature: null,
      metadata: {},
    };
    list.push(entry);
    this.partitions.set(partitionKey, list);
    return entry;
  }

  verifyChain(partitionKey: string): { valid: boolean; firstBadSeq?: number } {
    const list = this.partitions.get(partitionKey) ?? [];
    let prev = GENESIS_HASH;
    for (const e of list) {
      if (e.previousHash !== prev) return { valid: false, firstBadSeq: e.sequenceNumber };
      const recomputed = computeEntryHash(
        {
          schemaVersion: e.schemaVersion,
          logId: e.logId,
          partitionKey: e.partitionKey,
          sequenceNumber: e.sequenceNumber,
          hlc: e.hlc,
          actorId: e.actorId,
          actorType: e.actorType,
          activityType: e.activityType,
          activitySubtype: e.activitySubtype,
          targetIds: e.targetIds,
          parameters: e.parameters,
          outcome: e.outcome,
          correlationId: e.correlationId,
          causationId: e.causationId,
          previousHash: e.previousHash,
          retentionClass: e.retentionClass,
        },
        e.previousHash
      );
      if (recomputed !== e.entryHash) return { valid: false, firstBadSeq: e.sequenceNumber };
      prev = e.entryHash;
    }
    return { valid: true };
  }

  getByCorrelation(correlationId: UUID): ActivityLogEntry[] {
    const result: ActivityLogEntry[] = [];
    for (const list of this.partitions.values()) {
      for (const e of list) {
        if (e.correlationId === correlationId) result.push(e);
      }
    }
    return result.sort((a, b) => a.hlc.physical - b.hlc.physical || a.hlc.logical - b.hlc.logical);
  }
}
