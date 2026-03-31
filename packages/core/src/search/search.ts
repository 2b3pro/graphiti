import { SearchRerankerError } from '@graphiti/shared';

import type { CrossEncoderClient, GraphDriver } from '../contracts';
import { FalkorDriver } from '../driver/falkordb-driver';
import { Neo4jDriver } from '../driver/neo4j-driver';
import type { SearchOperations } from '../driver/operations/search-operations';
import {
  EdgeRerankers,
  EpisodeRerankers,
  EdgeSearchMethods,
  NodeRerankers,
  NodeSearchMethods,
  createSearchResults,
  type SearchConfig,
  type SearchResults
} from './config';
import { createSearchFilters, type SearchFilters } from './filters';
import { maximalMarginalRelevance, reciprocalRankFusion } from './ranking';

export interface SearchExecutionOptions {
  bfs_origin_node_uuids?: string[] | null;
  center_node_uuid?: string | null;
  query_embedding?: number[] | null;
}

export async function search(
  driver: GraphDriver,
  query: string,
  groupIds: string[] | null | undefined,
  config: SearchConfig,
  searchFilter: SearchFilters = createSearchFilters(),
  options: SearchExecutionOptions = {},
  crossEncoder?: CrossEncoderClient | null
): Promise<SearchResults> {
  if (query.trim() === '') {
    return createSearchResults();
  }

  const ops = resolveSearchOps(driver);
  if (!ops) {
    return createSearchResults();
  }

  const [nodeResult, edgeResult, episodeResult] = await Promise.all([
    config.node_config
      ? collectNodeSearchResults(
          ops, driver, query, groupIds, config, searchFilter, options, crossEncoder
        )
      : Promise.resolve({ nodes: [] as SearchResults['nodes'], scores: [] as number[] }),

    config.edge_config
      ? collectEdgeSearchResults(
          ops, driver, query, groupIds, config, searchFilter, options, crossEncoder
        )
      : Promise.resolve({ edges: [] as SearchResults['edges'], scores: [] as number[] }),

    config.episode_config
      ? collectEpisodeSearchResults(
          ops, driver, query, groupIds, config, searchFilter, crossEncoder
        )
      : Promise.resolve({ episodes: [] as SearchResults['episodes'], scores: [] as number[] }),
  ]);

  return createSearchResults({
    nodes: nodeResult.nodes,
    node_reranker_scores: nodeResult.scores,
    edges: edgeResult.edges,
    edge_reranker_scores: edgeResult.scores,
    episodes: episodeResult.episodes,
    episode_reranker_scores: episodeResult.scores,
  });
}

async function collectNodeSearchResults(
  ops: SearchOperations,
  driver: GraphDriver,
  query: string,
  groupIds: string[] | null | undefined,
  config: SearchConfig,
  searchFilter: SearchFilters,
  options: SearchExecutionOptions,
  crossEncoder?: CrossEncoderClient | null
): Promise<{ nodes: SearchResults['nodes']; scores: number[] }> {
  const nodeConfig = config.node_config;
  if (!nodeConfig) {
    return { nodes: [], scores: [] };
  }

  const searchResults: SearchResults['nodes'][] = [];
  const expandedLimit = config.limit * 2;
  const queryEmbedding = options.query_embedding ?? null;

  if (
    nodeConfig.search_methods.includes(NodeSearchMethods.cosine_similarity) &&
    queryEmbedding &&
    ops.nodeSimilaritySearch
  ) {
    searchResults.push(
      await ops.nodeSimilaritySearch(
        driver,
        queryEmbedding,
        searchFilter,
        groupIds,
        expandedLimit,
        nodeConfig.sim_min_score
      )
    );
  }

  if (nodeConfig.search_methods.includes(NodeSearchMethods.bm25)) {
    searchResults.push(
      await ops.nodeFulltextSearch(driver, query, searchFilter, groupIds, expandedLimit)
    );
  }

  const bfsOrigins = options.bfs_origin_node_uuids?.length
    ? options.bfs_origin_node_uuids
    : undefined;

  if (nodeConfig.search_methods.includes(NodeSearchMethods.bfs) && bfsOrigins) {
    searchResults.push(
      await ops.nodeBfsSearch(
        driver,
        bfsOrigins,
        searchFilter,
        nodeConfig.bfs_max_depth,
        groupIds,
        expandedLimit
      )
    );
  }

  if (
    nodeConfig.search_methods.includes(NodeSearchMethods.bfs) &&
    !bfsOrigins &&
    searchResults.length > 0
  ) {
    const inferredOrigins = [...new Set(searchResults.flat().map((node) => node.uuid))];
    searchResults.push(
      await ops.nodeBfsSearch(
        driver,
        inferredOrigins,
        searchFilter,
        nodeConfig.bfs_max_depth,
        groupIds,
        expandedLimit
      )
    );
  }

  return rerankNodeResults(
    ops,
    driver,
      searchResults,
      queryEmbedding,
      config.limit,
      config.reranker_min_score,
      nodeConfig.mmr_lambda,
      nodeConfig.reranker,
      options.center_node_uuid,
      query,
      crossEncoder
    );
}

