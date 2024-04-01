import { serializeToBuffer } from '@aztec/foundation/serialize';

import { RootDatabase, open } from 'lmdb';

import { Factory, KVStore, Key, Value } from './kv_store.js';

export class LMDBStore implements KVStore {
  #db: RootDatabase;

  constructor() {
    this.#db = open({});
  }

  async set<K extends Key, V extends Value>(key: K, value: V): Promise<void> {
    const res = await this.#db.put(key, serializeToBuffer(value));
    if (!res) {
      throw new Error('Failed to set value');
    }
  }

  get<K extends Key>(key: K): Buffer | undefined;
  get<K extends Key, V extends Value>(key: K, factory: Factory<V>): V | undefined;
  get<K extends Key, V extends Value>(key: K, factory?: Factory<V>): V | Buffer | undefined {
    const buffer = this.#db.get(key);
    if (buffer === undefined) {
      return undefined;
    }

    if (factory === undefined) {
      return buffer;
    }

    return factory(buffer);
  }

  transaction(callback: () => void): Promise<void> {
    this.#db.transactionSync(callback);
    return Promise.resolve();
  }
}
