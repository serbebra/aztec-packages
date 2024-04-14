import {
  type BaseOrMergeRollupPublicInputs,
  type BaseParityInputs,
  type BaseRollupInputs,
  type MergeRollupInputs,
  type ParityPublicInputs,
  type Proof,
  type RootParityInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
} from '@aztec/circuits.js';
import { InterruptError } from '@aztec/foundation/errors';
import { MemoryFifo } from '@aztec/foundation/fifo';
import { createDebugLogger } from '@aztec/foundation/log';

import { type CircuitProver } from '../prover/interface.js';

export enum ParityProvingType {
  BASE_PARITY = 0,
  ROOT_PARITY,
}

export enum RollupProvingType {
  BASE_ROLLUP = 2,
  MERGE_ROLLUP,
  ROOT_ROLLUP,
}

export type ProvingRequest =
  | {
      type: ParityProvingType.BASE_PARITY;
      inputs: BaseParityInputs;
    }
  | {
      type: ParityProvingType.ROOT_PARITY;
      inputs: RootParityInputs;
    }
  | {
      type: RollupProvingType.BASE_ROLLUP;
      inputs: BaseRollupInputs;
    }
  | {
      type: RollupProvingType.MERGE_ROLLUP;
      inputs: MergeRollupInputs;
    }
  | {
      type: RollupProvingType.ROOT_ROLLUP;
      inputs: RootRollupInputs;
    };

export type PublicInputs<T extends ProvingRequest['type']> = T extends ParityProvingType
  ? ParityPublicInputs
  : T extends RollupProvingType.BASE_ROLLUP | RollupProvingType.MERGE_ROLLUP
  ? BaseOrMergeRollupPublicInputs
  : RootRollupPublicInputs;

export type ProvingResult<T extends ProvingRequest['type']> = [PublicInputs<T>, Proof];

export type ProvingJob<T extends ProvingRequest> = {
  request: T;
  resolve: (result: [inputs: PublicInputs<T['type']>, proof: Proof]) => void;
  reject: (err: Error) => void;
};

export interface ProvingQueue extends CircuitProver {
  get(timeout?: number): Promise<ProvingJob<ProvingRequest> | null>;
}

export class InMemoryProvingQueue implements ProvingQueue {
  static #id = 0;
  #log = createDebugLogger('aztec:prover:proving_queue:' + InMemoryProvingQueue.#id++);
  queue = new MemoryFifo<ProvingJob<ProvingRequest>>();

  getBaseParityProof(inputs: BaseParityInputs): Promise<[ParityPublicInputs, Proof]> {
    return this.#put({
      type: ParityProvingType.BASE_PARITY,
      inputs,
    });
  }

  getBaseRollupProof(input: BaseRollupInputs): Promise<[BaseOrMergeRollupPublicInputs, Proof]> {
    return this.#put({ type: RollupProvingType.BASE_ROLLUP, inputs: input });
  }

  getMergeRollupProof(input: MergeRollupInputs): Promise<[BaseOrMergeRollupPublicInputs, Proof]> {
    return this.#put({ type: RollupProvingType.MERGE_ROLLUP, inputs: input });
  }

  getRootParityProof(inputs: RootParityInputs): Promise<[ParityPublicInputs, Proof]> {
    return this.#put({ type: ParityProvingType.ROOT_PARITY, inputs });
  }

  getRootRollupProof(input: RootRollupInputs): Promise<[RootRollupPublicInputs, Proof]> {
    return this.#put({ type: RollupProvingType.ROOT_ROLLUP, inputs: input });
  }

  #put<T extends ProvingRequest>(request: T): Promise<ProvingResult<T['type']>> {
    let resolve: ProvingJob<typeof request>['resolve'] | undefined;
    let reject: ProvingJob<typeof request>['reject'] | undefined;

    const promise = new Promise<ProvingResult<(typeof request)['type']>>((res, rej) => {
      resolve = x => {
        this.#log.debug(`Proving job completed`);
        res(x);
      };
      reject = e => {
        this.#log.error(`Proving job failed`, e);
        rej(e);
      };
    });

    if (!resolve || !reject) {
      throw new Error('Promise not created');
    }

    const job: ProvingJob<typeof request> = {
      request,
      resolve,
      reject,
    };

    this.#log.info(`Adding ${ParityProvingType[request.type] ?? RollupProvingType[request.type]} proving job to queue`);
    if (!this.queue.put(job)) {
      return Promise.reject(new Error('Failed to submit proving request'));
    }

    return promise;
  }

  async get(timeoutSec = 1): Promise<ProvingJob<ProvingRequest> | null> {
    try {
      this.#log.info(`returning proving job, qSize: ${this.queue.length()}`);
      return await this.queue.get(timeoutSec);
    } catch (err) {
      if (err instanceof InterruptError) {
        return null;
      }

      throw err;
    }
  }

  get size() {
    return this.queue.length();
  }
}
