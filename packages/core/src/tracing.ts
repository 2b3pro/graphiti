export interface TracerSpan {
  addAttributes(attributes: Record<string, unknown>): void;
  setStatus(status: 'ok' | 'error' | string, description?: string | null): void;
  recordException(exception: Error): void;
}

export interface TracerScope<TSpan extends TracerSpan = TracerSpan> {
  span: TSpan;
  close(): void;
}

export interface Tracer {
  startSpan(name: string): TracerScope;
}

export class NoOpSpan implements TracerSpan {
  addAttributes(_attributes: Record<string, unknown>): void {}

  setStatus(_status: 'ok' | 'error' | string, _description?: string | null): void {}

  recordException(_exception: Error): void {}
}

export class NoOpTracer implements Tracer {
  startSpan(_name: string): TracerScope<NoOpSpan> {
    return {
      span: new NoOpSpan(),
      close(): void {}
    };
  }
}

export function createTracer(otelTracer?: Tracer | null): Tracer {
  return otelTracer ?? new NoOpTracer();
}
