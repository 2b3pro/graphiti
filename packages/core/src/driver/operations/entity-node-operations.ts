import type { GraphDriver } from '../../contracts';
import type { EntityNode } from '../../domain/nodes';

export interface EntityNodeOperations {
  save(driver: GraphDriver, node: EntityNode): Promise<void>;
  saveBulk(driver: GraphDriver, nodes: EntityNode[]): Promise<void>;
  getByUuid(driver: GraphDriver, uuid: string): Promise<EntityNode>;
  getByUuids(driver: GraphDriver, uuids: string[]): Promise<EntityNode[]>;
  getByGroupIds(driver: GraphDriver, groupIds: string[]): Promise<EntityNode[]>;
  deleteByGroupId(driver: GraphDriver, groupId: string): Promise<void>;
}
