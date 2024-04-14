import {
  type BaseParityInputs,
  type BaseRollupInputs,
  type MergeRollupInputs,
  type Proof,
  type RootParityInputs,
  type RootRollupInputs,
} from '@aztec/circuits.js';
import { MemoryFifo } from '@aztec/foundation/fifo';
import { RunningPromise } from '@aztec/foundation/running-promise';

import { type CircuitProver } from '../prover/interface.js';

export type ProofRequest =
  | {
      type: 'BASE_PARITY';
      inputs: BaseParityInputs;
    }
  | {
      type: 'ROOT_PARITY';
      inputs: RootParityInputs;
    }
  | {
      type: 'BASE_ROLLUP';
      inputs: BaseRollupInputs;
    }
  | {
      type: 'MERGE_ROLLUP';
      inputs: MergeRollupInputs;
    }
  | {
      type: 'ROOT_ROLLUP';
      inputs: RootRollupInputs;
    };

export type ProofRequestJob = ProofRequest & {
  resolve: (result: [inputs: object, proof: Proof]) => void;
};

export interface ProofRequestsQueue {
  submit(request: ProofRequest): Promise<[any, Proof]>;
  takeProofRequest(): Promise<ProofRequestJob | null>;
}

export class MemoryRequestsQueue implements ProofRequestsQueue {
  jobQueue = new MemoryFifo<ProofRequestJob>();
  submit(request: ProofRequest): Promise<[any, Proof]> {
    let resolve: ProofRequestJob['resolve'] | undefined;
    const promise = new Promise<[inputs: object, proof: Proof]>(res => {
      resolve = res;
    });
    if (!resolve) {
      throw new Error();
    }

    const job: ProofRequestJob = {
      ...request,
      resolve: () => {},
    };

    if (!this.jobQueue.put(job)) {
      throw new Error();
    }

    return promise;
  }

  takeProofRequest(): Promise<ProofRequestJob | null> {
    return this.jobQueue.get(1);
  }
}

export class ProverAgent {
  private work = async () => {
    const job = await this.queue.takeProofRequest();
    if (job === null) {
      return;
    }

    switch (job.type) {
      case 'BASE_PARITY': {
        const [inputs, proof] = await this.prover.getBaseParityProof(job.inputs);
        job.resolve([inputs, proof]);
        break;
      }

      case 'ROOT_PARITY': {
        const [inputs, proof] = await this.prover.getRootParityProof(job.inputs);
        job.resolve([inputs, proof]);
        break;
      }

      case 'BASE_ROLLUP': {
        const [inputs, proof] = await this.prover.getBaseRollupProof(job.inputs);
        job.resolve([inputs, proof]);
        break;
      }

      case 'MERGE_ROLLUP': {
        const [inputs, proof] = await this.prover.getMergeRollupProof(job.inputs);
        job.resolve([inputs, proof]);
        break;
      }

      case 'ROOT_ROLLUP': {
        const [inputs, proof] = await this.prover.getRootRollupProof(job.inputs);
        job.resolve([inputs, proof]);
        break;
      }

      default: {
        throw new Error('Invalid proof request type');
      }
    }
  };
  runningPromise = new RunningPromise(this.work, 10);

  constructor(private queue: ProofRequestsQueue, private prover: CircuitProver) {}

  start() {
    this.runningPromise.start();
  }

  stop() {
    return this.runningPromise.stop();
  }
}
