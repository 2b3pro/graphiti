import type { CrossEncoderClient, EmbedderClient, LLMClient } from '@graphiti/core';
import type { Tracer } from '@graphiti/core';

export class FakeEmbedder implements EmbedderClient {
  calls: string[] = [];

  constructor(private readonly embedding: number[] = [0, 0]) {}

  async create(
    inputData: string | string[] | Iterable<number> | Iterable<Iterable<number>>
  ): Promise<number[]> {
    if (typeof inputData === 'string') {
      this.calls.push(inputData);
    } else if (Array.isArray(inputData) && typeof inputData[0] === 'string') {
      this.calls.push(String(inputData[0]));
    }

    return this.embedding;
  }
}

export class SemanticEmbedder implements EmbedderClient {
  calls: string[] = [];

  constructor(private readonly embeddings: Record<string, number[]>) {}

  async create(
    inputData: string | string[] | Iterable<number> | Iterable<Iterable<number>>
  ): Promise<number[]> {
    const value =
      typeof inputData === 'string'
        ? inputData
        : Array.isArray(inputData) && typeof inputData[0] === 'string'
          ? String(inputData[0])
          : '';

    this.calls.push(value);
    return this.embeddings[value] ?? [0, 0];
  }
}

export class FakeCrossEncoder implements CrossEncoderClient {
  async rank(query: string, passages: string[]): Promise<Array<[string, number]>> {
    return passages
      .map(
        (passage) =>
          [passage, crossEncoderScore(query, passage)] as [string, number]
      )
      .sort((left, right) => right[1] - left[1]);
  }
}

export class FakeLLMClient implements LLMClient {
  readonly model = 'fake-model';
  readonly small_model = null;
  calls: Array<{ role: string; content: string }[]> = [];

  setTracer(_tracer: Tracer): void {}

  async generateText(
    messages: Array<{ role: string; content: string }>
  ): Promise<string> {
    this.calls.push(messages);

    return JSON.stringify({
      entities: [{ name: 'Alice', labels: ['Person'], summary: 'Engineer' }],
      entity_edges: [
        {
          source: 'Alice',
          target: 'Bob',
          name: 'works_with',
          fact: 'Alice works with Bob'
        }
      ]
    });
  }
}

export class FakeHydrationLLMClient implements LLMClient {
  readonly model = 'fake-model';
  readonly small_model = null;
  calls: Array<{ role: string; content: string }[]> = [];

  setTracer(_tracer: Tracer): void {}

  async generateText(
    messages: Array<{ role: string; content: string }>
  ): Promise<string> {
    this.calls.push(messages);

    return JSON.stringify({
      entities: [
        {
          uuid: 'entity-1',
          summary: 'Alice is a trusted collaborator.',
          attributes: {
            role: 'engineer'
          }
        }
      ]
    });
  }
}

function crossEncoderScore(query: string, passage: string): number {
  const queryWords = new Set(query.toLowerCase().split(/\s+/));
  const passageWords = passage.toLowerCase().split(/\s+/);
  let matches = 0;

  for (const word of passageWords) {
    if (queryWords.has(word)) {
      matches++;
    }
  }

  return passageWords.length > 0 ? matches / passageWords.length : 0;
}
