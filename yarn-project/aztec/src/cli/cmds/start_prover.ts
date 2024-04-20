import { getSimulationProvider } from '@aztec/aztec-node';
import { type ServerList } from '@aztec/foundation/json-rpc/server';
import { TestCircuitProver } from '@aztec/prover-client';
import {
  CircuitProverAgent,
  MemoryProvingQueue,
  type ProvingQueueConsumer,
  createProvingQueueConsumerClient,
  createProvingQueueServer,
} from '@aztec/prover-client/prover-pool';

import { type ServiceStarter, parseModuleOptions } from '../util.js';

type ProverOptions = Partial<{
  queueUrl: string;
  agents: string;
}>;

export const startProver: ServiceStarter = async (options, signalHandlers, logger) => {
  const serverList: ServerList = [];
  const proverOptions: ProverOptions = parseModuleOptions(options.prover);
  let queue: ProvingQueueConsumer;

  if (typeof proverOptions.queueUrl === 'string') {
    logger(`Connecting to proving queue at ${proverOptions.queueUrl}`);
    queue = createProvingQueueConsumerClient(proverOptions.queueUrl, 'provingQueue');
  } else {
    queue = new MemoryProvingQueue();
    const provingQueue = createProvingQueueServer(queue);
    serverList.push({ provingQueue });
    logger(`Started new proving queue`);
  }

  const agentCount = proverOptions.agents ? parseInt(proverOptions.agents, 10) : 1;
  if (agentCount === 0 || !Number.isSafeInteger(agentCount)) {
    logger('Not starting any prover agents');
  } else {
    logger(`Starting ${agentCount} prover agents`);
    for (let i = 0; i < agentCount; i++) {
      const simulator = await getSimulationProvider(options);
      const prover = new TestCircuitProver(simulator);
      const agent = new CircuitProverAgent(prover, 500, `${i}`);

      agent.start(queue);
      signalHandlers.push(() => agent.stop());
    }
  }

  return Promise.resolve(serverList);
};
