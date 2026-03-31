import type { Tracer } from './tracing';
import type { Message } from './prompts/types';

export interface QueryResult<RecordShape = unknown> {
  records: RecordShape[];
  summary?: unknown;
  keys?: string[];
}

export interface QueryExecutor {
  executeQuery<RecordShape = unknown>(
    cypherQuery: string,
    options?: QueryOptions
  ): Promise<QueryResult<RecordShape>>;
}

export interface Transaction {
  run<RecordShape = unknown>(
    query: string,
    params?: Record<string, unknown>
  ): Promise<QueryResult<RecordShape>>;
}

export interface GraphDriverSession extends QueryExecutor {
  close(): Promise<void>;
}

export interface GraphDriver extends QueryExecutor {
  readonly provider: string;
  readonly default_group_id: string;
  readonly database: string;
  session(database?: string): Promise<GraphDriverSession> | GraphDriverSession;
  transaction(): Promise<AsyncDisposableTransaction> | AsyncDisposableTransaction;
  close(): Promise<void>;
  deleteAllIndexes(): Promise<void>;
  buildIndicesAndConstraints(deleteExisting?: boolean): Promise<void>;
}

export interface AsyncDisposableTransaction extends Transaction {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface LLMClient {
  readonly model: string | null;
  readonly small_model: string | null;
  setTracer(tracer: Tracer): void;
  generateText(messages: Message[]): Promise<string>;
}

export interface EmbedderClient {
  create(inputData: string | string[] | Iterable<number> | Iterable<Iterable<number>>): Promise<number[]>;
  createBatch?(inputDataList: string[]): Promise<number[][]>;
}

export interface CrossEncoderClient {
  rank(query: string, passages: string[]): Promise<Array<[string, number]>>;
}

export interface GraphitiClients {
  driver: GraphDriver;
  llm_client: LLMClient;
  embedder: EmbedderClient;
  cross_encoder: CrossEncoderClient;
  tracer: Tracer;
}

export interface QueryOptions {
  params?: Record<string, unknown>;
  routing?: 'r' | 'w';
  database?: string;
}
