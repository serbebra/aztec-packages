import { type Bufferable } from '@aztec/foundation/serialize';

import { type AztecSingleton } from '../../interfaces/singleton.js';
import { type Deserialize, type KVStore } from '../kv_store.js';

export class Singleton<T extends Bufferable> implements AztecSingleton<T> {
  #name: string;
  #factory: Deserialize<T>;
  #store: KVStore;

  constructor(store: KVStore, name: string, factory: Deserialize<T>) {
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
