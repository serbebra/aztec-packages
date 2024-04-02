import { Bufferable, serializeToBuffer } from '@aztec/foundation/serialize';

import { AztecArray } from '../../interfaces/array.js';
import { AztecSingleton } from '../../interfaces/singleton.js';
import { Factory, KVStore } from '../kv_store.js';
import { Singleton } from './singleton.js';

export class AArray<T extends Bufferable> implements AztecArray<T> {
  #store: KVStore;
  #name: string;
  #factory: Factory<T>;
  #length: AztecSingleton<number>;

  constructor(store: KVStore, name: string, factory: Factory<T>) {
    this.#store = store;
    this.#name = name;
    this.#factory = factory;
    this.#length = new Singleton(store, `${name}:length`, buf => buf.readUInt32BE());
  }

  at(index: number): T | undefined {
    return this.#store.get(this.#key(index), this.#factory);
  }

  push(...values: T[]): Promise<number> {
    return this.#store.transaction(() => {
      const len = this.#length.get() ?? 0;
      for (let i = 0; i < values.length; i++) {
        void this.#store.set(this.#key(len + i), values[i]);
      }

      void this.#length.set(len + values.length);

      return len + values.length;
    });
  }

  pop(): Promise<T | undefined> {
    return this.#store.transaction(() => {
      const len = this.#length.get() ?? 0;
      if (len === 0) {
        return undefined;
      }

      const val = this.#store.get(this.#key(len - 1), this.#factory);
      void this.#store.delete(this.#key(len - 1));
      void this.#length.set(len - 1);

      return val;
    });
  }

  async setAt(index: number, val: T): Promise<boolean> {
    const len = this.#length.get() ?? 0;
    if (index < 0 || index >= len) {
      return false;
    }

    await this.#store.set(this.#key(index), val);
    return true;
  }

  *entries(): IterableIterator<[number, T]> {
    const len = this.#length.get() ?? 0;
    let i = 0;
    for (const value of this.#store.values({
      start: this.#key(0),
      limit: len,
    })) {
      yield [i++, this.#factory(value)];
    }
  }

  *values(): IterableIterator<T> {
    for (const value of this.#store.values({
      start: this.#key(0),
      limit: this.#length.get() ?? 0,
    })) {
      yield this.#factory(value);
    }
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this.values();
  }

  get length() {
    return this.#length.get() ?? 0;
  }

  #key(index: number): Buffer {
    return serializeToBuffer(this.#name, index);
  }
}
