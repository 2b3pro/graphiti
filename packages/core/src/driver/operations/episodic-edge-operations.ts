import type { GraphDriver } from '../../contracts';
import type { EpisodicEdge } from '../../domain/edges';

export interface EpisodicEdgeOperations {
  save(driver: GraphDriver, edge: EpisodicEdge): Promise<void>;
  saveBulk(driver: GraphDriver, edges: EpisodicEdge[]): Promise<void>;
}
