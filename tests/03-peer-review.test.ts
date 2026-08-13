import { describe, it, expect } from 'vitest';
import { aggregateReviews, DIMENSIONS, type ReviewerSubmission } from '../src/foundation/03-peer-review.js';

function makeReview(overrides: Partial<ReviewerSubmission> = {}): ReviewerSubmission {
  return {
    submissionId: crypto.randomUUID(),
    reviewerId: 'r1',
    reviewerType: 'specialized_ai',
    scores: DIMENSIONS.map((d) => ({
      dimension: d.name,
      score: 8.5,
      justification: 'Solid technical and balance assessment for this package.',
      confidence: 0.9,
      evidenceRefs: [],
    })),
    overallRecommendation: 'approve',
    freeText: 'Looks good',
    submittedAt: Date.now(),
    timeSpentSeconds: 120,
    conflictOfInterest: false,
    isValid: true,
    ...overrides,
  };
}

describe('03 Peer Review', () => {
  it('escalates when fewer than 3 valid reviews', () => {
    const result = aggregateReviews([makeReview()], 'pcp-1', 1);
    expect(result.finalDecision).toBe('escalate');
  });

  it('approves high-consensus high-score reviews', () => {
    const reviews = [makeReview(), makeReview({ reviewerId: 'r2' }), makeReview({ reviewerId: 'r3' })];
    const result = aggregateReviews(reviews, 'pcp-2', 1);
    expect(result.finalDecision).toBe('approve');
    expect(result.overallScore).toBeGreaterThanOrEqual(8);
  });

  it('rejects low scores (non-singularity dimensions)', () => {
    const low = makeReview({
      scores: DIMENSIONS.map((d) => ({
        dimension: d.name,
        // Keep singularity risk above the hard-escalation floor of 5.0
        score: d.name === 'Singularity / Runaway Risk' ? 6.0 : 3.0,
        justification: 'Significant concerns across multiple dimensions found here.',
        confidence: 0.9,
        evidenceRefs: [],
      })),
    });
    const reviews = [low, { ...low, reviewerId: 'r2' }, { ...low, reviewerId: 'r3' }];
    const result = aggregateReviews(reviews, 'pcp-3', 1);
    expect(result.finalDecision).toBe('reject');
  });
});
