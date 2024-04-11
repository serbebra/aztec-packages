import { LMDBStore } from '../lmdb_store.js';
import { List } from './list.js';

describe('List', () => {
  let list: List<number>;
  beforeEach(() => {
    list = new List(new LMDBStore(), 'test', b => b.readUInt32BE());
  });

  it('should add values', async () => {
    await list.add(1);
    await list.add(2);
    await list.add(3);
    await list.add(4);

    expect(Array.from(list.values())).toEqual([1, 2, 3, 4]);
  });

  it('should remove values', async () => {
    await list.add(1);
    await list.add(2);
    await list.add(3);
    await list.add(4);

    await list.remove(2);
    await list.remove(3);

    expect(Array.from(list.values())).toEqual([1, 4]);
  });
});
