import { type Bufferable } from '@aztec/foundation/serialize';

export type Key = Bufferable;
export type Value = Bufferable;
export type Deserialize<V extends Value> = (buffer: Buffer) => V;
export type KeyRange<K extends Key> = {
  start?: K;
  end?: K;
  reverse?: boolean;
  limit?: number;
};

/**
 * A key-value store.
 */
export interface KVStore {
  set<K extends Key, V extends Value>(key: K, value: V): Promise<void>;

  get<K extends Key>(key: K): Buffer | undefined;
  get<K extends Key, V extends Value>(key: K, factory: Deserialize<V>): V | undefined;

  delete<K extends Key>(key: K): Promise<void>;

  transaction<T>(callback: () => T): Promise<T>;

  entries<K extends Key>(range?: KeyRange<K>): IterableIterator<[Buffer, Buffer]>;
  keys<K extends Key>(range?: KeyRange<K>): IterableIterator<Buffer>;
  values<K extends Key>(range?: KeyRange<K>): IterableIterator<Buffer>;
}
