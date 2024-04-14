/* eslint-disable @typescript-eslint/no-floating-promises,@typescript-eslint/ban-types */
import { makeEmptyProof } from '@aztec/circuits.js';
import {
  makeBaseOrMergeRollupPublicInputs,
  makeBaseParityInputs,
  makeParityPublicInputs,
  makeRootRollupPublicInputs,
} from '@aztec/circuits.js/testing';

import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { type CircuitProver } from '../prover/interface.js';
import { ProvingAgent } from './proving_agent.js';
import { InMemoryProvingQueue, ParityProvingType, type ProvingQueue } from './proving_queue.js';

interface MockFunctionCall<
  F extends Function,
  ReturnType = F extends (...args: any) => infer T ? T : F extends abstract new (...args: any) => infer T ? T : unknown,
  Args = F extends (...args: infer Y) => any ? Y : F extends abstract new (...args: infer Y) => any ? Y : unknown[],
> {
  /**
   * An array of the arguments passed to the mock function.
   */
  arguments: Args;
  /**
   * If the mocked function threw then this property contains the thrown value.
   */
  error: unknown | undefined;
  /**
   * The value returned by the mocked function.
   *
   * If the mocked function threw, it will be `undefined`.
   */
  result: ReturnType | undefined;
  /**
   * An `Error` object whose stack can be used to determine the callsite of the mocked function invocation.
   */
  stack: Error;
  /**
   * If the mocked function is a constructor, this field contains the class being constructed.
   * Otherwise this will be `undefined`.
   */
  target: F extends abstract new (...args: any) => any ? F : undefined;
  /**
   * The mocked function's `this` value.
   */
  this: unknown;
}

interface MockFunctionContext<F extends Function> {
  /**
   * A getter that returns a copy of the internal array used to track calls to the mock.
   */
  readonly calls: Array<MockFunctionCall<F>>;

  /**
   * This function returns the number of times that this mock has been invoked.
   * This function is more efficient than checking `ctx.calls.length`
   * because `ctx.calls` is a getter that creates a copy of the internal call tracking array.
   */
  callCount(): number;

  /**
   * This function is used to change the behavior of an existing mock.
   * @param implementation The function to be used as the mock's new implementation.
   */
  mockImplementation(implementation: Function): void;

  /**
   * This function is used to change the behavior of an existing mock for a single invocation.
   * Once invocation `onCall` has occurred, the mock will revert to whatever behavior
   * it would have used had `mockImplementationOnce()` not been called.
   * @param implementation The function to be used as the mock's implementation for the invocation number specified by `onCall`.
   * @param onCall The invocation number that will use `implementation`.
   *  If the specified invocation has already occurred then an exception is thrown.
   */
  mockImplementationOnce(implementation: Function, onCall?: number): void;

  /**
   * Resets the call history of the mock function.
   */
  resetCalls(): void;

  /**
   * Resets the implementation of the mock function to its original behavior.
   * The mock can still be used after calling this function.
   */
  restore(): void;
}

type Mock<F extends Function> = F & {
  mock: MockFunctionContext<F>;
};

describe('ProvingAgent', () => {
  let circuitProver: {
    [K in keyof CircuitProver]: Mock<CircuitProver[K]>;
  };
  let queue: ProvingQueue;
  let agent: ProvingAgent;

  beforeEach(() => {
    circuitProver = {
      getBaseParityProof: mock.fn((() =>
        Promise.resolve([makeParityPublicInputs(), makeEmptyProof()])) as CircuitProver['getBaseParityProof']),

      getRootParityProof: mock.fn((() =>
        Promise.resolve([makeParityPublicInputs(), makeEmptyProof()])) as CircuitProver['getRootParityProof']),

      getBaseRollupProof: mock.fn((() =>
        Promise.resolve([
          makeBaseOrMergeRollupPublicInputs(),
          makeEmptyProof(),
        ])) as CircuitProver['getBaseRollupProof']),

      getMergeRollupProof: mock.fn((() =>
        Promise.resolve([
          makeBaseOrMergeRollupPublicInputs(),
          makeEmptyProof(),
        ])) as CircuitProver['getMergeRollupProof']),

      getRootRollupProof: mock.fn((() =>
        Promise.resolve([makeRootRollupPublicInputs(), makeEmptyProof()])) as CircuitProver['getRootRollupProof']),
    };

    queue = new InMemoryProvingQueue();
    agent = new ProvingAgent(circuitProver);

    agent.start(queue);
  });

  afterEach(async () => {
    await agent.stop();
  });

  it('picks up proving jobs', async () => {
    const expectedResult = [makeParityPublicInputs(), makeEmptyProof()];
    circuitProver.getBaseParityProof.mock.mockImplementationOnce(() => Promise.resolve(expectedResult));

    const result = await queue.put({
      type: ParityProvingType.BASE_PARITY,
      inputs: makeBaseParityInputs(),
    });

    assert.deepEqual(result, expectedResult);
  });
});
