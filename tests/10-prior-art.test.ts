import { describe, it, expect } from 'vitest';
import { assessNovelty, type InventionDisclosure, type PriorArtDocument } from '../src/foundation/10-prior-art.js';

describe('10 Prior-Art Confirmation', () => {
  it('returns CLEAR with no blocking documents', () => {
    const disclosure: InventionDisclosure = {
      id: 'd1',
      version: '1.0.0',
      title: 'Test',
      abstract: 'A',
      problemStatement: 'P',
      novelMechanisms: [{ id: 'm1', description: 'x', importance: 1 }],
      claimsLikeElements: [],
      domainTags: [],
      inventionDate: '2026-01-01',
      keywordsInitial: [],
      createdBy: 'author',
      createdAt: Date.now(),
    };
    const result = assessNovelty(disclosure, []);
    expect(result.overallDecision).toBe('CLEAR');
  });

  it('returns BLOCKED when blocking art present', () => {
    const disclosure: InventionDisclosure = {
      id: 'd2',
      version: '1.0.0',
      title: 'Test',
      abstract: 'A',
      problemStatement: 'P',
      novelMechanisms: [],
      claimsLikeElements: [],
      domainTags: [],
      inventionDate: '2026-01-01',
      keywordsInitial: [],
      createdBy: 'author',
      createdAt: Date.now(),
    };
    const docs: PriorArtDocument[] = [
      {
        docId: 'doc1',
        sourceType: 'patent',
        identifier: 'US123',
        title: 'Prior',
        publicationDate: '2020-01-01',
        relevanceScore: 0.95,
        assessmentCategory: 'BLOCKING',
        elementCoverage: {},
      },
    ];
    const result = assessNovelty(disclosure, docs);
    expect(result.overallDecision).toBe('BLOCKED');
  });
});
