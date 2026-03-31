import type { GraphDriver } from '../../contracts';
import type { EntityNode } from '../../domain/nodes';

export interface EntityNodeOperations {
  save(driver: GraphDriver, node: EntityNode): Promise<void>;
  getByUuid(driver: GraphDriver, uuid: string): Promise<EntityNode>;
  deleteByGroupId(driver: GraphDriver, groupId: string): Promise<void>;
}
