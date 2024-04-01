import { describeKVStore } from './kv_store_test_suite.js';
import { LMDBStore } from './lmdb_store.js';

describe('LMDBStore', () => {
  describeKVStore(() => new LMDBStore());
});
