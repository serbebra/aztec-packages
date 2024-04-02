import { toBigIntBE } from '@aztec/foundation/bigint-buffer';

import { MemoryKVStore } from '../mem_store.js';
import { Singleton } from './singleton.js';

describe('LmdbAztecSingleton', () => {
  let singleton: Singleton<bigint>;
  beforeEach(() => {
    singleton = new Singleton(new MemoryKVStore(), 'test', toBigIntBE);
  });

  it('returns undefined if the value is not set', () => {
    expect(singleton.get()).toEqual(undefined);
  });

  it('should be able to set and get values', async () => {
    expect(await singleton.set(50n)).toEqual(true);
    expect(singleton.get()).toEqual(50n);
  });

  it('overwrites the value if it is set again', async () => {
    expect(await singleton.set(23n)).toEqual(true);
    expect(await singleton.set(54n)).toEqual(true);
    expect(singleton.get()).toEqual(54n);
  });
});
