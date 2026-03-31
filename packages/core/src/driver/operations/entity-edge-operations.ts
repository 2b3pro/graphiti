import type { GraphDriver } from '../../contracts';
import type { EntityEdge } from '../../domain/edges';

export interface EntityEdgeOperations {
  save(driver: GraphDriver, edge: EntityEdge): Promise<void>;
  getByUuid(driver: GraphDriver, uuid: string): Promise<EntityEdge>;
  deleteByUuid(driver: GraphDriver, uuid: string): Promise<void>;
  deleteByGroupId(driver: GraphDriver, groupId: string): Promise<void>;
}
