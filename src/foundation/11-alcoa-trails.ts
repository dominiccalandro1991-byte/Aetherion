/**
 * Engine 11 — ALCOA+ Audit Trails
 */

import { createHash } from 'crypto';
import type { UUID, Timestamp, ActorRef, HLC } from './types.js';

export type TrailDomain =
  | 'Genetic'
  | 'Economic'
  | 'Cascade'
  | 'Enforcement'
  | 'System'
  | 'Singularity';

export interface TrailEntry {
  trailId: UUID;
  domain: TrailDomain;
  sequence: number;
  previousHash: string;
  hlc: HLC;
  actor: ActorRef;
  eventType: string;
  payloadHash: string;
  signature: string | null;
  schemaVersion: number;
  metadata: Record<string, string>;
}

const ZERO_HASH = '0'.repeat(64);

export class ALCOATrailStore {
  private chains = new Map<TrailDomain, TrailEntry[]>();
  private lastHlc: HLC = { physical: 0, logical: 0, nodeId: 'aetherion-trail' };

  private advanceHlc(now: number): HLC {
    if (now > this.lastHlc.physical) {
      this.lastHlc = { physical: now, logical: 0, nodeId: this.lastHlc.nodeId };
    } else {
      this.lastHlc.logical += 1;
    }
    return { ...this.lastHlc };
  }

  record(
    domain: TrailDomain,
    actor: ActorRef,
    eventType: string,
    payload: unknown
  ): TrailEntry {
    const list = this.chains.get(domain) ?? [];
    const last = list[list.length - 1];
    const previousHash = last ? last.payloadHash : ZERO_HASH; // simplified
    const payloadBytes = JSON.stringify(payload);
    const payloadHash = createHash('sha256').update(payloadBytes).digest('hex');
    const hlc = this.advanceHlc(Date.now());

    const entry: TrailEntry = {
      trailId: crypto.randomUUID(),
      domain,
      sequence: last ? last.sequence + 1 : 1,
      previousHash,
      hlc,
      actor,
      eventType,
      payloadHash,
      signature: null,
      schemaVersion: 1,
      metadata: {},
    };
    list.push(entry);
    this.chains.set(domain, list);
    return entry;
  }

  verifyDomain(domain: TrailDomain): boolean {
    const list = this.chains.get(domain) ?? [];
    let prev = ZERO_HASH;
    for (const e of list) {
      if (e.previousHash !== prev && e.sequence > 1) return false;
      prev = e.payloadHash;
    }
    return true;
  }

  getChain(domain: TrailDomain): TrailEntry[] {
    return this.chains.get(domain) ?? [];
  }
}
