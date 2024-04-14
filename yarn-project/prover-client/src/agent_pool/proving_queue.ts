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

export interface ProvingQueue {
  put(request: ProvingRequest): Promise<[PublicInputs<(typeof request)['type']>, Proof]>;
  get(timeout?: number): Promise<ProvingJob<ProvingRequest> | null>;
  size: number;
}

export class InMemoryProvingQueue implements ProvingQueue {
  log = createDebugLogger('aztec:prover-client:in-memory-proving-queue');
  queue = new MemoryFifo<ProvingJob<ProvingRequest>>();

  put(
    request: ProvingRequest,
  ): Promise<[ParityPublicInputs | BaseOrMergeRollupPublicInputs | RootRollupPublicInputs, Proof]> {
    let resolve: ProvingJob<typeof request>['resolve'] | undefined;
    let reject: ProvingJob<typeof request>['reject'] | undefined;

    const promise = new Promise<ProvingResult<(typeof request)['type']>>((res, rej) => {
      resolve = x => {
        this.log.debug(`Proving job completed`);
        res(x);
      };
      reject = e => {
        this.log.error(`Proving job failed`, e);
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

    this.log.debug(`Adding ${ParityProvingType[request.type] ?? RollupProvingType[request.type]} proving job to queue`);
    if (!this.queue.put(job)) {
      return Promise.reject(new Error('Failed to submit proving request'));
    }

    return promise;
  }

  async get(timeoutSec = 1): Promise<ProvingJob<ProvingRequest> | null> {
    try {
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
