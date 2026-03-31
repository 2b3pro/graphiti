import { EdgeNotFoundError, validateGroupId } from '@graphiti/shared';

import type { EmbedderClient, GraphDriver } from '../contracts';
import type { EntityEdge, EpisodicEdge } from '../domain/edges';
import { getRecordValue, parseDateValue, type RecordLike } from '../utils/records';
import { serializeForCypher } from '../utils/serialization';
import type { EntityEdgeOperations } from '../driver/operations/entity-edge-operations';
import type { EpisodicEdgeOperations } from '../driver/operations/episodic-edge-operations';
import { FalkorDriver } from '../driver/falkordb-driver';
import { Neo4jDriver } from '../driver/neo4j-driver';

export class EntityEdgeNamespace {
  constructor(
    private readonly driver: GraphDriver,
    private readonly embedder?: EmbedderClient | null,
    private readonly ops?: EntityEdgeOperations
  ) {}

  async save(edge: EntityEdge): Promise<EntityEdge> {
    validateGroupId(edge.group_id);

    if (!edge.fact_embedding && this.embedder) {
      edge.fact_embedding = await this.embedder.create([edge.fact.replaceAll('\n', ' ')]);
    }

    const ops = this.ops ?? resolveEntityEdgeOps(this.driver);
    if (ops) {
      await ops.save(this.driver, edge);
      return edge;
    }

    await this.driver.executeQuery(
      `
        MATCH (source:Entity {uuid: $source_uuid})
        MATCH (target:Entity {uuid: $target_uuid})
        MERGE (source)-[e:RELATES_TO {uuid: $edge.uuid}]->(target)
        SET e += $edge
        RETURN e.uuid AS uuid
      `,
      {
        params: {
          source_uuid: edge.source_node_uuid,
          target_uuid: edge.target_node_uuid,
          edge: serializeForCypher(edge)
        }
      }
    );

    return edge;
  }

  async getByUuid(uuid: string): Promise<EntityEdge> {
    const ops = this.ops ?? resolveEntityEdgeOps(this.driver);
    if (ops) {
      return ops.getByUuid(this.driver, uuid);
    }

    const result = await this.driver.executeQuery<RecordLike>(
      `
        MATCH (source:Entity)-[e:RELATES_TO {uuid: $uuid}]->(target:Entity)
        RETURN
          e.uuid AS uuid,
          e.group_id AS group_id,
          source.uuid AS source_node_uuid,
          target.uuid AS target_node_uuid,
          e.created_at AS created_at,
          e.name AS name,
          e.fact AS fact,
          e.fact_embedding AS fact_embedding,
          e.episodes AS episodes,
          e.expired_at AS expired_at,
          e.valid_at AS valid_at,
          e.invalid_at AS invalid_at
      `,
      { params: { uuid }, routing: 'r' }
    );

    const record = result.records[0];
    if (!record) {
      throw new EdgeNotFoundError(uuid);
    }

    return mapEntityEdge(record);
  }

  async deleteByUuid(uuid: string): Promise<void> {
    const ops = this.ops ?? resolveEntityEdgeOps(this.driver);
    if (ops) {
      await ops.deleteByUuid(this.driver, uuid);
      return;
    }

    const result = await this.driver.executeQuery<{ deleted_count: number }>(
      `
        MATCH ()-[e:RELATES_TO {uuid: $uuid}]->()
        WITH collect(e) AS edges
        FOREACH (edge IN edges | DELETE edge)
        RETURN size(edges) AS deleted_count
      `,
      { params: { uuid } }
    );

    if ((result.records[0]?.deleted_count ?? 0) === 0) {
      throw new EdgeNotFoundError(uuid);
    }
  }

  async deleteByGroupId(groupId: string): Promise<void> {
    validateGroupId(groupId);

    const ops = this.ops ?? resolveEntityEdgeOps(this.driver);
    if (ops) {
      await ops.deleteByGroupId(this.driver, groupId);
      return;
    }

    await this.driver.executeQuery(
      `
        MATCH ()-[e:RELATES_TO]->()
        WHERE e.group_id = $group_id
        WITH collect(e) AS edges
        FOREACH (edge IN edges | DELETE edge)
        RETURN size(edges) AS deleted_count
      `,
      { params: { group_id: groupId } }
    );
  }
}

export class EpisodicEdgeNamespace {
  constructor(
    private readonly driver: GraphDriver,
    private readonly ops?: EpisodicEdgeOperations
  ) {}

  async save(edge: EpisodicEdge): Promise<EpisodicEdge> {
    validateGroupId(edge.group_id);

    const ops = this.ops ?? resolveEpisodicEdgeOps(this.driver);
    if (ops) {
      await ops.save(this.driver, edge);
      return edge;
    }

    await this.driver.executeQuery(
      `
        MATCH (episode:Episodic {uuid: $source_uuid})
        MATCH (entity:Entity {uuid: $target_uuid})
        MERGE (episode)-[e:MENTIONS {uuid: $edge.uuid}]->(entity)
        SET e += $edge
        RETURN e.uuid AS uuid
      `,
      {
        params: {
          source_uuid: edge.source_node_uuid,
          target_uuid: edge.target_node_uuid,
          edge: serializeForCypher(edge)
        }
      }
    );

    return edge;
  }
}

export interface EdgeNamespaceApi {
  entity: EntityEdgeNamespace;
  episodic: EpisodicEdgeNamespace;
}

export function createEdgeNamespace(
  driver: GraphDriver,
  embedder?: EmbedderClient | null
): EdgeNamespaceApi {
  const ops = resolveEntityEdgeOps(driver);
  const episodicOps = resolveEpisodicEdgeOps(driver);

  return {
    entity: new EntityEdgeNamespace(driver, embedder, ops),
    episodic: new EpisodicEdgeNamespace(driver, episodicOps)
  };
}

export function mapEntityEdge(record: RecordLike): EntityEdge {
  return {
    uuid: getRecordValue<string>(record, 'uuid') ?? '',
    group_id: getRecordValue<string>(record, 'group_id') ?? '',
    source_node_uuid: getRecordValue<string>(record, 'source_node_uuid') ?? '',
    target_node_uuid: getRecordValue<string>(record, 'target_node_uuid') ?? '',
    created_at: parseDateValue(getRecordValue(record, 'created_at')) ?? new Date(),
    name: getRecordValue<string>(record, 'name') ?? '',
    fact: getRecordValue<string>(record, 'fact') ?? '',
    fact_embedding: getRecordValue<number[] | null>(record, 'fact_embedding') ?? null,
    episodes: getRecordValue<string[]>(record, 'episodes') ?? [],
    expired_at: parseDateValue(getRecordValue(record, 'expired_at')),
    valid_at: parseDateValue(getRecordValue(record, 'valid_at')),
    invalid_at: parseDateValue(getRecordValue(record, 'invalid_at'))
  };
}

function resolveEntityEdgeOps(driver: GraphDriver): EntityEdgeOperations | undefined {
  if (driver instanceof Neo4jDriver) {
    return driver.entityEdgeOps;
  }

  if (driver instanceof FalkorDriver) {
    return driver.entityEdgeOps;
  }

  return undefined;
}

function resolveEpisodicEdgeOps(driver: GraphDriver): EpisodicEdgeOperations | undefined {
  if (driver instanceof Neo4jDriver) {
    return driver.episodicEdgeOps;
  }

  if (driver instanceof FalkorDriver) {
    return driver.episodicEdgeOps;
  }

  return undefined;
}
