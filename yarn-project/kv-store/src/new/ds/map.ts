import { Factory, KVStore, Key, Value } from '../kv_store.js';

export class AMap<K extends Key, V extends Value> {
  #store: KVStore;
  #name: string;
  #factory: Factory<V>;

  constructor(store: KVStore, name: string, factory: Factory<V>) {
    this.#store = store;
    this.#name = name;
    this.#factory = factory;
  }

  get(key: K): V | undefined {
    return this.#store.get(this.#key(key), this.#factory);
  }

  has(key: K): boolean {
    return this.#store.get(this.#key(key)) !== undefined;
  }

  async set(key: K, val: V): Promise<boolean> {
    await this.#store.set(this.#key(key), val);
    return true;
  }

  async swap(key: K, fn: (val: V | undefined) => V): Promise<boolean> {
    await this.#store.transaction(() => {
      const val = this.get(key);
      void this.set(key, fn(val));
    });
    return true;
  }

  #key(key: K) {
    return [this.#name, key];
  }
}
