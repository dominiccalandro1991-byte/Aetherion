/**
 * Engine 03 — Independent Review / Peer-Review Scoring Framework (IRPSF)
 */

import type { UUID, Timestamp } from './types.js';

export type ReviewDecision =
  | 'approve'
  | 'approve_with_conditions'
  | 'revise'
  | 'reject'
  | 'escalate';

export type ReviewerType =
  | 'human_moderator'
  | 'specialized_ai'
  | 'community_peer'
  | 'independent_auditor';

export interface IndividualScore {
  dimension: string;
  score: number; // 0–10
  justification: string;
  confidence: number;
  evidenceRefs: string[];
}

export interface ReviewerSubmission {
  submissionId: UUID;
  reviewerId: string;
  reviewerType: ReviewerType;
  scores: IndividualScore[];
  overallRecommendation: ReviewDecision;
  freeText: string;
  submittedAt: Timestamp;
  timeSpentSeconds: number;
  conflictOfInterest: boolean;
  isValid: boolean;
}

export interface ProposedChangePackage {
  pcpId: UUID;
  title: string;
  description: string;
  changeType: string;
  authorId: string;
  payload: Record<string, unknown>;
  supportingEvidence: string[];
  riskSelfAssessment: number;
  submittedAt: Timestamp;
  status: string;
  reviewRound: number;
}

export interface AggregateReviewResult {
  pcpId: UUID;
  reviewRound: number;
  validReviews: ReviewerSubmission[];
  dimensionMeans: Record<string, number>;
  overallScore: number;
  consensus: number;
  finalDecision: ReviewDecision;
  conditions: string[];
  minorityReports: string[];
  decisionRationale: string;
  calculatedAt: Timestamp;
}

export const DIMENSIONS = [
  { name: 'Technical Validity', weight: 0.2 },
  { name: 'Balance Impact', weight: 0.2 },
  { name: 'Economic Stability', weight: 0.15 },
  { name: 'Singularity / Runaway Risk', weight: 0.15 },
  { name: 'Novelty / Prior-Art Distance', weight: 0.1 },
  { name: 'Player Fairness & Retention', weight: 0.1 },
  { name: 'Operational Complexity', weight: 0.1 },
] as const;

const MIN_VALID = 3;
const MIN_CONFIDENCE = 0.4;
const OUTLIER_IQR = 1.5;

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}

export function aggregateReviews(
  reviews: ReviewerSubmission[],
  pcpId: UUID,
  reviewRound: number
): AggregateReviewResult {
  const valid = reviews.filter(
    (r) =>
      r.isValid &&
      !r.conflictOfInterest &&
      r.scores.every((s) => s.confidence >= MIN_CONFIDENCE) &&
      r.scores.length === DIMENSIONS.length
  );

  if (valid.length < MIN_VALID) {
    return {
      pcpId,
      reviewRound,
      validReviews: valid,
      dimensionMeans: {},
      overallScore: 0,
      consensus: 0,
      finalDecision: 'escalate',
      conditions: [],
      minorityReports: ['insufficient_valid_reviews'],
      decisionRationale: 'Fewer than 3 valid independent reviews',
      calculatedAt: Date.now(),
    };
  }

  const dimensionMeans: Record<string, number> = {};
  for (const dim of DIMENSIONS) {
    const scores: number[] = [];
    const weights: number[] = [];
    for (const r of valid) {
      const s = r.scores.find((x) => x.dimension === dim.name);
      if (!s) continue;
      const w =
        s.confidence *
        (r.reviewerType === 'community_peer' ? 0.7 : 1.0);
      scores.push(s.score);
      weights.push(w);
    }
    if (scores.length === 0) {
      dimensionMeans[dim.name] = 0;
      continue;
    }
    const q1 = percentile(scores, 25);
    const q3 = percentile(scores, 75);
    const iqr = q3 - q1;
    const filtered = scores
      .map((s, i) => ({ s, w: weights[i] }))
      .filter(
        ({ s }) =>
          s >= q1 - OUTLIER_IQR * iqr && s <= q3 + OUTLIER_IQR * iqr
      );
    if (filtered.length === 0) {
      dimensionMeans[dim.name] = 0;
    } else {
      const totalW = filtered.reduce((a, x) => a + x.w, 0);
      dimensionMeans[dim.name] =
        filtered.reduce((a, x) => a + x.s * x.w, 0) / totalW;
    }
  }

  const overall = DIMENSIONS.reduce(
    (sum, d) => sum + (dimensionMeans[d.name] ?? 0) * d.weight,
    0
  );

  // Simple consensus proxy
  const allScores = valid.flatMap((r) => r.scores.map((s) => s.score));
  const mean = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  const mad =
    allScores.reduce((a, s) => a + Math.abs(s - mean), 0) / allScores.length;
  const consensus = Math.max(0, 1 - mad / 5);

  let decision: ReviewDecision;
  if (
    overall >= 8.0 &&
    Object.values(dimensionMeans).every((v) => v >= 6.5) &&
    consensus >= 0.7
  ) {
    decision = 'approve';
  } else if (overall >= 7.0 && Math.min(...Object.values(dimensionMeans)) >= 5.0) {
    decision = 'approve_with_conditions';
  } else if (overall >= 5.5) {
    decision = 'revise';
  } else {
    decision = 'reject';
  }

  if ((dimensionMeans['Singularity / Runaway Risk'] ?? 10) < 5.0) {
    decision = 'escalate';
  }

  return {
    pcpId,
    reviewRound,
    validReviews: valid,
    dimensionMeans,
    overallScore: overall,
    consensus,
    finalDecision: decision,
    conditions: [],
    minorityReports: [],
    decisionRationale: `Overall ${overall.toFixed(2)}, consensus ${consensus.toFixed(2)}`,
    calculatedAt: Date.now(),
  };
}
