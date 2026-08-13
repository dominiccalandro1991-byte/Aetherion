/**
 * Aetherion Foundation Engines — Public Registry
 * All 14 systems are exported from this barrel.
 */

export * from './types.js';
export * from './01-retention-proxies.js';
export * from './02-economic-stability.js';
export * from './03-peer-review.js';
export * from './04-genetic-mutation.js';
export * from './05-law-enforcement.js';
export * from './06-seed-cascade.js';
export * from './07-anti-singularity.js';
export * from './08-atomic-failure-modes.js';
export * from './09-concurrent-activity-logs.js';
export * from './10-prior-art.js';
export * from './11-alcoa-trails.js';
export * from './12-server-metrics.js';
export * from './13-industrial-controls.js';
export * from './14-toc-bottleneck.js';

/** Convenience registry of engine names for discovery */
export const FOUNDATION_ENGINES = [
  'RetentionProxies',
  'EconomicStability',
  'PeerReview',
  'GeneticMutation',
  'LawEnforcement',
  'SeedCascade',
  'AntiSingularity',
  'AtomicFailureModes',
  'ConcurrentActivityLogs',
  'PriorArtConfirmation',
  'ALCOATrails',
  'ServerMetrics',
  'IndustrialControls',
  'TOCBottleneck',
] as const;

export type FoundationEngineName = (typeof FOUNDATION_ENGINES)[number];
