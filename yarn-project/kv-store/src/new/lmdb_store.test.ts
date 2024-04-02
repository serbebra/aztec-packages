import { describeKVStore } from './kv_store_test_suite.js';
import { LMDBStore } from './lmdb_store.js';

describe('LMDBStore', () => {
  let store: LMDBStore;
  beforeEach(() => {
    store = new LMDBStore();
  });

  describeKVStore(() => store);
});
