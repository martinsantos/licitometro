export const EDITARRA_STORAGE_VERSION = 2;
export const EDITARRA_STORAGE_KEY = 'editarra:studio-state:v2';

export type EditarraStorageEnvelope<TState> = {
  product: 'editarra';
  schema: 'studio-state';
  version: typeof EDITARRA_STORAGE_VERSION;
  savedAt: string;
  state: TState;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const getBrowserStorage = (): StorageLike | undefined => (
  typeof window === 'undefined' ? undefined : window.localStorage
);

export const formatEditarraSavedAt = (date = new Date()) => (
  date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
);

export const createEditarraStorageEnvelope = <TState>(
  state: TState,
  date = new Date(),
): EditarraStorageEnvelope<TState> => ({
  product: 'editarra',
  schema: 'studio-state',
  version: EDITARRA_STORAGE_VERSION,
  savedAt: formatEditarraSavedAt(date),
  state,
});

export const parseStoredEditarraState = <TState>(rawState: string | null): Partial<TState> => {
  if (!rawState) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawState);

    if (!isRecord(parsed)) {
      return {};
    }

    if (
      parsed.product === 'editarra'
      && parsed.schema === 'studio-state'
      && isRecord(parsed.state)
    ) {
      return parsed.state as Partial<TState>;
    }

    return parsed as Partial<TState>;
  } catch {
    return {};
  }
};

export const readStoredEditarraState = <TState>(
  storage: StorageLike | undefined = getBrowserStorage(),
): Partial<TState> => (
  parseStoredEditarraState<TState>(storage?.getItem(EDITARRA_STORAGE_KEY) || null)
);

export const persistStoredEditarraState = <TState>(
  state: TState,
  options: {
    storage?: StorageLike;
    date?: Date;
  } = {},
) => {
  const storage = options.storage || getBrowserStorage();
  const envelope = createEditarraStorageEnvelope(state, options.date);

  storage?.setItem(EDITARRA_STORAGE_KEY, JSON.stringify(envelope));

  return {
    savedAt: envelope.savedAt,
    envelope,
  };
};

export const clearStoredEditarraState = (
  storage: StorageLike | undefined = getBrowserStorage(),
) => {
  storage?.removeItem(EDITARRA_STORAGE_KEY);
};
