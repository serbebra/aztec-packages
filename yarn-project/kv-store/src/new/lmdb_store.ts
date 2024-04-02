import { serializeToBuffer } from '@aztec/foundation/serialize';

import { RootDatabase, open } from 'lmdb';

import { Factory, KVStore, Key, KeyRange, Value } from './kv_store.js';

export class LMDBStore implements KVStore {
  #db: RootDatabase<Buffer, string>;

  constructor() {
    this.#db = open({
      encoding: 'binary',
      keyEncoding: 'ordered-binary',
    });
  }

  async set<K extends Key, V extends Value>(key: K, value: V): Promise<void> {
    const res = await this.#db.put(this.#serializeKey(key), serializeToBuffer(value));
    if (!res) {
      throw new Error('Failed to set value');
    }
  }

  async delete<K extends Key>(key: K): Promise<void> {
    const res = await this.#db.remove(this.#serializeKey(key));
    if (!res) {
      throw new Error('Failed to delete value');
    }
  }

  get<K extends Key>(key: K): Buffer | undefined;
  get<K extends Key, V extends Value>(key: K, factory: Factory<V>): V | undefined;
  get<K extends Key, V extends Value>(key: K, factory?: Factory<V>): V | Buffer | undefined {
    const buffer = this.#db.getBinary(this.#serializeKey(key));
    if (buffer === undefined) {
      return undefined;
    }

    if (factory === undefined) {
      return buffer;
    }

    return factory(buffer);
  }

  transaction<T>(callback: () => T): Promise<T> {
    return Promise.resolve(this.#db.transactionSync(callback));
  }

  #serializeKey(key: Key): string {
    return serializeToBuffer(key).toString('hex');
  }

  *entries<K extends Key>(range?: KeyRange<K>): IterableIterator<[Buffer, Buffer]> {
    const serializedStart = range?.start ? this.#serializeKey(range.start) : undefined;
    const serializedEnd = range?.end ? this.#serializeKey(range.end) : undefined;
    for (const { key, value } of this.#db.getRange({
      start: serializedStart,
      end: serializedEnd,
      limit: range?.limit,
      reverse: range?.reverse,
    })) {
      yield [Buffer.from(key, 'hex'), value];
    }
  }

  *keys<K extends Key>(range?: KeyRange<K>): IterableIterator<Buffer> {
    for (const [key] of this.entries(range)) {
      yield key;
    }
  }

  *values<K extends Key>(range?: KeyRange<K>): IterableIterator<Buffer> {
    for (const [, value] of this.entries(range)) {
      yield value;
    }
  }
}
