import type { GraphDriver } from '../../contracts';
import type { EpisodicNode } from '../../domain/nodes';

export interface EpisodeNodeOperations {
  save(driver: GraphDriver, node: EpisodicNode): Promise<void>;
  getByUuid(driver: GraphDriver, uuid: string): Promise<EpisodicNode>;
  deleteByUuid(driver: GraphDriver, uuid: string): Promise<void>;
  deleteByGroupId(driver: GraphDriver, groupId: string): Promise<void>;
}
