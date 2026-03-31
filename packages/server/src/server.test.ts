import { describe, expect, test } from 'bun:test';
import { EpisodeTypes, type EpisodicNode } from '@graphiti/core';

import { createGraphitiServer } from './app';
import type {
  AddEntityNodeRequestDto,
  AddMessagesRequestDto,
  GetMemoryRequestDto,
  SearchQueryDto
} from './dto';
import type { GraphitiServerService } from './service';

describe('Graphiti server', () => {
  test('returns healthcheck', async () => {
    const app = createGraphitiServer(new FakeServerService());

    const response = await app.fetch(new Request('http://localhost/healthcheck'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'healthy' });
  });

  test('returns search results', async () => {
    const service = new FakeServerService();
    const app = createGraphitiServer(service);

    const response = await app.fetch(
      new Request('http://localhost/search', {
        method: 'POST',
        body: JSON.stringify({
          query: 'alice',
          group_ids: ['group'],
          max_facts: 5
        }),
        headers: {
          'content-type': 'application/json'
        }
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      facts: [
        {
          uuid: 'edge-1',
          name: 'knows',
          fact: 'Alice knows Bob',
          valid_at: null,
          invalid_at: null,
          created_at: '2026-03-30T00:00:00.000Z',
          expired_at: null
        }
      ]
    });
    expect(service.searchCalls).toEqual([
      {
        query: 'alice',
        group_ids: ['group'],
        max_facts: 5
      }
    ]);
  });

  test('forwards search center node and filters', async () => {
    const service = new FakeServerService();
    const app = createGraphitiServer(service);

    const response = await app.fetch(
      new Request('http://localhost/search', {
        method: 'POST',
        body: JSON.stringify({
          query: 'alice',
          group_ids: ['group'],
          max_facts: 5,
          center_node_uuid: 'entity-2',
          search_filter: {
            node_labels: ['Person'],
            edge_types: ['knows'],
            valid_at: [
              [
                {
                  date: '2026-03-31T00:00:00.000Z',
                  comparison_operator: '>='
                }
              ]
            ],
            edge_uuids: ['edge-1']
          }
        }),
        headers: {
          'content-type': 'application/json'
        }
      })
    );

    expect(response.status).toBe(200);
    expect(service.searchCalls).toEqual([
      {
        query: 'alice',
        group_ids: ['group'],
        max_facts: 5,
        center_node_uuid: 'entity-2',
        search_filter: {
          node_labels: ['Person'],
          edge_types: ['knows'],
          valid_at: [
            [
              {
                date: '2026-03-31T00:00:00.000Z',
                comparison_operator: '>='
              }
            ]
          ],
          edge_uuids: ['edge-1']
        }
      }
    ]);
  });

  test('returns get-memory results and forwards center node options', async () => {
    const service = new FakeServerService();
    const app = createGraphitiServer(service);

    const response = await app.fetch(
      new Request('http://localhost/get-memory', {
        method: 'POST',
        body: JSON.stringify({
          group_id: 'group',
          max_facts: 3,
          center_node_uuid: 'entity-1',
          messages: [
            {
              role_type: 'user',
              role: 'alice',
              content: 'Who does Bob know?'
            }
          ]
        }),
        headers: {
          'content-type': 'application/json'
        }
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      facts: [
        {
          uuid: 'edge-1',
          name: 'knows',
          fact: 'Alice knows Bob',
          valid_at: null,
          invalid_at: null,
          created_at: '2026-03-30T00:00:00.000Z',
          expired_at: null
        }
      ]
    });
    expect(service.memoryCalls).toEqual([
      {
        group_id: 'group',
        max_facts: 3,
        center_node_uuid: 'entity-1',
        messages: [
          {
            role_type: 'user',
            role: 'alice',
            content: 'Who does Bob know?'
          }
        ]
      }
    ]);
  });

  test('accepts entity-node creation', async () => {
    const service = new FakeServerService();
    const app = createGraphitiServer(service);

    const response = await app.fetch(
      new Request('http://localhost/entity-node', {
        method: 'POST',
        body: JSON.stringify({
          uuid: 'entity-1',
          group_id: 'group',
          name: 'Alice',
          summary: 'summary'
        }),
        headers: {
          'content-type': 'application/json'
        }
      })
    );

    expect(response.status).toBe(201);
    expect(service.addEntityNodeCalls).toEqual([
      {
        uuid: 'entity-1',
        group_id: 'group',
        name: 'Alice',
        summary: 'summary'
      }
    ]);
  });

  test('accepts message ingestion', async () => {
    const service = new FakeServerService();
    const app = createGraphitiServer(service);

    const response = await app.fetch(
      new Request('http://localhost/messages', {
        method: 'POST',
        body: JSON.stringify({
          group_id: 'group',
          messages: [
            {
              uuid: 'episode-1',
              name: 'episode',
              role_type: 'user',
              role: 'alice',
              content: 'Hello',
              source_description: 'chat'
            }
          ]
        }),
        headers: {
          'content-type': 'application/json'
        }
      })
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      message: 'Messages added to processing queue',
      success: true
    });
    expect(service.addMessagesCalls).toEqual([
      {
        group_id: 'group',
        messages: [
          {
            uuid: 'episode-1',
            name: 'episode',
            role_type: 'user',
            role: 'alice',
            content: 'Hello',
            source_description: 'chat'
          }
        ]
      }
    ]);
  });

  test('returns not implemented for unsupported routes', async () => {
    const service = new FakeServerService();
    const app = createGraphitiServer(service);

    const response = await app.fetch(
      new Request('http://localhost/episodes/group?last_n=10')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        uuid: 'episode-2',
        name: 'episode 2',
        group_id: 'group',
        labels: [],
        created_at: '2026-03-31T00:00:00.000Z',
        source: 'text',
        source_description: 'chat',
        content: 'Second episode',
        valid_at: '2026-03-31T00:00:00.000Z',
        entity_edges: []
      }
    ]);
    expect(service.episodeCalls).toEqual([{ groupId: 'group', lastN: 10 }]);
  });

  test('handles mutation routes', async () => {
    const service = new FakeServerService();
    const app = createGraphitiServer(service);

    const deleteEdgeResponse = await app.fetch(
      new Request('http://localhost/entity-edge/edge-1', { method: 'DELETE' })
    );

    expect(deleteEdgeResponse.status).toBe(200);
    expect(await deleteEdgeResponse.json()).toEqual({
      message: 'Entity Edge deleted',
      success: true
    });
    expect(service.deletedEdgeCalls).toEqual(['edge-1']);

    const deleteEpisodeResponse = await app.fetch(
      new Request('http://localhost/episode/episode-1', { method: 'DELETE' })
    );

    expect(deleteEpisodeResponse.status).toBe(200);
    expect(await deleteEpisodeResponse.json()).toEqual({
      message: 'Episode deleted',
      success: true
    });
    expect(service.deletedEpisodeCalls).toEqual(['episode-1']);

    const deleteGroupResponse = await app.fetch(
      new Request('http://localhost/group/group', { method: 'DELETE' })
    );

    expect(deleteGroupResponse.status).toBe(200);
    expect(await deleteGroupResponse.json()).toEqual({
      message: 'Group deleted',
      success: true
    });
    expect(service.deletedGroupCalls).toEqual(['group']);

    const clearResponse = await app.fetch(
      new Request('http://localhost/clear', {
        method: 'POST'
      })
    );

    expect(clearResponse.status).toBe(200);
    expect(await clearResponse.json()).toEqual({
      message: 'Graph cleared',
      success: true
    });
    expect(service.clearCalls).toBe(1);
  });
});

