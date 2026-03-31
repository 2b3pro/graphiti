import type { EntityNode } from '@graphiti/core';

const FIXED_DATE = new Date('2026-03-30T12:00:00.000Z');

export const ALICE: EntityNode = {
  uuid: 'test-entity-alice',
  name: 'Alice',
  group_id: 'test-group',
  labels: ['Person'],
  created_at: FIXED_DATE,
  summary: 'A software engineer'
};

export const BOB: EntityNode = {
  uuid: 'test-entity-bob',
  name: 'Bob',
  group_id: 'test-group',
  labels: ['Person'],
  created_at: FIXED_DATE,
  summary: 'A product manager'
};

export const CAROL: EntityNode = {
  uuid: 'test-entity-carol',
  name: 'Carol',
  group_id: 'test-group',
  labels: ['Person'],
  created_at: FIXED_DATE,
  summary: 'A designer'
};
