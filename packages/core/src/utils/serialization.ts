export function serializeForCypher<T>(value: T): T {
  if (value instanceof Date) {
    return value.toISOString() as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeForCypher(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) => {
        if (item === undefined) {
          return [];
        }

        return [[key, serializeForCypher(item)]];
      })
    ) as T;
  }

  return value;
}