class FakeServerService implements GraphitiServerService {
  searchCalls: unknown[] = [];
  memoryCalls: unknown[] = [];
  addEntityNodeCalls: unknown[] = [];
  addMessagesCalls: unknown[] = [];
  episodeCalls: unknown[] = [];
  deletedEdgeCalls: string[] = [];
  deletedEpisodeCalls: string[] = [];
  deletedGroupCalls: string[] = [];
  clearCalls = 0;

  async search(request: SearchQueryDto) {
    this.searchCalls.push(request);
    return [
      {
        uuid: 'edge-1',
        name: 'knows',
        fact: 'Alice knows Bob',
        valid_at: null,
        invalid_at: null,
        created_at: '2026-03-30T00:00:00.000Z',
        expired_at: null
      }
    ];
  }

  async getEntityEdge() {
    return {
      uuid: 'edge-1',
      name: 'knows',
      fact: 'Alice knows Bob',
      valid_at: null,
      invalid_at: null,
      created_at: '2026-03-30T00:00:00.000Z',
      expired_at: null
    };
  }

  async addEntityNode(request: AddEntityNodeRequestDto) {
    this.addEntityNodeCalls.push(request);
    return {
      uuid: 'entity-1',
      name: 'Alice',
      group_id: 'group',
      labels: ['Person'],
      created_at: new Date('2026-03-30T00:00:00.000Z'),
      summary: ''
    };
  }

  async addMessages(request: AddMessagesRequestDto) {
    this.addMessagesCalls.push(request);
  }

  async getMemory(request: GetMemoryRequestDto) {
    this.memoryCalls.push(request);
    return [
      {
        uuid: 'edge-1',
        name: 'knows',
        fact: 'Alice knows Bob',
        valid_at: null,
        invalid_at: null,
        created_at: '2026-03-30T00:00:00.000Z',
        expired_at: null
      }
    ];
  }

  async getEpisodes(groupId: string, lastN: number): Promise<EpisodicNode[]> {
    this.episodeCalls.push({ groupId, lastN });
    return [
      {
        uuid: 'episode-2',
        name: 'episode 2',
        group_id: 'group',
        labels: [],
        created_at: new Date('2026-03-31T00:00:00.000Z'),
        source: EpisodeTypes.text,
        source_description: 'chat',
        content: 'Second episode',
        valid_at: new Date('2026-03-31T00:00:00.000Z'),
        entity_edges: []
      }
    ];
  }

  async deleteEntityEdge(uuid: string): Promise<void> {
    this.deletedEdgeCalls.push(uuid);
  }

  async deleteGroup(groupId: string): Promise<void> {
    this.deletedGroupCalls.push(groupId);
  }

  async deleteEpisode(uuid: string): Promise<void> {
    this.deletedEpisodeCalls.push(uuid);
  }

  async clear(): Promise<void> {
    this.clearCalls += 1;
  }

  async close(): Promise<void> {}
}
