import { Bufferable } from '@aztec/foundation/serialize';

export type Key = string;
export type Value = Bufferable;
export type Factory<V extends Value> = (buffer: Buffer) => V;

/**
 * A key-value store.
 */
export interface KVStore {
  set<K extends Key, V extends Value>(key: K, value: V): Promise<void>;

  get<K extends Key>(key: K): Buffer | undefined;
  get<K extends Key, V extends Value>(key: K, factory: Factory<V>): V | undefined;

  transaction(callback: () => void): Promise<void>;
}
