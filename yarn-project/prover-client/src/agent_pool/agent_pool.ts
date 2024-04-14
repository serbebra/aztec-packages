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
import { createDebugLogger } from '@aztec/foundation/log';

import { type CircuitProver } from '../prover/interface.js';
import { type Agent } from './agent.js';

export class AgentPool implements CircuitProver {
  agents: Agent[] = [];
  #log = createDebugLogger('aztec:prover-client:agent-pool');

  constructor(...agents: Agent[]) {
    this.agents = agents;
  }

  getBaseParityProof(inputs: BaseParityInputs): Promise<[ParityPublicInputs, Proof]> {
    return this.roundRobinAgents().getBaseParityProof(inputs);
  }

  getBaseRollupProof(input: BaseRollupInputs): Promise<[BaseOrMergeRollupPublicInputs, Proof]> {
    return this.roundRobinAgents().getBaseRollupProof(input);
  }

  getMergeRollupProof(input: MergeRollupInputs): Promise<[BaseOrMergeRollupPublicInputs, Proof]> {
    return this.roundRobinAgents().getMergeRollupProof(input);
  }

  getRootParityProof(inputs: RootParityInputs): Promise<[ParityPublicInputs, Proof]> {
    return this.roundRobinAgents().getRootParityProof(inputs);
  }

  getRootRollupProof(input: RootRollupInputs): Promise<[RootRollupPublicInputs, Proof]> {
    return this.roundRobinAgents().getRootRollupProof(input);
  }

  private roundRobinAgents(): CircuitProver {
    for (const agent of this.agents) {
      if (agent.status === 'idle') {
        return agent;
      }
    }

    this.#log.debug('All agents are busy. Returning first one in the list');
    return this.agents[0];
  }
}
