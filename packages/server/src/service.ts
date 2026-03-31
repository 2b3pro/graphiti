import {
  ComparisonOperators,
  Graphiti,
  type EntityEdge,
  type EntityNode,
  type EpisodicNode,
  type DateFilter,
  type GraphitiSearchOptions,
  type PropertyFilter,
  type SearchFilters,
  createEdgeSearchConfig,
  createSearchFilters,
  createNode,
  createSearchConfig,
  EdgeRerankers,
  EdgeSearchMethods,
  EpisodeTypes,
  FalkorDriver,
  Neo4jDriver,
  createFalkorClientAdapter,
  createNeo4jClientAdapter
} from '@graphiti/core';
import { utcNow } from '@graphiti/shared';

import type {
  AddEntityNodeRequestDto,
  DateFilterDto,
  FactResultDto,
  GetMemoryRequestDto,
  MessageDto,
  SearchFilterDto,
  SearchQueryDto
} from './dto';

export interface GraphitiServerService {
  search(request: SearchQueryDto): Promise<FactResultDto[]>;
  getEntityEdge(uuid: string): Promise<FactResultDto>;
  addEntityNode(request: AddEntityNodeRequestDto): Promise<EntityNode>;
  addMessages(request: { group_id: string; messages: MessageDto[] }): Promise<void>;
  getMemory(request: GetMemoryRequestDto): Promise<FactResultDto[]>;
  getEpisodes(_groupId: string, _lastN: number): Promise<EpisodicNode[]>;
  deleteEntityEdge(_uuid: string): Promise<void>;
  deleteGroup(_groupId: string): Promise<void>;
  deleteEpisode(_uuid: string): Promise<void>;
  clear(): Promise<void>;
  close(): Promise<void>;
}

export class GraphitiCoreServerService implements GraphitiServerService {
  constructor(private readonly graphiti: Graphiti) {}

  async search(request: SearchQueryDto): Promise<FactResultDto[]> {
    const options: GraphitiSearchOptions = {};

    if (request.group_ids !== undefined) {
      options.group_ids = request.group_ids;
    }

    if (request.center_node_uuid !== undefined) {
      options.center_node_uuid = request.center_node_uuid;
    }

    if (request.search_filter !== undefined) {
      options.search_filter = toSearchFilters(request.search_filter);
    }

    const results = await this.graphiti.search(
      request.query,
      createSearchConfig({
        limit: request.max_facts ?? 10,
        edge_config: createEdgeSearchConfig({
          search_methods: [EdgeSearchMethods.bm25],
          reranker: request.center_node_uuid
            ? EdgeRerankers.node_distance
            : EdgeRerankers.rrf
        })
      }),
      options
    );

    return results.edges.map(toFactResult);
  }

  async getEntityEdge(uuid: string): Promise<FactResultDto> {
    return toFactResult(await this.graphiti.edges.entity.getByUuid(uuid));
  }

  async addEntityNode(request: AddEntityNodeRequestDto): Promise<EntityNode> {
    const node = {
      ...createNode({
        uuid: request.uuid,
        name: request.name,
        group_id: request.group_id
      }),
      summary: request.summary ?? ''
    };

    return this.graphiti.nodes.entity.save(node);
  }

  async addMessages(request: { group_id: string; messages: MessageDto[] }): Promise<void> {
    await this.graphiti.ingestEpisodes({
      episodes: request.messages.map((message) => {
        const timestamp = message.timestamp ? new Date(message.timestamp) : utcNow();
        const episode: EpisodicNode = {
          uuid: message.uuid ?? crypto.randomUUID(),
          name: message.name ?? '',
          group_id: request.group_id,
          labels: [],
          created_at: timestamp,
          source: EpisodeTypes.message,
          source_description: message.source_description ?? '',
          content: `${message.role ?? ''}(${message.role_type}): ${message.content}`,
          valid_at: timestamp,
          entity_edges: []
        };

        return {
          episode
        };
      })
    });
  }

  async getMemory(request: GetMemoryRequestDto): Promise<FactResultDto[]> {
    const query = composeQueryFromMessages(request.messages);
    const options: GraphitiSearchOptions = {
      group_ids: [request.group_id],
      center_node_uuid: request.center_node_uuid ?? null
    };

    const results = await this.graphiti.search(
      query,
      createSearchConfig({
        limit: request.max_facts ?? 10,
        edge_config: createEdgeSearchConfig({
          search_methods: [EdgeSearchMethods.bm25],
          reranker: request.center_node_uuid
            ? EdgeRerankers.node_distance
            : EdgeRerankers.rrf
        })
      }),
      options
    );

    return results.edges.map(toFactResult);
  }

  async getEpisodes(_groupId: string, _lastN: number): Promise<EpisodicNode[]> {
    return this.graphiti.retrieveEpisodes([_groupId], _lastN, utcNow());
  }

  async deleteEntityEdge(_uuid: string): Promise<void> {
    await this.graphiti.deleteEntityEdge(_uuid);
  }

  async deleteGroup(_groupId: string): Promise<void> {
    await this.graphiti.deleteGroup(_groupId);
  }

  async deleteEpisode(_uuid: string): Promise<void> {
    await this.graphiti.deleteEpisode(_uuid);
  }

  async clear(): Promise<void> {
    await this.graphiti.clear();
  }

  async close(): Promise<void> {
    await this.graphiti.close();
  }
}

export interface ServerRuntimeConfig {
  graphProvider?: 'neo4j' | 'falkordb';
  neo4jUri?: string;
  neo4jUser?: string;
  neo4jPassword?: string;
  neo4jDatabase?: string;
  falkorHost?: string;
  falkorPort?: number;
  falkorDatabase?: string;
}