async function collectEdgeSearchResults(
  ops: SearchOperations,
  driver: GraphDriver,
  query: string,
  groupIds: string[] | null | undefined,
  config: SearchConfig,
  searchFilter: SearchFilters,
  options: SearchExecutionOptions,
  crossEncoder?: CrossEncoderClient | null
): Promise<{ edges: SearchResults['edges']; scores: number[] }> {
  const edgeConfig = config.edge_config;
  if (!edgeConfig) {
    return { edges: [], scores: [] };
  }

  const searchResults: SearchResults['edges'][] = [];
  const expandedLimit = config.limit * 2;
  const queryEmbedding = options.query_embedding ?? null;

  if (
    edgeConfig.search_methods.includes(EdgeSearchMethods.cosine_similarity) &&
    queryEmbedding &&
    ops.edgeSimilaritySearch
  ) {
    searchResults.push(
      await ops.edgeSimilaritySearch(
        driver,
        queryEmbedding,
        searchFilter,
        groupIds,
        expandedLimit,
        edgeConfig.sim_min_score
      )
    );
  }

  if (edgeConfig.search_methods.includes(EdgeSearchMethods.bm25)) {
    searchResults.push(
      await ops.edgeFulltextSearch(driver, query, searchFilter, groupIds, expandedLimit)
    );
  }

  const bfsOrigins = options.bfs_origin_node_uuids?.length
    ? options.bfs_origin_node_uuids
    : undefined;

  if (edgeConfig.search_methods.includes(EdgeSearchMethods.bfs) && bfsOrigins) {
    searchResults.push(
      await ops.edgeBfsSearch(
        driver,
        bfsOrigins,
        searchFilter,
        edgeConfig.bfs_max_depth,
        groupIds,
        expandedLimit
      )
    );
  }

  if (
    edgeConfig.search_methods.includes(EdgeSearchMethods.bfs) &&
    !bfsOrigins &&
    searchResults.length > 0
  ) {
    const inferredOrigins = [
      ...new Set(searchResults.flat().map((edge) => edge.source_node_uuid))
    ];
    searchResults.push(
      await ops.edgeBfsSearch(
        driver,
        inferredOrigins,
        searchFilter,
        edgeConfig.bfs_max_depth,
        groupIds,
        expandedLimit
      )
    );
  }

  return rerankEdgeResults(
    ops,
    driver,
      searchResults,
      queryEmbedding,
      config.limit,
      config.reranker_min_score,
      edgeConfig.mmr_lambda,
      edgeConfig.reranker,
      options.center_node_uuid,
      query,
      crossEncoder
  );
}

async function collectEpisodeSearchResults(
  ops: SearchOperations,
  driver: GraphDriver,
  query: string,
  groupIds: string[] | null | undefined,
  config: SearchConfig,
  searchFilter: SearchFilters,
  crossEncoder?: CrossEncoderClient | null
): Promise<{ episodes: SearchResults['episodes']; scores: number[] }> {
  const episodeConfig = config.episode_config;
  if (!episodeConfig) {
    return { episodes: [], scores: [] };
  }

  const episodes = await ops.episodeFulltextSearch(
    driver,
    query,
    searchFilter,
    groupIds,
    config.limit * 2
  );

  return rerankEpisodeResults(
    episodes,
    config.limit,
    config.reranker_min_score,
    episodeConfig.reranker,
    query,
    crossEncoder
  );
}

