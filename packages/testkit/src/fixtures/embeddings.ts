export const DEFAULT_EMBEDDING_DIM = 384;

export const ZERO_EMBEDDING: number[] = new Array(DEFAULT_EMBEDDING_DIM).fill(0);

export const UNIT_EMBEDDING: number[] = (() => {
  const magnitude = Math.sqrt(DEFAULT_EMBEDDING_DIM);
  return new Array(DEFAULT_EMBEDDING_DIM).fill(1 / magnitude);
})();

export function createDeterministicEmbedding(seed: number, dim = DEFAULT_EMBEDDING_DIM): number[] {
  const embedding = new Array(dim);
  let state = seed;

  for (let i = 0; i < dim; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    embedding[i] = (state / 0x7fffffff) * 2 - 1;
  }

  const magnitude = Math.sqrt(
    embedding.reduce((sum: number, val: number) => sum + val * val, 0)
  );

  if (magnitude === 0) {
    return embedding;
  }

  return embedding.map((val: number) => val / magnitude);
}