export async function createGraphitiServerService(
  config: ServerRuntimeConfig = getServerRuntimeConfig()
): Promise<GraphitiServerService> {
  const provider = config.graphProvider ?? 'neo4j';

  if (provider === 'falkordb') {
    const client = await createFalkorClientAdapter({
      host: config.falkorHost ?? '127.0.0.1',
      port: config.falkorPort ?? 6379,
      database: config.falkorDatabase ?? 'default_db'
    });

    return new GraphitiCoreServerService(
      new Graphiti({
        driver: new FalkorDriver(
          {
            host: config.falkorHost ?? '127.0.0.1',
            port: config.falkorPort ?? 6379,
            database: config.falkorDatabase ?? 'default_db'
          },
          client
        )
      })
    );
  }

  const neo4jClient = createNeo4jClientAdapter({
    uri: config.neo4jUri ?? 'bolt://127.0.0.1:7687',
    user: config.neo4jUser ?? 'neo4j',
    password: config.neo4jPassword ?? 'testpass',
    database: config.neo4jDatabase ?? 'neo4j'
  });

  return new GraphitiCoreServerService(
    new Graphiti({
      driver: new Neo4jDriver(
        {
          uri: config.neo4jUri ?? 'bolt://127.0.0.1:7687',
          user: config.neo4jUser ?? 'neo4j',
          password: config.neo4jPassword ?? 'testpass',
          database: config.neo4jDatabase ?? 'neo4j'
        },
        neo4jClient
      )
    })
  );
}

export function composeQueryFromMessages(messages: MessageDto[]): string {
  return messages
    .map((message) => `${message.role_type ?? ''}(${message.role ?? ''}): ${message.content}`)
    .join('\n');
}

export function toSearchFilters(
  searchFilter: SearchFilterDto | null | undefined
): SearchFilters {
  if (!searchFilter) {
    return createSearchFilters();
  }

  return createSearchFilters({
    node_labels: searchFilter.node_labels ?? null,
    edge_types: searchFilter.edge_types ?? null,
    valid_at: toDateFilterGroups(searchFilter.valid_at),
    invalid_at: toDateFilterGroups(searchFilter.invalid_at),
    created_at: toDateFilterGroups(searchFilter.created_at),
    expired_at: toDateFilterGroups(searchFilter.expired_at),
    edge_uuids: searchFilter.edge_uuids ?? null,
    property_filters: toPropertyFilters(searchFilter.property_filters)
  });
}

function toDateFilterGroups(
  groups: DateFilterDto[][] | null | undefined
): DateFilter[][] | null {
  if (!groups) {
    return null;
  }

  return groups.map((group) => group.map(toDateFilter));
}

function toDateFilter(filter: DateFilterDto): DateFilter {
  return {
    date: filter.date ? new Date(filter.date) : null,
    comparison_operator: normalizeComparisonOperator(filter.comparison_operator)
  };
}

function toPropertyFilters(
  propertyFilters: SearchFilterDto['property_filters']
): PropertyFilter[] | null {
  if (!propertyFilters) {
    return null;
  }

  return propertyFilters.map((filter) => ({
    property_name: filter.property_name,
    property_value: filter.property_value ?? null,
    comparison_operator: normalizeComparisonOperator(filter.comparison_operator)
  }));
}

function normalizeComparisonOperator(
  operator: DateFilterDto['comparison_operator']
): DateFilter['comparison_operator'] {
  switch (operator) {
    case '=':
      return ComparisonOperators.equals;
    case '<>':
      return ComparisonOperators.not_equals;
    case '>':
      return ComparisonOperators.greater_than;
    case '<':
      return ComparisonOperators.less_than;
    case '>=':
      return ComparisonOperators.greater_than_equal;
    case '<=':
      return ComparisonOperators.less_than_equal;
    case 'IS NULL':
      return ComparisonOperators.is_null;
    case 'IS NOT NULL':
      return ComparisonOperators.is_not_null;
  }
}

export function toFactResult(edge: EntityEdge): FactResultDto {
  return {
    uuid: edge.uuid,
    name: edge.name,
    fact: edge.fact,
    valid_at: edge.valid_at?.toISOString() ?? null,
    invalid_at: edge.invalid_at?.toISOString() ?? null,
    created_at: edge.created_at.toISOString(),
    expired_at: edge.expired_at?.toISOString() ?? null
  };
}

function getServerRuntimeConfig(): ServerRuntimeConfig {
  return {
    graphProvider:
      process.env.GRAPHITI_GRAPH_PROVIDER === 'falkordb' ? 'falkordb' : 'neo4j',
    ...(process.env.NEO4J_URI ? { neo4jUri: process.env.NEO4J_URI } : {}),
    ...(process.env.NEO4J_USER ? { neo4jUser: process.env.NEO4J_USER } : {}),
    ...(process.env.NEO4J_PASSWORD
      ? { neo4jPassword: process.env.NEO4J_PASSWORD }
      : {}),
    ...(process.env.NEO4J_DATABASE
      ? { neo4jDatabase: process.env.NEO4J_DATABASE }
      : {}),
    ...(process.env.FALKOR_HOST ? { falkorHost: process.env.FALKOR_HOST } : {}),
    ...(process.env.FALKOR_PORT
      ? { falkorPort: Number(process.env.FALKOR_PORT) }
      : {}),
    ...(process.env.FALKOR_DATABASE
      ? { falkorDatabase: process.env.FALKOR_DATABASE }
      : {})
  };
}
