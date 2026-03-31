import { NodeNotFoundError, validateGroupId } from '@graphiti/shared';

import type { GraphDriver } from '../../contracts';
import type { EpisodicNode } from '../../domain/nodes';
import { mapEpisodeNode } from '../../namespaces/nodes';
import { type RecordLike } from '../../utils/records';
import { serializeForCypher } from '../../utils/serialization';
import type { EpisodeNodeOperations } from '../operations/episode-node-operations';

export class FalkorEpisodeNodeOperations implements EpisodeNodeOperations {
  async save(driver: GraphDriver, node: EpisodicNode): Promise<void> {
    validateGroupId(node.group_id);

    await driver.executeQuery(
      `
        MERGE (n:Episodic {uuid: $episode.uuid})
        SET n += $episode
        SET n:Episodic
        RETURN n.uuid AS uuid
      `,
      {
        params: {
          episode: serializeForCypher(node)
        }
      }
    );
  }

  async getByUuid(driver: GraphDriver, uuid: string): Promise<EpisodicNode> {
    const result = await driver.executeQuery<RecordLike>(
      `
        MATCH (n:Episodic {uuid: $uuid})
        RETURN
          n.uuid AS uuid,
          n.name AS name,
          n.group_id AS group_id,
          coalesce(n.labels, labels(n)) AS labels,
          n.created_at AS created_at,
          n.source AS source,
          n.source_description AS source_description,
          n.content AS content,
          n.valid_at AS valid_at,
          n.entity_edges AS entity_edges
      `,
      { params: { uuid }, routing: 'r' }
    );

    const record = result.records[0];
    if (!record) {
      throw new NodeNotFoundError(uuid);
    }

    return mapEpisodeNode(record);
  }

  async deleteByUuid(driver: GraphDriver, uuid: string): Promise<void> {
    const result = await driver.executeQuery<{ deleted_count: number }>(
      `
        MATCH (n:Episodic {uuid: $uuid})
        WITH collect(n) AS nodes
        FOREACH (node IN nodes | DETACH DELETE node)
        RETURN size(nodes) AS deleted_count
      `,
      { params: { uuid } }
    );

    if ((result.records[0]?.deleted_count ?? 0) === 0) {
      throw new NodeNotFoundError(uuid);
    }
  }

  async deleteByGroupId(driver: GraphDriver, groupId: string): Promise<void> {
    validateGroupId(groupId);

    await driver.executeQuery(
      `
        MATCH (n:Episodic)
        WHERE n.group_id = $group_id
        WITH collect(n) AS nodes
        FOREACH (node IN nodes | DETACH DELETE node)
        RETURN size(nodes) AS deleted_count
      `,
      { params: { group_id: groupId } }
    );
  }
}
