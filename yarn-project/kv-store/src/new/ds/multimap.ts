import { KVStore, Key, Value } from '../kv_store.js';

export class AMMap<K extends Key, V extends Value> {
  #store: KVStore;
  #name: string;

  constructor(store: KVStore, name: string) {
    this.#store = store;
    this.#name = name;
  }

  set(key: K, value: V) {
    void this.#store.set(this.#key(key), value);
  }

  #key(key: K) {
    return [this.#name, key];
  }
}
