/* eslint-disable @typescript-eslint/no-floating-promises */
import { makeBaseParityInputs, makeBaseRollupInputs } from '@aztec/circuits.js/testing';

import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import { InMemoryProvingQueue, ParityProvingType, type ProvingQueue, RollupProvingType } from './proving_queue.js';

describe('ProvingQueue', () => {
  let queue: ProvingQueue;

  beforeEach(() => {
    queue = new InMemoryProvingQueue();
  });

  it('accepts proving jobs', () => {
    queue.put({
      type: ParityProvingType.BASE_PARITY,
      inputs: makeBaseParityInputs(),
    });

    queue.put({
      type: RollupProvingType.BASE_ROLLUP,
      inputs: makeBaseRollupInputs(),
    });

    assert.equal(queue.size, 2);
  });

  it('returns jobs in FIFO order', async () => {
    queue.put({
      type: ParityProvingType.BASE_PARITY,
      inputs: makeBaseParityInputs(),
    });

    queue.put({
      type: RollupProvingType.BASE_ROLLUP,
      inputs: makeBaseRollupInputs(),
    });

    assert.deepEqual((await queue.get())?.request?.type, ParityProvingType.BASE_PARITY);
    assert.deepEqual((await queue.get())?.request?.type, RollupProvingType.BASE_ROLLUP);
  });

  it('returns null when queue is empty', async () => {
    assert.equal(await queue.get(), null);
  });
});
