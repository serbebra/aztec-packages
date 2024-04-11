import { randomBytes } from '@aztec/foundation/crypto';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import type { Deserialize, KVStore, Value } from '../kv_store.js';
import { AMap } from './map.js';
import { Singleton } from './singleton.js';

export class List<V extends Value> {
  #store: KVStore;
  #name: string;
  #factory: Deserialize<V>;
  #nextLinks: AMap<Buffer, Buffer>;
  #values: AMap<Buffer, Buffer>;
  #start: Singleton<Buffer>;

  constructor(store: KVStore, name: string, factory: Deserialize<V>) {
    this.#store = store;
    this.#name = name;
    this.#factory = factory;
    this.#start = new Singleton(store, `${name}:start`, b => b);
    this.#nextLinks = new AMap(store, `${name}:next`, b => b);
    this.#values = new AMap(store, `${name}:value`, b => b);
  }

  add(value: V) {
    return this.#store.transaction(() => {
      const id = randomBytes(32);
      const serialized = serializeToBuffer(value);
      let prev: Buffer | undefined = undefined;

      for (const [key, buffer] of this.#entriesBinary()) {
        if (Buffer.compare(serialized, buffer) === -1) {
          prev = key;
        } else {
          break;
        }
      }

      if (!prev) {
        void this.#nextLinks.set(id, this.#start.get()!);
        void this.#start.set(id);
      } else {
        void this.#nextLinks.set(id, this.#nextLinks.get(prev)!);
        void this.#nextLinks.set(prev, id);
      }

      void this.#values.set(id, serialized);
    });
  }

  remove(needle: V) {}

  *#entriesBinary(): IterableIterator<[Buffer, Buffer]> {
    let key: Buffer | undefined = this.#start.get();
    while (key) {
      const value = this.#values.get(key);
      if (!value) {
        break;
      }

      yield [key, value];
      key = this.#nextLinks.get(key);
    }
  }

  #key(id: Buffer) {
    return [this.#name, id];
  }

  #deserializeKey(buffer: Buffer): Buffer {
    const reader = BufferReader.asReader(buffer);
    const name = reader.readString();
    if (name !== this.#name) {
      throw new Error();
    }

    return reader.readBuffer();
  }
}
