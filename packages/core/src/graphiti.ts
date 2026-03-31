import { SearchRerankerError } from '@graphiti/shared';

import { createCommunityNamespace, type CommunityNamespaceApi } from './namespaces/communities';
import { createEdgeNamespace, type EdgeNamespaceApi } from './namespaces/edges';
import { createNodeNamespace, type NodeNamespaceApi } from './namespaces/nodes';
import { createTracer, NoOpTracer, type Tracer } from './tracing';
import type {
  CrossEncoderClient,
  EmbedderClient,
  GraphDriver,
  GraphitiClients,
  LLMClient
} from './contracts';
import { OpenAIClient } from './providers/llm/openai-client';
import { OpenAIEmbedder } from './providers/embedder/openai-embedder';
import { OpenAIRerankerClient } from './providers/reranker/openai-reranker';
import type { EntityEdge } from './domain/edges';
import type { EntityNode, EpisodicNode } from './domain/nodes';
import {
  HeuristicEpisodeExtractor,
  ModelEpisodeExtractor,
  type EpisodeExtractor,
  type EpisodeExtractionResult
} from './ingest/extractor';
import {
  HeuristicNodeHydrator,
  ModelNodeHydrator,
  type NodeHydrator
} from './ingest/hydrator';
import { resolveEpisodeExtraction } from './ingest/resolver';
import {
  buildCommunities as buildCommunitiesOp,
  removeCommunities,
  updateCommunity as updateCommunityOp
} from './community/community-operations';
import type { SearchConfig, SearchResults } from './search/config';
import { EdgeRerankers, NodeRerankers, createSearchConfig } from './search/config';
import { createSearchFilters, type SearchFilters } from './search/filters';
import { EDGE_HYBRID_SEARCH_NODE_DISTANCE, EDGE_HYBRID_SEARCH_RRF } from './search/recipes';
import { search } from './search/search';

export interface GraphitiOptions {
  driver: GraphDriver;
  llm_client?: LLMClient | null;
  embedder?: EmbedderClient | null;
  cross_encoder?: CrossEncoderClient | null;
  episode_extractor?: EpisodeExtractor | null;
  node_hydrator?: NodeHydrator | null;
  tracer?: Tracer | null;
}

export interface AddTripletInput {
  source: EntityNode;
  edge: EntityEdge;
  target: EntityNode;
}

export interface AddTripletResult {
  nodes: [EntityNode, EntityNode];
  edges: [EntityEdge];
}

export interface AddEpisodeInput {
  episode: EpisodicNode;
  entities?: EntityNode[];
  entity_edges?: EntityEdge[];
}

export interface AddEpisodeResult {
  episode: EpisodicNode;
  nodes: EntityNode[];
  edges: EntityEdge[];
}

export interface IngestEpisodeInput {
  episode: EpisodicNode;
  previous_episode_count?: number;
}

export interface IngestEpisodeResult extends AddEpisodeResult {
  previous_episodes: EpisodicNode[];
  extraction: EpisodeExtractionResult;
}

export interface IngestEpisodesInput {
  episodes: IngestEpisodeInput[];
}

export interface IngestEpisodesResult {
  episodes: IngestEpisodeResult[];
}

export interface GraphitiSearchOptions {
  group_ids?: string[] | null;
  search_filter?: SearchFilters;
  bfs_origin_node_uuids?: string[] | null;
  center_node_uuid?: string | null;
}

export class Graphiti {
  readonly driver: GraphDriver;
  readonly llm_client: LLMClient | null;
  readonly embedder: EmbedderClient | null;
  readonly cross_encoder: CrossEncoderClient | null;
  readonly tracer: Tracer;
  readonly episode_extractor: EpisodeExtractor;
  readonly node_hydrator: NodeHydrator;
  readonly clients: GraphitiClients | null;
  readonly nodes: NodeNamespaceApi;
  readonly edges: EdgeNamespaceApi;
  readonly communities: CommunityNamespaceApi;

