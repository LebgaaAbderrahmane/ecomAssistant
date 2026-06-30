import { Repository } from 'typeorm';
import { LidMappingStoreService } from './lid-mapping-store.service';
import { LidMapping } from './lid-mapping.entity';

/** Minimal in-memory stand-in for the TypeORM repo: just the find()/upsert() the store uses. */
function makeFakeRepo(seed: Partial<LidMapping>[] = []) {
  const rows: LidMapping[] = seed.map(r => ({ lid: '', phone: null, sessionId: null, updatedAt: new Date(0), ...r }));
  return {
    rows,
    find: jest.fn().mockImplementation(() => Promise.resolve(rows.map(r => ({ ...r })))),
    upsert: jest.fn().mockImplementation((values: Partial<LidMapping>) => {
      const i = rows.findIndex(r => r.lid === values.lid);
      if (i >= 0) rows[i] = { ...rows[i], ...values };
      else rows.push(values as LidMapping);
      return Promise.resolve({});
    }),
  };
}

async function newStore(repo: ReturnType<typeof makeFakeRepo>): Promise<LidMappingStoreService> {
  const store = new LidMappingStoreService(repo as unknown as Repository<LidMapping>);
  await store.onModuleInit();
  return store;
}

describe('LidMappingStoreService', () => {
  it('loads the persisted table into the cache on boot (forward + reverse)', async () => {
    const store = await newStore(makeFakeRepo([{ lid: '111', phone: '628999' }]));
    expect(store.getCached('111')).toBe('628999');
    expect(store.lidsForPhone('628999')).toEqual(['111']);
  });

  it('returns undefined for an unseen lid', async () => {
    const store = await newStore(makeFakeRepo());
    expect(store.getCached('nope')).toBeUndefined();
    expect(store.lidsForPhone('628999')).toEqual([]);
  });

  it('writes a learned mapping through to cache and persistence', async () => {
    const repo = makeFakeRepo();
    const store = await newStore(repo);
    await store.remember('222', '628888', 'sess-1');
    expect(store.getCached('222')).toBe('628888');
    expect(store.lidsForPhone('628888')).toEqual(['222']);
    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ lid: '222', phone: '628888', sessionId: 'sess-1' }),
      ['lid'],
    );
  });

  it('caches a negative result (lid known-but-unresolved)', async () => {
    const repo = makeFakeRepo();
    const store = await newStore(repo);
    await store.remember('333', null);
    expect(store.getCached('333')).toBeNull();
    expect(store.lidsForPhone('anything')).toEqual([]);
    expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ lid: '333', phone: null }), ['lid']);
  });

  it('is last-write-wins and reindexes the reverse map on a phone change', async () => {
    const store = await newStore(makeFakeRepo([{ lid: '111', phone: '628999' }]));
    await store.remember('111', '628000');
    expect(store.getCached('111')).toBe('628000');
    expect(store.lidsForPhone('628999')).toEqual([]); // stale reverse entry dropped
    expect(store.lidsForPhone('628000')).toEqual(['111']);
  });

  it('skips a redundant write when the mapping is unchanged', async () => {
    const repo = makeFakeRepo([{ lid: '111', phone: '628999' }]);
    const store = await newStore(repo);
    repo.upsert.mockClear();
    await store.remember('111', '628999');
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('survives a restart: a fresh store over the same table reloads the mapping', async () => {
    const repo = makeFakeRepo();
    const first = await newStore(repo);
    await first.remember('111', '628999', 'sess-1');

    const second = await newStore(repo); // simulate process restart against the persisted rows
    expect(second.getCached('111')).toBe('628999');
    expect(second.lidsForPhone('628999')).toEqual(['111']);
  });

  it('does not throw when the table is unavailable on boot', async () => {
    const repo = makeFakeRepo();
    repo.find.mockRejectedValueOnce(new Error('no such table: lid_mappings'));
    const store = new LidMappingStoreService(repo as unknown as Repository<LidMapping>);
    await expect(store.onModuleInit()).resolves.toBeUndefined();
    expect(store.getCached('111')).toBeUndefined();
  });
});
