import { BlockProver, L1ToL2MessageSource, L2BlockSource } from '@aztec/circuit-types';
import { P2P } from '@aztec/p2p';
import { SimulationProvider } from '@aztec/simulator';
import { ContractDataSource } from '@aztec/types/contracts';
import { WorldStateSynchronizer } from '@aztec/world-state';

import { SequencerClient } from '../client/sequencer-client.js';
import { SequencerClientConfig } from '../config.js';
import { getGlobalVariableBuilder } from '../global_variable_builder/index.js';
import { L2BlockReceiver } from '../receiver.js';
import { Sequencer } from '../sequencer/index.js';
import { PublicProcessorFactory } from '../sequencer/public_processor.js';

export async function crreateIntegrationSequencer(
  config: SequencerClientConfig,
  p2pClient: P2P,
  worldStateSynchronizer: WorldStateSynchronizer,
  contractDataSource: ContractDataSource,
  l2BlockSource: L2BlockSource,
  l1ToL2MessageSource: L1ToL2MessageSource,
  prover: BlockProver,
  simulationProvider: SimulationProvider,
  publisher: L2BlockReceiver,
) {
  const globalsBuilder = getGlobalVariableBuilder(config);
  const merkleTreeDb = worldStateSynchronizer.getLatest();

  const publicProcessorFactory = new PublicProcessorFactory(
    merkleTreeDb,
    contractDataSource,
    l1ToL2MessageSource,
    simulationProvider,
  );

  const sequencer = new Sequencer(
    publisher,
    globalsBuilder,
    p2pClient,
    worldStateSynchronizer,
    prover,
    l2BlockSource,
    l1ToL2MessageSource,
    publicProcessorFactory,
    config,
    config.l1Contracts.gasPortalAddress,
  );

  await sequencer.start();
  return new SequencerClient(sequencer);
}