  constructor(options: GraphitiOptions) {
    this.driver = options.driver;
    this.llm_client =
      options.llm_client === undefined ? createDefaultLLMClient() : options.llm_client;
    this.embedder =
      options.embedder === undefined ? createDefaultEmbedder() : options.embedder;
    this.cross_encoder =
      options.cross_encoder === undefined ? createDefaultReranker() : options.cross_encoder;
    this.episode_extractor =
      options.episode_extractor ??
      (this.llm_client
        ? new ModelEpisodeExtractor(this.llm_client, new HeuristicEpisodeExtractor())
        : new HeuristicEpisodeExtractor());
    this.node_hydrator =
      options.node_hydrator ??
      (this.llm_client
        ? new ModelNodeHydrator(this.llm_client, new HeuristicNodeHydrator())
        : new HeuristicNodeHydrator());
    this.tracer = createTracer(options.tracer ?? new NoOpTracer());
    this.nodes = createNodeNamespace(this.driver, this.embedder);
    this.edges = createEdgeNamespace(this.driver, this.embedder);
    this.communities = createCommunityNamespace(this.driver, this.embedder);
    this.clients =
      this.llm_client && this.embedder && this.cross_encoder
        ? {
            driver: this.driver,
            llm_client: this.llm_client,
            embedder: this.embedder,
            cross_encoder: this.cross_encoder,
            tracer: this.tracer
          }
        : null;

    if (this.llm_client) {
      this.llm_client.setTracer(this.tracer);
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }

  async buildIndicesAndConstraints(deleteExisting = false): Promise<void> {
    await this.driver.buildIndicesAndConstraints(deleteExisting);
  }

  async addTriplet(input: AddTripletInput): Promise<AddTripletResult> {
    const transaction = await this.driver.transaction();

    try {
      await this.nodes.entity.save(input.source);
      await this.nodes.entity.save(input.target);
      await this.edges.entity.save(input.edge);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return {
      nodes: [input.source, input.target],
      edges: [input.edge]
    };
  }

  async addEpisode(input: AddEpisodeInput): Promise<AddEpisodeResult> {
    const transaction = await this.driver.transaction();
    const entities = input.entities ?? [];
    const edges = input.entity_edges ?? [];

    try {
      for (const entity of entities) {
        await this.nodes.entity.save(entity);
      }

      await this.nodes.episode.save(input.episode);

      for (const edge of edges) {
        await this.edges.entity.save(edge);
      }

      for (const entity of entities) {
        await this.edges.episodic.save({
          uuid: `${input.episode.uuid}:${entity.uuid}`,
          group_id: input.episode.group_id,
          source_node_uuid: input.episode.uuid,
          target_node_uuid: entity.uuid,
          created_at: input.episode.created_at
        });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return {
      episode: input.episode,
      nodes: entities,
      edges
    };
  }

  async ingestEpisode(input: IngestEpisodeInput): Promise<IngestEpisodeResult> {
    const referenceTime = input.episode.valid_at ?? input.episode.created_at;
    const previousEpisodes = await this.retrieveEpisodes(
      [input.episode.group_id],
      input.previous_episode_count ?? 5,
      referenceTime
    );
    const extraction = await this.episode_extractor.extract({
      episode: input.episode,
      previous_episodes: previousEpisodes.filter(
        (episode) => episode.uuid !== input.episode.uuid
      )
    });
    await this.enrichExtractionEmbeddings(extraction);
    const resolvedExtraction = await resolveEpisodeExtraction(
      this.driver,
      input.episode,
      extraction
    );
    const hydratedEntities = await this.node_hydrator.hydrate({
      episode: input.episode,
      previous_episodes: previousEpisodes,
      entities: resolvedExtraction.entities,
      entity_edges: [...resolvedExtraction.entity_edges, ...resolvedExtraction.invalidated_edges]
    });
    input.episode.entity_edges = [
      ...resolvedExtraction.entity_edges.map((edge) => edge.uuid),
      ...resolvedExtraction.invalidated_edges.map((edge) => edge.uuid)
    ];
    const result = await this.addEpisode({
      episode: input.episode,
      entities: hydratedEntities,
      entity_edges: [...resolvedExtraction.entity_edges, ...resolvedExtraction.invalidated_edges]
    });

    return {
      ...result,
      previous_episodes: previousEpisodes,
      extraction: {
        entities: hydratedEntities,
        entity_edges: [...resolvedExtraction.entity_edges, ...resolvedExtraction.invalidated_edges]
      }
    };
  }

  async ingestEpisodes(input: IngestEpisodesInput): Promise<IngestEpisodesResult> {
    const orderedEpisodes = [...input.episodes].sort((left, right) => {
      const leftTime = left.episode.valid_at ?? left.episode.created_at;
      const rightTime = right.episode.valid_at ?? right.episode.created_at;
      const timeDifference = leftTime.getTime() - rightTime.getTime();

      if (timeDifference !== 0) {
        return timeDifference;
      }

      return left.episode.uuid.localeCompare(right.episode.uuid);
    });
    const results: IngestEpisodeResult[] = [];

    for (const episodeInput of orderedEpisodes) {
      results.push(await this.ingestEpisode(episodeInput));
    }

    return {
      episodes: results
    };
  }

  async addEpisodeBulk(
    inputs: IngestEpisodeInput[]
  ): Promise<IngestEpisodesResult> {
    if (inputs.length === 0) {
      return { episodes: [] };
    }

    const orderedInputs = [...inputs].sort((left, right) => {
      const leftTime = left.episode.valid_at ?? left.episode.created_at;
      const rightTime = right.episode.valid_at ?? right.episode.created_at;
      const timeDifference = leftTime.getTime() - rightTime.getTime();
      return timeDifference !== 0 ? timeDifference : left.episode.uuid.localeCompare(right.episode.uuid);
    });

    // Phase 1: Parallel extraction across all episodes
    const extractionResults = await Promise.all(
      orderedInputs.map(async (input) => {
        const referenceTime = input.episode.valid_at ?? input.episode.created_at;
        const previousEpisodes = await this.retrieveEpisodes(
          [input.episode.group_id],
          input.previous_episode_count ?? 5,
          referenceTime
        );
        const extraction = await this.episode_extractor.extract({
          episode: input.episode,
          previous_episodes: previousEpisodes.filter(
            (ep) => ep.uuid !== input.episode.uuid
          )
        });
        await this.enrichExtractionEmbeddings(extraction);
        const resolvedExtraction = await resolveEpisodeExtraction(
          this.driver,
          input.episode,
          extraction
        );
        return { input, previousEpisodes, resolvedExtraction };
      })
    );

    // Phase 2: Intra-batch entity name deduplication
    const uuidMap = new Map<string, string>();
    const canonicalEntities = new Map<string, EntityNode>();

    for (const { resolvedExtraction } of extractionResults) {
      for (const entity of resolvedExtraction.entities) {
        const normalizedName = entity.name.trim().toLowerCase();
        const existing = canonicalEntities.get(normalizedName);

        if (existing && existing.uuid !== entity.uuid) {
          uuidMap.set(entity.uuid, existing.uuid);
        } else if (!existing) {
          canonicalEntities.set(normalizedName, entity);
        }
      }
    }

    // Phase 3: Apply UUID remapping and persist
    const results: IngestEpisodeResult[] = [];

    for (const { input, previousEpisodes, resolvedExtraction } of extractionResults) {
      const remappedEntities = resolvedExtraction.entities.filter(
        (entity) => !uuidMap.has(entity.uuid)
      );

      const allEdges = [
        ...resolvedExtraction.entity_edges,
        ...resolvedExtraction.invalidated_edges
      ];
      for (const edge of allEdges) {
        edge.source_node_uuid = uuidMap.get(edge.source_node_uuid) ?? edge.source_node_uuid;
        edge.target_node_uuid = uuidMap.get(edge.target_node_uuid) ?? edge.target_node_uuid;
      }

      const hydratedEntities = await this.node_hydrator.hydrate({
        episode: input.episode,
        previous_episodes: previousEpisodes,
        entities: remappedEntities,
        entity_edges: allEdges
      });

      input.episode.entity_edges = allEdges.map((edge) => edge.uuid);

      const result = await this.addEpisode({
        episode: input.episode,
        entities: hydratedEntities,
        entity_edges: allEdges
      });

      results.push({
        ...result,
        previous_episodes: previousEpisodes,
        extraction: {
          entities: hydratedEntities,
          entity_edges: allEdges
        }
      });
    }

    return { episodes: results };
  }

  async retrieveEpisodes(
    groupIds: string[],
    lastN = 10,
    referenceTime?: Date | null
  ): Promise<EpisodicNode[]> {
    return this.nodes.episode.getByGroupIds(groupIds, lastN, referenceTime);
  }

  async deleteEntityEdge(uuid: string): Promise<void> {
    await this.edges.entity.deleteByUuid(uuid);
  }

  async deleteEpisode(uuid: string): Promise<void> {
    await this.nodes.episode.deleteByUuid(uuid);
  }

  async deleteGroup(groupId: string): Promise<void> {
    const transaction = await this.driver.transaction();

    try {
      await this.edges.entity.deleteByGroupId(groupId);
      await this.nodes.episode.deleteByGroupId(groupId);
      await this.nodes.entity.deleteByGroupId(groupId);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async clear(): Promise<void> {
    const transaction = await this.driver.transaction();

    try {
      await this.driver.executeQuery(
        `
          MATCH (n)
          WITH collect(n) AS nodes
          FOREACH (node IN nodes | DETACH DELETE node)
          RETURN size(nodes) AS deleted_count
        `
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async buildCommunities(
    groupIds: string[] | null = null
  ): Promise<{ nodes: import('./domain/nodes').CommunityNode[]; edges: import('./domain/edges').CommunityEdge[] }> {
    if (!this.llm_client) {
      throw new Error('LLM client is required for building communities');
    }

    await removeCommunities(this.driver);

    const [communityNodes, communityEdges] = await buildCommunitiesOp(
      this.driver,
      this.llm_client,
      this.nodes.entity,
      groupIds
    );

    await this.communities.node.saveBulk(communityNodes);
    await this.communities.edge.saveBulk(communityEdges);

    return { nodes: communityNodes, edges: communityEdges };
  }

  async updateCommunity(
    entity: EntityNode
  ): Promise<{ nodes: import('./domain/nodes').CommunityNode[]; edges: import('./domain/edges').CommunityEdge[] }> {
    if (!this.llm_client) {
      throw new Error('LLM client is required for updating communities');
    }
    if (!this.embedder) {
      throw new Error('Embedder is required for updating communities');
    }

    const [nodes, edges] = await updateCommunityOp(
      this.driver,
      this.llm_client,
      this.embedder,
      this.communities,
      entity
    );

    return { nodes, edges };
  }

  private async enrichExtractionEmbeddings(extraction: EpisodeExtractionResult): Promise<void> {
    if (!this.embedder) {
      return;
    }

    for (const entity of extraction.entities) {
      if (!entity.name_embedding) {
        entity.name_embedding = await this.embedder.create([entity.name.replaceAll('\n', ' ')]);
      }
    }

    for (const edge of extraction.entity_edges) {
      if (!edge.fact_embedding) {
        edge.fact_embedding = await this.embedder.create([edge.fact.replaceAll('\n', ' ')]);
      }
    }
  }

  async searchEdges(
    query: string,
    options: {
      group_ids?: string[] | null;
      center_node_uuid?: string | null;
      num_results?: number;
      search_filter?: SearchFilters;
    } = {}
  ): Promise<SearchResults['edges']> {
    const baseConfig = options.center_node_uuid
      ? EDGE_HYBRID_SEARCH_NODE_DISTANCE
      : EDGE_HYBRID_SEARCH_RRF;
    const config = createSearchConfig({ ...baseConfig, limit: options.num_results ?? 10 });
    const searchOptions: GraphitiSearchOptions = {};
    if (options.group_ids !== undefined) searchOptions.group_ids = options.group_ids;
    if (options.center_node_uuid !== undefined) searchOptions.center_node_uuid = options.center_node_uuid;
    if (options.search_filter !== undefined) searchOptions.search_filter = options.search_filter;
    const results = await this.search(query, config, searchOptions);
    return results.edges;
  }

  async getNodesAndEdgesByEpisode(episodeUuids: string[]): Promise<SearchResults> {
    if (episodeUuids.length === 0) {
      return {
        nodes: [],
        node_reranker_scores: [],
        edges: [],
        edge_reranker_scores: [],
        episodes: [],
        episode_reranker_scores: [],
        communities: [],
        community_reranker_scores: []
      };
    }

    const episodes = await this.nodes.episode.getByUuids(episodeUuids);

    const allEdgeUuids = [...new Set(episodes.flatMap((ep) => ep.entity_edges ?? []))];
    const edges = await this.edges.entity.getByUuids(allEdgeUuids);

    const allNodeUuids = [
      ...new Set(edges.flatMap((edge) => [edge.source_node_uuid, edge.target_node_uuid]))
    ];
    const nodes = await this.nodes.entity.getByUuids(allNodeUuids);

    return {
      nodes,
      node_reranker_scores: [],
      edges,
      edge_reranker_scores: [],
      episodes: [],
      episode_reranker_scores: [],
      communities: [],
      community_reranker_scores: []
    };
  }

  async search(
    query: string,
    config: SearchConfig,
    options: GraphitiSearchOptions = {}
  ): Promise<SearchResults> {
    const needsQueryEmbedding =
      config.node_config?.search_methods.includes('cosine_similarity') === true ||
      config.edge_config?.search_methods.includes('cosine_similarity') === true ||
      config.node_config?.reranker === NodeRerankers.mmr ||
      config.edge_config?.reranker === EdgeRerankers.mmr;
    let queryEmbedding: number[] | null = null;

    if (needsQueryEmbedding) {
      if (!this.embedder) {
        throw new SearchRerankerError(
          'No embedder configured for cosine similarity search'
        );
      }

      queryEmbedding = await this.embedder.create(query.replaceAll('\n', ' '));
    }

    const executionOptions =
      options.bfs_origin_node_uuids === undefined &&
      options.center_node_uuid === undefined &&
      queryEmbedding === null
        ? {}
        : {
            ...(options.bfs_origin_node_uuids === undefined
              ? {}
              : { bfs_origin_node_uuids: options.bfs_origin_node_uuids }),
            ...(options.center_node_uuid === undefined
              ? {}
              : { center_node_uuid: options.center_node_uuid }),
            ...(queryEmbedding === null ? {} : { query_embedding: queryEmbedding })
          };

    return search(
      this.driver,
      query,
      options.group_ids,
      config,
      options.search_filter ?? createSearchFilters(),
      executionOptions,
      this.cross_encoder
    );
  }
}

function hasOpenAIKey(): boolean {
  try {
    return (
      typeof process !== 'undefined' &&
      typeof process.env?.OPENAI_API_KEY === 'string' &&
      process.env.OPENAI_API_KEY !== ''
    );
  } catch {
    return false;
  }
}

function createDefaultLLMClient(): LLMClient | null {
  return hasOpenAIKey() ? new OpenAIClient() : null;
}

function createDefaultEmbedder(): EmbedderClient | null {
  return hasOpenAIKey() ? new OpenAIEmbedder() : null;
}

function createDefaultReranker(): CrossEncoderClient | null {
  return hasOpenAIKey() ? new OpenAIRerankerClient() : null;
}
