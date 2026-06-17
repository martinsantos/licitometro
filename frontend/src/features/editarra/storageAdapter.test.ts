import {
  EDITARRA_STORAGE_KEY,
  createEditarraStorageEnvelope,
  clearStoredEditarraState,
  formatEditarraSavedAt,
  parseStoredEditarraState,
  persistStoredEditarraState,
  readStoredEditarraState,
} from './storageAdapter';

type StorageState = {
  selectedSiteId?: string;
  selectedRecipeId?: string;
  authors?: Array<{ name: string }>;
};

const fixedDate = new Date('2026-06-05T15:42:00-03:00');

function createMemoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('storageAdapter', () => {
  it('reads legacy raw state so existing local work is not discarded', () => {
    const parsed = parseStoredEditarraState<StorageState>(JSON.stringify({
      selectedSiteId: 'editarra-studio',
      selectedRecipeId: 'reactiva',
    }));

    expect(parsed).toEqual({
      selectedSiteId: 'editarra-studio',
      selectedRecipeId: 'reactiva',
    });
  });

  it('reads the versioned EDITARRA envelope and ignores wrapper metadata', () => {
    const envelope = createEditarraStorageEnvelope<StorageState>({
      selectedSiteId: 'umsa-diaria',
      authors: [{ name: 'Editor' }],
    }, fixedDate);
    const parsed = parseStoredEditarraState<StorageState>(JSON.stringify(envelope));

    expect(envelope).toMatchObject({
      product: 'editarra',
      schema: 'studio-state',
      version: 2,
      savedAt: formatEditarraSavedAt(fixedDate),
    });
    expect(parsed).toEqual({
      selectedSiteId: 'umsa-diaria',
      authors: [{ name: 'Editor' }],
    });
  });

  it('persists and clears the envelope through the storage key', () => {
    const storage = createMemoryStorage();
    const result = persistStoredEditarraState<StorageState>({
      selectedSiteId: 'editarra-studio',
      selectedRecipeId: 'evergreen',
    }, { storage, date: fixedDate });

    expect(result.savedAt).toBe(formatEditarraSavedAt(fixedDate));
    expect(storage.getItem(EDITARRA_STORAGE_KEY)).toContain('"schema":"studio-state"');
    expect(readStoredEditarraState<StorageState>(storage)).toEqual({
      selectedSiteId: 'editarra-studio',
      selectedRecipeId: 'evergreen',
    });

    clearStoredEditarraState(storage);
    expect(readStoredEditarraState<StorageState>(storage)).toEqual({});
  });

  it('returns an empty state for malformed storage payloads', () => {
    expect(parseStoredEditarraState<StorageState>('not-json')).toEqual({});
    expect(parseStoredEditarraState<StorageState>('[]')).toEqual({});
  });
});
