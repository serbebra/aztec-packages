import { Bufferable } from '@aztec/foundation/serialize';

import { AztecSingleton } from '../../interfaces/singleton.js';
import { Factory, KVStore } from '../kv_store.js';

export class Singleton<T extends Bufferable> implements AztecSingleton<T> {
  #name: string;
  #factory: Factory<T>;
  #store: KVStore;

  constructor(store: KVStore, name: string, factory: Factory<T>) {
    this.#store = store;
    this.#name = name;
    this.#factory = factory;
  }

  get(): T | undefined {
    return this.#store.get(this.#name, this.#factory);
  }

  async set(val: T): Promise<boolean> {
    await this.#store.set(this.#name, val);
    return true;
  }

  async delete(): Promise<boolean> {
    await this.#store.delete(this.#name);
    return true;
  }
}
