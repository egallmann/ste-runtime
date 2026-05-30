type DecoratedFunction = (...args: any[]) => any;

function normalizeIds(label: string, ids: string[]): readonly string[] {
  if (ids.length === 0) {
    throw new Error(`${label} requires at least one identifier`);
  }
  const normalized = ids.map(id => {
    if (typeof id !== 'string') {
      throw new TypeError(`${label} identifiers must be strings`);
    }
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error(`${label} identifiers must not be empty`);
    }
    return trimmed;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} identifiers must be unique after normalization`);
  }
  return Object.freeze(normalized);
}

function attachAdrMetadata<T extends DecoratedFunction>(target: T, adrIds: readonly string[]): T {
  Object.defineProperty(target, '__implements_adrs__', {
    configurable: false,
    enumerable: false,
    value: adrIds,
    writable: false,
  });
  return target;
}

function attachInvariantMetadata<T extends DecoratedFunction>(
  target: T,
  invariantIds: readonly string[],
): T {
  Object.defineProperty(target, '__enforces_invariants__', {
    configurable: false,
    enumerable: false,
    value: invariantIds,
    writable: false,
  });
  return target;
}

function createLinkageDecorator<T extends DecoratedFunction>(
  label: string,
  ids: string[],
  attach: (target: T, normalized: readonly string[]) => T,
): (target: T) => T {
  const normalized = normalizeIds(label, ids);

  const linkage = (...args: unknown[]): unknown => {
    if (args.length === 1 && typeof args[0] === 'function') {
      return attach(args[0] as T, normalized);
    }

    const descriptor = args[2] as PropertyDescriptor | undefined;
    if (descriptor?.value && typeof descriptor.value === 'function') {
      attach(descriptor.value as T, normalized);
      return descriptor;
    }

    if (args.length >= 1 && typeof args[0] === 'function') {
      attach(args[0] as T, normalized);
    }

    return undefined;
  };

  return linkage as (target: T) => T;
}

export function implements_adr<T extends DecoratedFunction>(...adrIds: string[]): (target: T) => T {
  return createLinkageDecorator('implements_adr', adrIds, attachAdrMetadata);
}

/** Method/class `@implements_adr_method('ADR-L-XXXX')` — same semantics as `implements_adr`. */
export function implements_adr_method(...adrIds: string[]): MethodDecorator {
  return createLinkageDecorator('implements_adr', adrIds, attachAdrMetadata) as unknown as MethodDecorator;
}

export function enforces_invariant<T extends DecoratedFunction>(
  ...invariantIds: string[]
): (target: T) => T {
  return createLinkageDecorator('enforces_invariant', invariantIds, attachInvariantMetadata);
}