async function rerankNodeResults(
  ops: SearchOperations,
  driver: GraphDriver,
  searchResults: SearchResults['nodes'][],
  queryEmbedding: number[] | null,
  limit: number,
  minScore: number,
  mmrLambda: number,
  reranker: SearchConfig['node_config'] extends infer T
    ? T extends { reranker: infer R }
      ? R
      : never
    : never,
  centerNodeUuid?: string | null,
  queryText = '',
  crossEncoder?: CrossEncoderClient | null
): Promise<{ nodes: SearchResults['nodes']; scores: number[] }> {
  const nodeMap = createFirstSeenMap(searchResults.flat(), (node) => node.uuid);
  const fused = reciprocalRankFusion(
    searchResults.map((result) => result.map((node) => node.uuid)),
    1,
    minScore
  );

  if (reranker === NodeRerankers.episode_mentions && ops.episodeMentionsReranker) {
    const reranked = await ops.episodeMentionsReranker(driver, fused.uuids, minScore);

    return {
      nodes: reranked.uuids
        .map((uuid) => nodeMap.get(uuid))
        .filter((node) => node !== undefined)
        .slice(0, limit),
      scores: reranked.scores.slice(0, limit)
    };
  }

  if (reranker === NodeRerankers.mmr) {
    if (!queryEmbedding) {
      throw new SearchRerankerError('No query embedding provided for MMR reranker');
    }

    const reranked = maximalMarginalRelevance(
      fused.uuids
        .map((uuid) => nodeMap.get(uuid))
        .filter((node) => node !== undefined),
      queryEmbedding,
      (node) => node.name_embedding,
      (node) => node.uuid,
      mmrLambda,
      minScore,
      limit
    );

    return {
      nodes: reranked.items,
      scores: reranked.scores
    };
  }

  if (reranker === NodeRerankers.cross_encoder) {
    if (!crossEncoder) {
      throw new SearchRerankerError(
        'No cross encoder configured for cross encoder reranker'
      );
    }

    const reranked = await rerankWithCrossEncoder(
      queryText,
      fused.uuids
        .map((uuid) => nodeMap.get(uuid))
        .filter((node) => node !== undefined),
      crossEncoder,
      buildNodePassage,
      (node) => node.uuid,
      minScore,
      limit
    );

    return {
      nodes: reranked.items,
      scores: reranked.scores
    };
  }

  if (reranker !== NodeRerankers.node_distance || !ops.nodeDistanceReranker) {
    return {
      nodes: fused.uuids
        .map((uuid) => nodeMap.get(uuid))
        .filter((node) => node !== undefined)
        .slice(0, limit),
      scores: fused.scores.slice(0, limit)
    };
  }

  if (!centerNodeUuid) {
    throw new SearchRerankerError('No center node provided for Node Distance reranker');
  }

  const reranked = await ops.nodeDistanceReranker(
    driver,
    fused.uuids,
    centerNodeUuid,
    minScore
  );

  return {
    nodes: reranked.uuids
      .map((uuid) => nodeMap.get(uuid))
      .filter((node) => node !== undefined)
      .slice(0, limit),
    scores: reranked.scores.slice(0, limit)
  };
}

async function rerankEdgeResults(
  ops: SearchOperations,
  driver: GraphDriver,
  searchResults: SearchResults['edges'][],
  queryEmbedding: number[] | null,
  limit: number,
  minScore: number,
  mmrLambda: number,
  reranker: SearchConfig['edge_config'] extends infer T
    ? T extends { reranker: infer R }
      ? R
      : never
    : never,
  centerNodeUuid?: string | null,
  queryText = '',
  crossEncoder?: CrossEncoderClient | null
): Promise<{ edges: SearchResults['edges']; scores: number[] }> {
  const edgeMap = createFirstSeenMap(searchResults.flat(), (edge) => edge.uuid);
  const fused = reciprocalRankFusion(
    searchResults.map((result) => result.map((edge) => edge.uuid)),
    1,
    minScore
  );

  if (reranker === EdgeRerankers.episode_mentions) {
    const edges = fused.uuids
      .map((uuid) => edgeMap.get(uuid))
      .filter((edge) => edge !== undefined)
      .sort((left, right) => {
        const rightEpisodeCount = right.episodes?.length ?? 0;
        const leftEpisodeCount = left.episodes?.length ?? 0;
        const episodeCountDifference = rightEpisodeCount - leftEpisodeCount;
        if (episodeCountDifference !== 0) {
          return episodeCountDifference;
        }

        return left.uuid.localeCompare(right.uuid);
      })
      .slice(0, limit);

    return {
      edges,
      scores: edges.map((edge) => edge.episodes?.length ?? 0)
    };
  }

  if (reranker === EdgeRerankers.mmr) {
    if (!queryEmbedding) {
      throw new SearchRerankerError('No query embedding provided for MMR reranker');
    }

    const reranked = maximalMarginalRelevance(
      fused.uuids
        .map((uuid) => edgeMap.get(uuid))
        .filter((edge) => edge !== undefined),
      queryEmbedding,
      (edge) => edge.fact_embedding,
      (edge) => edge.uuid,
      mmrLambda,
      minScore,
      limit
    );

    return {
      edges: reranked.items,
      scores: reranked.scores
    };
  }

  if (reranker === EdgeRerankers.cross_encoder) {
    if (!crossEncoder) {
      throw new SearchRerankerError(
        'No cross encoder configured for cross encoder reranker'
      );
    }

    const reranked = await rerankWithCrossEncoder(
      queryText,
      fused.uuids
        .map((uuid) => edgeMap.get(uuid))
        .filter((edge) => edge !== undefined),
      crossEncoder,
      buildEdgePassage,
      (edge) => edge.uuid,
      minScore,
      limit
    );

    return {
      edges: reranked.items,
      scores: reranked.scores
    };
  }

  if (reranker !== EdgeRerankers.node_distance || !ops.nodeDistanceReranker) {
    return {
      edges: fused.uuids
        .map((uuid) => edgeMap.get(uuid))
        .filter((edge) => edge !== undefined)
        .slice(0, limit),
      scores: fused.scores.slice(0, limit)
    };
  }

  if (!centerNodeUuid) {
    throw new SearchRerankerError('No center node provided for Node Distance reranker');
  }

  const sourceToEdges = new Map<string, SearchResults['edges']>();
  for (const edge of fused.uuids
    .map((uuid) => edgeMap.get(uuid))
    .filter((edge) => edge !== undefined)) {
    const existing = sourceToEdges.get(edge.source_node_uuid) ?? [];
    existing.push(edge);
    sourceToEdges.set(edge.source_node_uuid, existing);
  }

  const reranked = await ops.nodeDistanceReranker(
    driver,
    [...sourceToEdges.keys()],
    centerNodeUuid,
    minScore
  );

  const edges: SearchResults['edges'] = [];
  for (const sourceUuid of reranked.uuids) {
    edges.push(...(sourceToEdges.get(sourceUuid) ?? []));
  }

  return {
    edges: edges.slice(0, limit),
    scores: reranked.scores.slice(0, limit)
  };
}

