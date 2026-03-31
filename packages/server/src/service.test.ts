import { describe, expect, test } from 'bun:test';
import {
  ComparisonOperators,
  EdgeRerankers,
  type Graphiti,
  createSearchResults
} from '@graphiti/core';

import { GraphitiCoreServerService, toSearchFilters } from './service';

describe('GraphitiCoreServerService', () => {
  test('search forwards center node and parsed search filters', async () => {
    const calls: unknown[] = [];
    const graphiti = {
      async search(query: string, config: unknown, options: unknown) {
        calls.push({ query, config, options });
        return createSearchResults();
      }
    } as unknown as Graphiti;

    const service = new GraphitiCoreServerService(graphiti);

    await service.search({
      query: 'alice',
      group_ids: ['group'],
      max_facts: 5,
      center_node_uuid: 'entity-2',
      search_filter: {
        node_labels: ['Person'],
        edge_types: ['knows'],
        valid_at: [[{ date: '2026-03-31T00:00:00.000Z', comparison_operator: '>=' }]],
        invalid_at: [[{ comparison_operator: 'IS NULL' }]],
        edge_uuids: ['edge-1']
      }
    });

    expect(calls).toHaveLength(1);
    expect((calls[0] as any).query).toBe('alice');
    expect((calls[0] as any).config.limit).toBe(5);
    expect((calls[0] as any).config.edge_config?.reranker).toBe(
      EdgeRerankers.node_distance
    );
    expect((calls[0] as any).options).toEqual({
      group_ids: ['group'],
      center_node_uuid: 'entity-2',
      search_filter: {
        node_labels: ['Person'],
        edge_types: ['knows'],
        valid_at: [
          [
            {
              date: new Date('2026-03-31T00:00:00.000Z'),
              comparison_operator: ComparisonOperators.greater_than_equal
            }
          ]
        ],
        invalid_at: [
          [
            {
              date: null,
              comparison_operator: ComparisonOperators.is_null
            }
          ]
        ],
        created_at: null,
        expired_at: null,
        edge_uuids: ['edge-1'],
        property_filters: null
      }
    });
  });

  test('toSearchFilters returns empty filters when omitted', () => {
    expect(toSearchFilters(undefined)).toEqual({
      node_labels: null,
      edge_types: null,
      valid_at: null,
      invalid_at: null,
      created_at: null,
      expired_at: null,
      edge_uuids: null,
      property_filters: null
    });
  });
});
