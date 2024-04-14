import { createDebugLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';

import { type CircuitProver } from '../prover/interface.js';
import {
  ParityProvingType,
  type ProvingQueue,
  type ProvingRequest,
  type ProvingResult,
  RollupProvingType,
} from './proving_queue.js';

export class ProvingAgent {
  #runningPromise?: RunningPromise;
  #log = createDebugLogger('aztec:prover-client:proving-agent');

  constructor(private prover: CircuitProver) {}

  start(queue: ProvingQueue): void {
    this.#runningPromise = new RunningPromise(async () => {
      this.#log.debug('Proving running');
      const job = await queue.get(1);
      if (!job) {
        this.#log.debug('No proving job available');
        return;
      }

      try {
        this.#log.debug(
          `Processing ${ParityProvingType[job.request.type] ?? RollupProvingType[job.request.type]} proving job`,
        );
        job.resolve(await this.work(job.request));
      } catch (err) {
        job.reject(err as Error);
      }
    }, 10);

    this.#runningPromise.start();
  }

  async stop(): Promise<void> {
    await this.#runningPromise?.stop();
    this.#runningPromise = undefined;
  }

  private work({ type, inputs }: ProvingRequest): Promise<ProvingResult<typeof type>> {
    switch (type) {
      case ParityProvingType.BASE_PARITY: {
        return this.prover.getBaseParityProof(inputs);
      }

      case ParityProvingType.ROOT_PARITY: {
        return this.prover.getRootParityProof(inputs);
      }

      case RollupProvingType.BASE_ROLLUP: {
        return this.prover.getBaseRollupProof(inputs);
      }

      case RollupProvingType.MERGE_ROLLUP: {
        return this.prover.getMergeRollupProof(inputs);
      }

      case RollupProvingType.ROOT_ROLLUP: {
        return this.prover.getRootRollupProof(inputs);
      }

      default: {
        return Promise.reject(new Error('Invalid proof request type'));
      }
    }
  }
}
