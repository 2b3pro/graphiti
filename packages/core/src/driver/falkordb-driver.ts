import { GraphProviders } from '@graphiti/shared';
import { FalkorDB, type FalkorDBOptions } from 'falkordb';

import type {
  AsyncDisposableTransaction,
  GraphDriverSession,
  QueryOptions,
  QueryResult
} from '../contracts';
import { BaseGraphDriver } from './graph-driver';
import { FalkorEntityEdgeOperations } from './falkordb/falkordb-entity-edge-operations';
import { FalkorEntityNodeOperations } from './falkordb/falkordb-entity-node-operations';
import { FalkorEpisodeNodeOperations } from './falkordb/falkordb-episode-node-operations';
import { FalkorEpisodicEdgeOperations } from './falkordb/falkordb-episodic-edge-operations';
import { FalkorSearchOperations } from './falkordb/falkordb-search-operations';
import type { EntityEdgeOperations } from './operations/entity-edge-operations';
import type { EntityNodeOperations } from './operations/entity-node-operations';
import type { EpisodeNodeOperations } from './operations/episode-node-operations';
import type { EpisodicEdgeOperations } from './operations/episodic-edge-operations';
import type { SearchOperations } from './operations/search-operations';

export interface FalkorConnectionConfig {
  host?: string;
  port?: number;
  username?: string | null;
  password?: string | null;
  url?: string;
  database?: string;
}

export interface FalkorQueryReply<RecordShape = unknown> {
  data?: RecordShape[];
  headers?: string[];
}

export interface FalkorGraphAdapter {
  query<RecordShape = unknown>(
    query: string,
    options?: { params?: Record<string, unknown> }
  ): Promise<FalkorQueryReply<RecordShape>>;
  roQuery<RecordShape = unknown>(
    query: string,
    options?: { params?: Record<string, unknown> }
  ): Promise<FalkorQueryReply<RecordShape>>;
  createNodeRangeIndex(label: string, ...properties: string[]): Promise<unknown>;
  createNodeFulltextIndex(label: string, ...properties: string[]): Promise<unknown>;
  createEdgeRangeIndex(label: string, ...properties: string[]): Promise<unknown>;
  createEdgeFulltextIndex(label: string, ...properties: string[]): Promise<unknown>;
  delete(): Promise<void>;
}

export interface FalkorClientAdapter {
  selectGraph(graphId: string): FalkorGraphAdapter;
  close(): Promise<void>;
}

export class FalkorDriver extends BaseGraphDriver {
  readonly provider = GraphProviders.FALKORDB;
  readonly default_group_id = '\\_';
  readonly config: FalkorConnectionConfig;
  readonly client: FalkorClientAdapter;
  readonly entityNodeOps: EntityNodeOperations;
  readonly entityEdgeOps: EntityEdgeOperations;
  readonly episodeNodeOps: EpisodeNodeOperations;
  readonly episodicEdgeOps: EpisodicEdgeOperations;
  readonly searchOps: SearchOperations;

  constructor(config: FalkorConnectionConfig, client: FalkorClientAdapter) {
    super(config.database ?? 'default_db');
    this.config = {
      ...config,
      database: config.database ?? 'default_db'
    };
    this.client = client;
    this.entityNodeOps = new FalkorEntityNodeOperations();
    this.entityEdgeOps = new FalkorEntityEdgeOperations();
    this.episodeNodeOps = new FalkorEpisodeNodeOperations();
    this.episodicEdgeOps = new FalkorEpisodicEdgeOperations();
    this.searchOps = new FalkorSearchOperations();
  }

  async executeQuery<RecordShape = unknown>(
    cypherQuery: string,
    options: QueryOptions = {}
  ): Promise<QueryResult<RecordShape>> {
    const graph = this.client.selectGraph(options.database ?? this.database);
    const queryOptions = options.params ? { params: options.params } : undefined;
    const reply =
      options.routing === 'r'
        ? await graph.roQuery<RecordShape>(cypherQuery, queryOptions)
        : await graph.query<RecordShape>(cypherQuery, queryOptions);

    const result: QueryResult<RecordShape> = {
      records: reply.data ?? []
    };

    if (reply.headers) {
      result.keys = reply.headers;
    }

    return result;
  }

  session(database?: string): GraphDriverSession {
    return new FalkorSessionAdapter(this.client.selectGraph(database ?? this.database));
  }

  async transaction(): Promise<AsyncDisposableTransaction> {
    return new FalkorTransactionAdapter(this.session());
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  async deleteAllIndexes(): Promise<void> {}

  async buildIndicesAndConstraints(_deleteExisting = false): Promise<void> {
    const graph = this.client.selectGraph(this.database);

    await graph.createNodeRangeIndex('Entity', 'uuid');
    await graph.createNodeRangeIndex('Episodic', 'uuid');
    await graph.createNodeRangeIndex('Entity', 'group_id');
    await graph.createNodeRangeIndex('Episodic', 'group_id');
    await graph.createNodeFulltextIndex('Entity', 'name');
    await graph.createNodeFulltextIndex('Episodic', 'name');
    await graph.createEdgeRangeIndex('RELATES_TO', 'uuid');
    await graph.createEdgeFulltextIndex('RELATES_TO', 'name');
  }
}

export async function createFalkorClientAdapter(
  config: FalkorConnectionConfig
): Promise<FalkorClientAdapter> {
  const options: FalkorDBOptions = { url: config.url ?? buildFalkorUrl(config) };

  if (config.username) {
    options.username = config.username;
  }

  if (config.password) {
    options.password = config.password;
  }

  const client = await FalkorDB.connect(options);
  return new OfficialFalkorClientAdapter(client);
}

class OfficialFalkorClientAdapter implements FalkorClientAdapter {
  constructor(private readonly client: InstanceType<typeof FalkorDB>) {}

  selectGraph(graphId: string): FalkorGraphAdapter {
    return this.client.selectGraph(graphId);
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

class FalkorSessionAdapter implements GraphDriverSession {
  constructor(private readonly graph: FalkorGraphAdapter) {}

  async executeQuery<RecordShape = unknown>(
    cypherQuery: string,
    options: QueryOptions = {}
  ): Promise<QueryResult<RecordShape>> {
    const queryOptions = options.params ? { params: options.params } : undefined;
    const reply =
      options.routing === 'r'
        ? await this.graph.roQuery<RecordShape>(cypherQuery, queryOptions)
        : await this.graph.query<RecordShape>(cypherQuery, queryOptions);

    const result: QueryResult<RecordShape> = {
      records: reply.data ?? []
    };

    if (reply.headers) {
      result.keys = reply.headers;
    }

    return result;
  }

  async close(): Promise<void> {}
}

class FalkorTransactionAdapter implements AsyncDisposableTransaction {
  constructor(private readonly session: GraphDriverSession) {}

  async run<RecordShape = unknown>(
    query: string,
    params: Record<string, unknown> = {}
  ): Promise<QueryResult<RecordShape>> {
    return this.session.executeQuery<RecordShape>(query, { params });
  }

  async commit(): Promise<void> {
    await this.session.close();
  }

  async rollback(): Promise<void> {
    await this.session.close();
  }
}

function buildFalkorUrl(config: FalkorConnectionConfig): string {
  const host = config.host ?? '127.0.0.1';
  const port = config.port ?? 6379;

  return `redis://${host}:${port}`;
}
