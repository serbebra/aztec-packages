import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { serializeToBuffer } from '@aztec/foundation/serialize';

import { KVStore } from './kv_store.js';

export function describeKVStore(createStore: () => KVStore | Promise<KVStore>) {
  let store: KVStore;

  beforeEach(async () => {
    store = await createStore();
  });

  it('should set and get a value', async () => {
    await store.set('key', Buffer.from('value'));

    const value = store.get('key');
    expect(value).toEqual(Buffer.from('value'));
  });

  it('should set and get a value with a factory', async () => {
    await store.set('key', 50n);

    const value = store.get('key', toBigIntBE);
    expect(value).toEqual(50n);
  });

  it('should return undefined for a missing key', () => {
    const value = store.get('missing');
    expect(value).toBeUndefined();
  });

  it('should return undefined for a missing key with a factory', () => {
    const value = store.get('missing', toBigIntBE);
    expect(value).toBeUndefined();
  });

  describe('transaction', () => {
    it('should commit all values', async () => {
      await store.transaction(() => {
        void store.set('key1', Buffer.from('value1'));
        void store.set('key2', Buffer.from('value2'));
      });

      expect(store.get('key1')).toEqual(Buffer.from('value1'));
      expect(store.get('key2')).toEqual(Buffer.from('value2'));
    });

    it('should rollback all values on error', async () => {
      try {
        await store.transaction(() => {
          void store.set('key1', Buffer.from('value1'));
          throw new Error('Test error');
        });
      } catch (error) {
        // Ignore error
      }

      expect(store.get('key1')).toBeUndefined();
    });

    it('should allow reads in current transaction', async () => {
      expect.assertions(1);
      await store.transaction(() => {
        void store.set('key1', Buffer.from('value1'));
        expect(store.get('key1')).toEqual(Buffer.from('value1'));
      });
    });

    it('should allow nesting transactions', async () => {
      await store.transaction(() => {
        void store.set('key1', Buffer.from('value1'));
        void store.transaction(() => {
          void store.set('key2', Buffer.from('value2'));
        });
      });

      expect(store.get('key1')).toEqual(Buffer.from('value1'));
      expect(store.get('key2')).toEqual(Buffer.from('value2'));
    });

    it('should allow nesting transaction to overwrite', async () => {
      await store.transaction(() => {
        void store.set('key1', Buffer.from('value1'));
        void store.transaction(() => {
          void store.set('key1', Buffer.from('value2'));
        });
      });

      expect(store.get('key1')).toEqual(Buffer.from('value2'));
    });

    it('should allow nesting transactions with rollback', async () => {
      try {
        await store.transaction(() => {
          void store.set('key1', Buffer.from('value1'));
          void store.transaction(() => {
            void store.set('key2', Buffer.from('value2'));
            throw new Error('Test error');
          });
        });
      } catch (error) {
        // Ignore error
      }

      expect(store.get('key1')).toBeUndefined();
      expect(store.get('key2')).toBeUndefined();
    });
  });

  describe('iterators', () => {
    it('should return all entries', async () => {
      await store.set('key1', Buffer.from('value1'));
      await store.set('key2', Buffer.from('value2'));

      const entries = Array.from(store.entries());
      expect(entries).toEqual([
        [serializeToBuffer('key1'), Buffer.from('value1')],
        [serializeToBuffer('key2'), Buffer.from('value2')],
      ]);
    });

    it('should return entries in range', async () => {
      await store.set('key1', Buffer.from('value1'));
      await store.set('key2', Buffer.from('value2'));
      await store.set('key3', Buffer.from('value3'));

      const entries = Array.from(store.entries({ start: 'key1', end: 'key2' }));
      expect(entries).toEqual([[serializeToBuffer('key1'), Buffer.from('value1')]]);
    });

    it('should return entries in reverse', async () => {
      await store.set('key1', Buffer.from('value1'));
      await store.set('key2', Buffer.from('value2'));
      await store.set('key3', Buffer.from('value3'));

      const entries = Array.from(store.entries({ reverse: true }));
      expect(entries).toEqual([
        [serializeToBuffer('key3'), Buffer.from('value3')],
        [serializeToBuffer('key2'), Buffer.from('value2')],
        [serializeToBuffer('key1'), Buffer.from('value1')],
      ]);
    });

    it('should return entries with limit', async () => {
      await store.set('key1', Buffer.from('value1'));
      await store.set('key2', Buffer.from('value2'));
      await store.set('key3', Buffer.from('value3'));

      const entries = Array.from(store.entries({ limit: 2 }));
      expect(entries).toEqual([
        [serializeToBuffer('key1'), Buffer.from('value1')],
        [serializeToBuffer('key2'), Buffer.from('value2')],
      ]);
    });

    it('should return keys', async () => {
      await store.set('key1', Buffer.from('value1'));
      await store.set('key2', Buffer.from('value2'));
      expect(Array.from(store.keys())).toEqual([serializeToBuffer('key1'), serializeToBuffer('key2')]);
    });

    it('should return keys in range', async () => {
      await store.set('key1', Buffer.from('value1'));
      await store.set('key2', Buffer.from('value2'));
      expect(Array.from(store.keys({ start: 'key1', end: 'key2' }))).toEqual([serializeToBuffer('key1')]);
    });

    it('should return keys in reverse', async () => {
      await store.set('key1', Buffer.from('value1'));
      await store.set('key2', Buffer.from('value2'));
      expect(Array.from(store.keys({ reverse: true }))).toEqual([serializeToBuffer('key2'), serializeToBuffer('key1')]);
    });

    it('should return keys with limit', async () => {
      await store.set('key1', Buffer.from('value1'));
      await store.set('key2', Buffer.from('value2'));
      expect(Array.from(store.keys({ limit: 1 }))).toEqual([serializeToBuffer('key1')]);
    });

    it('should return values', async () => {
      await store.set('key1', Buffer.from('value1'));
      await store.set('key2', Buffer.from('value2'));
      expect(Array.from(store.values())).toEqual([Buffer.from('value1'), Buffer.from('value2')]);
    });

    it('should return values in range', async () => {
      await store.set('key1', Buffer.from('value1'));
      await store.set('key2', Buffer.from('value2'));
      expect(Array.from(store.values({ start: 'key1', end: 'key2' }))).toEqual([Buffer.from('value1')]);
    });

    it('should return values in reverse', async () => {
      await store.set('key1', Buffer.from('value1'));
      await store.set('key2', Buffer.from('value2'));
      expect(Array.from(store.values({ reverse: true }))).toEqual([Buffer.from('value2'), Buffer.from('value1')]);
    });

    it('should return values with limit', async () => {
      await store.set('key1', Buffer.from('value1'));
      await store.set('key2', Buffer.from('value2'));
      expect(Array.from(store.values({ limit: 1 }))).toEqual([Buffer.from('value1')]);
    });

    it('should return entries in tx', async () => {
      expect.assertions(4);

      await store.transaction(() => {
        void store.set('key1', Buffer.from('value1'));
        void store.set('key2', Buffer.from('value2'));

        expect(Array.from(store.entries())).toEqual([
          [serializeToBuffer('key1'), Buffer.from('value1')],
          [serializeToBuffer('key2'), Buffer.from('value2')],
        ]);

        void store.transaction(() => {
          void store.set('key3', Buffer.from('value3'));
          expect(Array.from(store.entries())).toEqual([
            [serializeToBuffer('key1'), Buffer.from('value1')],
            [serializeToBuffer('key2'), Buffer.from('value2')],
            [serializeToBuffer('key3'), Buffer.from('value3')],
          ]);
        });

        try {
          void store.transaction(() => {
            void store.set('key0', Buffer.from('value0'));
            expect(Array.from(store.entries())).toEqual([
              [serializeToBuffer('key0'), Buffer.from('value0')],
              [serializeToBuffer('key1'), Buffer.from('value1')],
              [serializeToBuffer('key2'), Buffer.from('value2')],
              [serializeToBuffer('key3'), Buffer.from('value3')],
            ]);

            throw new Error();
          });
        } catch (error) {
          // ignore error for test
        }

        expect(Array.from(store.entries())).toEqual([
          [serializeToBuffer('key1'), Buffer.from('value1')],
          [serializeToBuffer('key2'), Buffer.from('value2')],
          [serializeToBuffer('key3'), Buffer.from('value3')],
        ]);
      });
    });
  });
}
