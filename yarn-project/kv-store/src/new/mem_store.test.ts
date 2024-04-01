import { describeKVStore } from './kv_store_test_suite.js';
import { MemoryKVStore } from './mem_store.js';

describe('MemStore', () => {
  describeKVStore(() => new MemoryKVStore());
});
