import { Bufferable, serializeToBuffer } from '@aztec/foundation/serialize';

import { Factory, KVStore, Key, Value } from './kv_store.js';

export class MemoryKVStore implements KVStore {
  #db = new Map<Key, Buffer>();
  #txs: Map<Key, Buffer>[] = [];

  set<K extends string, V extends Bufferable>(key: K, value: V): Promise<void> {
    this.#current.set(key, serializeToBuffer(value));
    return Promise.resolve();
  }

  get<K extends Key>(key: K): Buffer | undefined;
  get<K extends Key, V extends Value>(key: K, factory: Factory<V>): V | undefined;
  get<K extends Key, V extends Value>(key: K, factory?: Factory<V>): V | Buffer | undefined {
    const buffer = this.#current.get(key) ?? this.#db.get(key);
    if (buffer === undefined) {
      return undefined;
    }

    if (factory === undefined) {
      return buffer;
    }

    return factory(buffer);
  }

  transaction(callback: () => void): Promise<void> {
    const batch = new Map();
    const current = this.#current;
    this.#txs.push(batch);
    try {
      callback();

      for (const [key, value] of batch.entries()) {
        current.set(key, value);
      }
    } finally {
      // this _should_ be the last batch, but just in case
      const index = this.#txs.findLastIndex(tx => tx === batch);
      this.#txs.splice(index, 1);
    }
    return Promise.resolve();
  }

  get #current() {
    return this.#txs.at(-1) ?? this.#db;
  }
}