async function rerankEpisodeResults(
  episodes: SearchResults['episodes'],
  limit: number,
  minScore: number,
  reranker: SearchConfig['episode_config'] extends infer T
    ? T extends { reranker: infer R }
      ? R
      : never
    : never,
  queryText = '',
  crossEncoder?: CrossEncoderClient | null
): Promise<{ episodes: SearchResults['episodes']; scores: number[] }> {
  const fused = reciprocalRankFusion([episodes.map((episode) => episode.uuid)], 1, minScore);
  const episodeMap = createFirstSeenMap(episodes, (episode) => episode.uuid);

  if (reranker === EpisodeRerankers.cross_encoder) {
    if (!crossEncoder) {
      throw new SearchRerankerError(
        'No cross encoder configured for cross encoder reranker'
      );
    }

    const reranked = await rerankWithCrossEncoder(
      queryText,
      fused.uuids
        .map((uuid) => episodeMap.get(uuid))
        .filter((episode) => episode !== undefined),
      crossEncoder,
      buildEpisodePassage,
      (episode) => episode.uuid,
      minScore,
      limit
    );

    return {
      episodes: reranked.items,
      scores: reranked.scores
    };
  }

  return {
    episodes: fused.uuids
      .map((uuid) => episodeMap.get(uuid))
      .filter((episode) => episode !== undefined)
      .slice(0, limit),
    scores: fused.scores.slice(0, limit)
  };
}

function resolveSearchOps(driver: GraphDriver): SearchOperations | undefined {
  if (driver instanceof Neo4jDriver) {
    return driver.searchOps;
  }

  if (driver instanceof FalkorDriver) {
    return driver.searchOps;
  }

  return undefined;
}

function createFirstSeenMap<T>(
  values: T[],
  getKey: (value: T) => string
): Map<string, T> {
  const result = new Map<string, T>();

  for (const value of values) {
    const key = getKey(value);
    if (!result.has(key)) {
      result.set(key, value);
    }
  }

  return result;
}

async function rerankWithCrossEncoder<T>(
  query: string,
  candidates: T[],
  crossEncoder: CrossEncoderClient,
  getPassage: (candidate: T) => string,
  getUuid: (candidate: T) => string,
  minScore: number,
  limit: number
): Promise<{ items: T[]; scores: number[] }> {
  if (candidates.length === 0) {
    return { items: [], scores: [] };
  }

  const buckets = new Map<string, T[]>();
  for (const candidate of candidates) {
    const passage = getPassage(candidate);
    const existing = buckets.get(passage) ?? [];
    existing.push(candidate);
    buckets.set(passage, existing);
  }

  const ranked = await crossEncoder.rank(
    query,
    candidates.map((candidate) => getPassage(candidate))
  );
  const items: T[] = [];
  const scores: number[] = [];

  for (const [passage, score] of ranked) {
    if (score < minScore) {
      continue;
    }

    const bucket = buckets.get(passage);
    const candidate = bucket?.shift();
    if (!candidate) {
      continue;
    }

    items.push(candidate);
    scores.push(score);
    if (items.length >= limit) {
      break;
    }
  }

  return { items, scores };
}

function buildNodePassage(node: SearchResults['nodes'][number]): string {
  return `${node.name}\n${node.summary}`.trim();
}

function buildEdgePassage(edge: SearchResults['edges'][number]): string {
  return `${edge.name}\n${edge.fact}`.trim();
}

function buildEpisodePassage(episode: SearchResults['episodes'][number]): string {
  return `${episode.name}\n${episode.source_description}\n${episode.content}`.trim();
}
