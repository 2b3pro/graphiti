import type {
  AsyncDisposableTransaction,
  GraphDriver,
  GraphDriverSession,
  QueryOptions,
  QueryResult
} from '@graphiti/core';

export class FakeTransaction implements AsyncDisposableTransaction {
  committed = false;
  rolledBack = false;

  async run<RecordShape = unknown>(): Promise<QueryResult<RecordShape>> {
    return { records: [] };
  }

  async commit(): Promise<void> {
    this.committed = true;
  }

  async rollback(): Promise<void> {
    this.rolledBack = true;
  }
}

export class FakeDriver implements GraphDriver {
  readonly provider = 'neo4j';
  readonly default_group_id = '';
  readonly database = 'neo4j';
  calls: Array<{ cypherQuery: string; options?: QueryOptions }> = [];

  constructor(
    private readonly transactionInstance: FakeTransaction = new FakeTransaction(),
    private readonly records?: {
      entity?: Record<string, unknown>;
      episode?: Record<string, unknown>;
      namedEntities?: Record<string, unknown>[];
      keyedEdges?: Record<string, unknown>[];
    }
  ) {}

  async executeQuery<RecordShape = unknown>(
    cypherQuery: string,
    options?: QueryOptions
  ): Promise<QueryResult<RecordShape>> {
    if (options) {
      this.calls.push({ cypherQuery, options });
    } else {
      this.calls.push({ cypherQuery });
    }

    if (cypherQuery.includes('MATCH (n:Entity {uuid: $uuid})')) {
      return {
        records: this.records?.entity ? [this.records.entity as RecordShape] : []
      };
    }

    if (cypherQuery.includes('MATCH (n:Episodic {uuid: $uuid})')) {
      return {
        records: this.records?.episode ? [this.records.episode as RecordShape] : []
      };
    }

    if (
      cypherQuery.includes('MATCH (n:Entity)') &&
      cypherQuery.includes('WHERE n.group_id = $group_id') &&
      !cypherQuery.includes('UNWIND $edge_keys AS edge_key')
    ) {
      return {
        records: (this.records?.namedEntities ?? []) as RecordShape[]
      };
    }

    if (cypherQuery.includes('UNWIND $edge_keys AS edge_key')) {
      return {
        records: (this.records?.keyedEdges ?? []) as RecordShape[]
      };
    }

    return { records: [] };
  }

  session(): GraphDriverSession {
    throw new Error('not used in tests');
  }

  transaction(): AsyncDisposableTransaction {
    return this.transactionInstance;
  }

  async close(): Promise<void> {}

  async deleteAllIndexes(): Promise<void> {}

  async buildIndicesAndConstraints(): Promise<void> {}
}
