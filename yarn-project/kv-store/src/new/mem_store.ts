import { type Bufferable, serializeToBuffer } from '@aztec/foundation/serialize';

import type { Deserialize, KVStore, Key, KeyRange, Value } from './kv_store.js';

const TOMBSTONE = Symbol('tombstone');

export class MemoryKVStore implements KVStore {
  #db = new Map<string, Buffer>();
  #txs: Map<string, Buffer | typeof TOMBSTONE>[] = [];

  set<K extends Key, V extends Bufferable>(key: K, value: V): Promise<void> {
    const buffer = serializeToBuffer(value);
    const current = this.#txs.at(-1) ?? this.#db;
    current.set(this.#serializeKey(key), buffer);
    return Promise.resolve();
  }

  delete<K extends Key>(key: K): Promise<void> {
    const serializedKey = this.#serializeKey(key);
    if (this.#txs.length === 0) {
      this.#db.delete(serializedKey);
    } else {
      const current = this.#txs.at(-1)!;
      current.set(serializedKey, TOMBSTONE);
    }
    return Promise.resolve();
  }

  get<K extends Key>(key: K): Buffer | undefined;
  get<K extends Key, V extends Value>(key: K, factory: Deserialize<V>): V | undefined;
  get<K extends Key, V extends Value>(key: K, factory?: Deserialize<V>): V | Buffer | undefined {
    const serializedKey = this.#serializeKey(key);
    const entry = this.#getEntry(serializedKey);
    if (!entry) {
      return undefined;
    }

    if (factory === undefined) {
      return entry[1];
    }

    return factory(entry[1]);
  }

  transaction<T>(callback: () => T): Promise<T> {
    const batch = new Map<string, Buffer | typeof TOMBSTONE>();
    const base = this.#txs.at(-1) ?? this.#db;
    this.#txs.push(batch);
    try {
      const res = callback();

      for (const [key, value] of batch.entries()) {
        if (value === TOMBSTONE && base === this.#db) {
          base.delete(key);
        } else {
          base.set(key, value);
        }
      }

      return Promise.resolve(res);
    } finally {
      // this _should_ be the last batch, but just in case
      const index = this.#txs.findLastIndex(tx => tx === batch);
      this.#txs.splice(index, 1);
    }
  }

  *entries<K extends Key>(range?: KeyRange<K>): IterableIterator<[Buffer, Buffer]> {
    const uniqueSerializedKeys = new Set<string>(Array.from(this.#db.keys()));
    for (const tx of this.#txs) {
      for (const key of tx.keys()) {
        uniqueSerializedKeys.add(key);
      }
    }

    let count = 0;
    const serializedKeys = Array.from(uniqueSerializedKeys.values()).sort();

    if (range?.reverse) {
      serializedKeys.reverse();
    }

    const serializedStart = range?.start && this.#serializeKey(range.start);
    const serializedEnd = range?.end && this.#serializeKey(range.end);
    for (const serializedKey of serializedKeys) {
      if (serializedStart && serializedKey < serializedStart) {
        continue;
      }

      if (serializedEnd && serializedKey >= serializedEnd) {
        break;
      }
      const entry = this.#getEntry(serializedKey);

      if (entry) {
        yield entry;
      }

      count++;
      if (range?.limit && count >= range.limit) {
        break;
      }
    }
  }

  *keys<K extends Key>(range?: KeyRange<K>): IterableIterator<Buffer> {
    for (const [key] of this.entries(range)) {
      yield key;
    }
  }

  *values<K extends Key, V extends Value>(range?: KeyRange<K>): IterableIterator<V> {
    for (const [, value] of this.entries(range)) {
      yield value as V;
    }
  }

  #getEntry(serializedKey: string): [Buffer, Buffer] | undefined {
    for (const tx of this.#txs.reverse()) {
      if (tx.has(serializedKey)) {
        const value = tx.get(serializedKey)!;

        if (value === TOMBSTONE) {
          continue;
        }

        return [Buffer.from(serializedKey, 'hex'), value];
      }
    }

    if (this.#db.has(serializedKey)) {
      const buffer = this.#db.get(serializedKey)!;
      return [Buffer.from(serializedKey, 'hex'), buffer];
    }

    return undefined;
  }

  #serializeKey(key: Key) {
    return serializeToBuffer(key).toString('hex');
  }
}
