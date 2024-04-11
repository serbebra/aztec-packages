import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import type { Deserialize, KVStore, Value } from '../kv_store.js';
import { Singleton } from './singleton.js';

export class List<V extends Value> {
  #store: KVStore;
  #name: string;
  #factory: Deserialize<V>;
  #id: Singleton<number>;

  constructor(store: KVStore, name: string, factory: Deserialize<V>) {
    this.#store = store;
    this.#name = name;
    this.#factory = factory;
    this.#id = new Singleton(store, `${name}:id`, b => b.readUint32BE());
  }

  add(value: V) {
    return this.#store.transaction(() => {
      const nextId = this.#id.get() ?? 0;

      void this.#store.set(this.#key(nextId), value);
      void this.#id.set(nextId + 1);
    });
  }

  remove(needle: V) {
    const needleBuffer = serializeToBuffer(needle);
    return this.#store.transaction(() => {
      for (const [key, buffer] of this.#entriesBinary()) {
        if (needleBuffer.equals(buffer)) {
          void this.#store.delete(this.#key(key));
          return true;
        }
      }
    });
  }

  *values(): IterableIterator<V> {
    for (const [, buffer] of this.#entriesBinary()) {
      yield this.#factory(buffer);
    }
  }

  *#entriesBinary(): IterableIterator<[number, Buffer]> {
    const start = this.#key(0);
    const end = this.#key(this.#id.get() ?? 0);

    for (const [key, buf] of this.#store.entries({
      start,
      end,
    })) {
      yield [this.#deserializeKey(key), buf];
    }
  }

  #key(id: number) {
    return [this.#name, id];
  }

  #deserializeKey(buffer: Buffer): number {
    const reader = BufferReader.asReader(buffer);
    const name = reader.readString();
    if (name !== this.#name) {
      throw new Error();
    }

    return reader.readNumber();
  }
}
