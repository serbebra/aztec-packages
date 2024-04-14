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

import { type CircuitProver } from '../prover/interface.js';

type AgentStatus = 'busy' | 'idle';

export class Agent implements CircuitProver {
  #status: AgentStatus = 'idle';

  constructor(private actualProver: CircuitProver) {}

  get status(): AgentStatus {
    return this.#status;
  }

  getBaseParityProof(inputs: BaseParityInputs): Promise<[ParityPublicInputs, Proof]> {
    return this.#wrap(this.actualProver.getBaseParityProof(inputs));
  }

  getBaseRollupProof(input: BaseRollupInputs): Promise<[BaseOrMergeRollupPublicInputs, Proof]> {
    return this.#wrap(this.actualProver.getBaseRollupProof(input));
  }

  getMergeRollupProof(input: MergeRollupInputs): Promise<[BaseOrMergeRollupPublicInputs, Proof]> {
    return this.#wrap(this.actualProver.getMergeRollupProof(input));
  }

  getRootParityProof(inputs: RootParityInputs): Promise<[ParityPublicInputs, Proof]> {
    return this.#wrap(this.actualProver.getRootParityProof(inputs));
  }

  getRootRollupProof(input: RootRollupInputs): Promise<[RootRollupPublicInputs, Proof]> {
    return this.#wrap(this.actualProver.getRootRollupProof(input));
  }

  #wrap(promise: Promise<any>): Promise<any> {
    this.#status = 'busy';
    return promise.finally(() => {
      this.#status = 'idle';
    });
  }
}
