import { validateGroupId } from '@graphiti/shared';

import type { GraphDriver } from '../../contracts';
import type { EpisodicEdge } from '../../domain/edges';
import { serializeForCypher } from '../../utils/serialization';
import type { EpisodicEdgeOperations } from '../operations/episodic-edge-operations';

export class FalkorEpisodicEdgeOperations implements EpisodicEdgeOperations {
  async saveBulk(driver: GraphDriver, edges: EpisodicEdge[]): Promise<void> {
    if (edges.length === 0) return;

    for (const edge of edges) {
      validateGroupId(edge.group_id);
    }

    for (const edge of edges) {
      await driver.executeQuery(
        `
          MATCH (episode:Episodic {uuid: $episode_uuid})
          MATCH (entity:Entity {uuid: $entity_uuid})
          MERGE (episode)-[e:MENTIONS {uuid: $edge.uuid}]->(entity)
          SET e += $edge
          RETURN e.uuid AS uuid
        `,
        {
          params: {
            episode_uuid: edge.source_node_uuid,
            entity_uuid: edge.target_node_uuid,
            edge: serializeForCypher(edge)
          }
        }
      );
    }
  }

  async save(driver: GraphDriver, edge: EpisodicEdge): Promise<void> {
    validateGroupId(edge.group_id);

    await driver.executeQuery(
      `
        MATCH (episode:Episodic {uuid: $episode_uuid})
        MATCH (entity:Entity {uuid: $entity_uuid})
        MERGE (episode)-[e:MENTIONS {uuid: $edge.uuid}]->(entity)
        SET e += $edge
        RETURN e.uuid AS uuid
      `,
      {
        params: {
          episode_uuid: edge.source_node_uuid,
          entity_uuid: edge.target_node_uuid,
          edge: serializeForCypher(edge)
        }
      }
    );
  }
}
