import { toBigIntBE } from '@aztec/foundation/bigint-buffer';

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
}
