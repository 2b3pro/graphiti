import { expect } from 'bun:test';
import type { EntityEdge, EntityNode, EpisodicNode } from '@graphiti/core';

export function expectEntityEqual(
  actual: EntityNode,
  expected: EntityNode,
  options: { ignoreEmbeddings?: boolean; ignoreTimestamps?: boolean } = {}
): void {
  expect(actual.uuid).toBe(expected.uuid);
  expect(actual.name).toBe(expected.name);
  expect(actual.group_id).toBe(expected.group_id);
  expect(actual.labels).toEqual(expected.labels);
  expect(actual.summary).toBe(expected.summary);

  if (!options.ignoreTimestamps) {
    expect(actual.created_at.toISOString()).toBe(expected.created_at.toISOString());
  }

  if (!options.ignoreEmbeddings) {
    expect(actual.name_embedding).toEqual(expected.name_embedding);
  }
}

export function expectEdgeEqual(
  actual: EntityEdge,
  expected: EntityEdge,
  options: { ignoreEmbeddings?: boolean; ignoreTimestamps?: boolean } = {}
): void {
  expect(actual.uuid).toBe(expected.uuid);
  expect(actual.name).toBe(expected.name);
  expect(actual.fact).toBe(expected.fact);
  expect(actual.group_id).toBe(expected.group_id);
  expect(actual.source_node_uuid).toBe(expected.source_node_uuid);
  expect(actual.target_node_uuid).toBe(expected.target_node_uuid);

  if (!options.ignoreTimestamps) {
    expect(actual.created_at.toISOString()).toBe(expected.created_at.toISOString());
  }

  if (!options.ignoreEmbeddings) {
    expect(actual.fact_embedding).toEqual(expected.fact_embedding);
  }
}

export function expectEpisodeEqual(
  actual: EpisodicNode,
  expected: EpisodicNode,
  options: { ignoreTimestamps?: boolean } = {}
): void {
  expect(actual.uuid).toBe(expected.uuid);
  expect(actual.name).toBe(expected.name);
  expect(actual.group_id).toBe(expected.group_id);
  expect(actual.source).toBe(expected.source);
  expect(actual.content).toBe(expected.content);

  if (!options.ignoreTimestamps) {
    expect(actual.created_at.toISOString()).toBe(expected.created_at.toISOString());
  }
}
