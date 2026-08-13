/**
 * Engine 10 — Prior-Art Confirmation Process
 */

import type { UUID, Timestamp } from './types.js';

export type AssessmentCategory =
  | 'BLOCKING'
  | 'CLOSELY_RELATED'
  | 'ADJACENT'
  | 'BACKGROUND'
  | 'IRRELEVANT';

export type NoveltyDecision = 'CLEAR' | 'CONDITIONAL' | 'BLOCKED';

export interface FeatureElement {
  id: string;
  description: string;
  importance: number;
}

export interface InventionDisclosure {
  id: UUID;
  version: string;
  title: string;
  abstract: string;
  problemStatement: string;
  novelMechanisms: FeatureElement[];
  claimsLikeElements: string[];
  domainTags: string[];
  inventionDate: string;
  keywordsInitial: string[];
  createdBy: string;
  createdAt: Timestamp;
}

export interface PriorArtDocument {
  docId: string;
  sourceType: string;
  identifier: string;
  title: string;
  publicationDate: string;
  relevanceScore: number;
  assessmentCategory: AssessmentCategory;
  elementCoverage: Record<string, { status: 'PRESENT' | 'PARTIAL' | 'ABSENT'; confidence: number }>;
}

export interface NoveltyAssessment {
  closestPriorArt: string[];
  overallDecision: NoveltyDecision;
  confidence: number;
  residualRisks: string[];
  recommendedActions: string[];
  assessedAt: Timestamp;
}

export function assessNovelty(
  disclosure: InventionDisclosure,
  documents: PriorArtDocument[]
): NoveltyAssessment {
  let blocking = false;
  let highCoverage = false;
  const closest: string[] = [];

  for (const doc of documents) {
    if (doc.assessmentCategory === 'BLOCKING') {
      blocking = true;
      closest.push(doc.docId);
    }
    if (doc.assessmentCategory === 'CLOSELY_RELATED') {
      highCoverage = true;
      closest.push(doc.docId);
    }
  }

  let decision: NoveltyDecision = 'CLEAR';
  if (blocking) decision = 'BLOCKED';
  else if (highCoverage) decision = 'CONDITIONAL';

  return {
    closestPriorArt: closest.slice(0, 5),
    overallDecision: decision,
    confidence: documents.length > 0 ? 0.75 : 0.4,
    residualRisks: decision === 'CLEAR' ? [] : ['Possible design-around required'],
    recommendedActions:
      decision === 'BLOCKED'
        ? ['Revise novel mechanisms', 'Seek legal review']
        : decision === 'CONDITIONAL'
          ? ['Document gaps', 'Strengthen claims']
          : ['Proceed to stage-gate'],
    assessedAt: Date.now(),
  };
}
