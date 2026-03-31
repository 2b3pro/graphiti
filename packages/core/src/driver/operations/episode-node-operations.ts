import type { GraphDriver } from '../../contracts';
import type { EpisodicNode } from '../../domain/nodes';

export interface EpisodeNodeOperations {
  save(driver: GraphDriver, node: EpisodicNode): Promise<void>;
  saveBulk(driver: GraphDriver, nodes: EpisodicNode[]): Promise<void>;
  getByUuid(driver: GraphDriver, uuid: string): Promise<EpisodicNode>;
  getByUuids(driver: GraphDriver, uuids: string[]): Promise<EpisodicNode[]>;
  deleteByUuid(driver: GraphDriver, uuid: string): Promise<void>;
  deleteByGroupId(driver: GraphDriver, groupId: string): Promise<void>;
}
