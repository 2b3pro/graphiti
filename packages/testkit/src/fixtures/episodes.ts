import type { EpisodicNode } from '@graphiti/core';

const FIXED_DATE = new Date('2026-03-30T12:00:00.000Z');

export const INTRO_EPISODE: EpisodicNode = {
  uuid: 'test-episode-intro',
  name: 'introduction',
  group_id: 'test-group',
  labels: ['Episodic'],
  created_at: FIXED_DATE,
  source: 'text',
  source_description: 'test conversation',
  content: 'Alice knows Bob. Carol greeted Alice.',
  valid_at: FIXED_DATE,
  entity_edges: []
};

export const FOLLOWUP_EPISODE: EpisodicNode = {
  uuid: 'test-episode-followup',
  name: 'followup',
  group_id: 'test-group',
  labels: ['Episodic'],
  created_at: new Date('2026-03-31T12:00:00.000Z'),
  source: 'message',
  source_description: 'test chat',
  content: 'Bob told Carol about the project.',
  valid_at: new Date('2026-03-31T12:00:00.000Z'),
  entity_edges: []
};
