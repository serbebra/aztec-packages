import {
  BaseOrMergeRollupPublicInputs,
  BaseParityInputs,
  BaseRollupInputs,
  MergeRollupInputs,
  ParityPublicInputs,
  Proof,
  RootParityInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
} from '@aztec/circuits.js';
import { createJsonRpcClient } from '@aztec/foundation/json-rpc/client';

import { parentPort, workerData } from 'worker_threads';

import { getSimulationProvider } from '../mocks/fixtures.js';
import { TestCircuitProver } from '../prover/test_circuit_prover.js';
import { LocalProvingAgent } from './proving_agent.js';
import { type ProvingQueue } from './proving_queue.js';

const { acvmBinaryPath, acvmWorkingDirectory, queueUrl } = workerData as {
  acvmWorkingDirectory: string;
  acvmBinaryPath: string;
  queueUrl: string;
};

const queueClient = createJsonRpcClient<ProvingQueue>(
  queueUrl,
  {
    BaseParityInputs,
    BaseOrMergeRollupPublicInputs,
    BaseRollupInputs,
    MergeRollupInputs,
    ParityPublicInputs,
    Proof,
    RootParityInputs,
    RootRollupInputs,
    RootRollupPublicInputs,
  },
  {},
  false,
);

const simulationProvider = await getSimulationProvider({
  acvmWorkingDirectory,
  acvmBinaryPath,
});

const prover = new TestCircuitProver(simulationProvider);
const agent = new LocalProvingAgent(prover);

parentPort!.on('message', async message => {
  if (message === 'start') {
    console.log('Starting agent');
    agent.start(queueClient);
  } else if (message === 'stop') {
    console.log('Stopping agent');
    await agent.stop();
  }
});
