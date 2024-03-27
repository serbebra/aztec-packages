import { IntegrationArchver, KVArchiverDataStore } from '@aztec/archiver';
import { L2Block } from '@aztec/circuit-types';
import { createEthereumChain } from '@aztec/ethereum';
import { createDebugLogger } from '@aztec/foundation/log';
import { AztecLmdbStore } from '@aztec/kv-store/lmdb';
import { initStoreForRollup } from '@aztec/kv-store/utils';
import { AztecKVTxPool, createP2PClient } from '@aztec/p2p';
import { DummyProver, IntegrationProver } from '@aztec/prover-client';
import { crreateIntegrationSequencer, getGlobalVariableBuilder } from '@aztec/sequencer-client';
import {
  MerkleTrees,
  ServerWorldStateSynchronizer,
  WorldStateConfig,
  getConfigEnvVars as getWorldStateConfig,
} from '@aztec/world-state';

import { L2BlockReceiver } from '../../../sequencer-client/src/receiver.js';
import { AztecNodeConfig } from '../aztec-node/config.js';
import { AztecNodeService } from '../aztec-node/server.js';
import { getSimulationProvider } from '../aztec-node/simulator-factory.js';

class Publisher implements L2BlockReceiver {
  constructor(private archiver: IntegrationArchver) {}
  public async processL2Block(block: L2Block): Promise<boolean> {
    await this.archiver.addNewL2Block(block);
    return Promise.resolve(true);
  }
  public interrupt(): void {}
  public restart(): void {}
  protected sleepOrInterrupted(): Promise<void> {
    return Promise.resolve();
  }
}

export async function createIntegrationNode(config: AztecNodeConfig) {
  const ethereumChain = createEthereumChain(config.rpcUrl, config.apiKey);
  //validate that the actual chain id matches that specified in configuration
  if (config.chainId !== ethereumChain.chainInfo.id) {
    throw new Error(`RPC URL configured for chain id ${ethereumChain.chainInfo.id} but expected id ${config.chainId}`);
  }

  const log = createDebugLogger('aztec:node');
  const storeLog = createDebugLogger('aztec:node:lmdb');
  const store = await initStoreForRollup(
    AztecLmdbStore.open(config.dataDirectory, false, storeLog),
    config.l1Contracts.rollupAddress,
    storeLog,
  );

  const archiverStore = new KVArchiverDataStore(store, config.maxLogs);
  const archiver = IntegrationArchver.createIntegrationArcvhiver(archiverStore);

  // we identify the P2P transaction protocol by using the rollup contract address.
  // this may well change in future
  config.transactionProtocol = `/aztec/tx/${config.l1Contracts.rollupAddress.toString()}`;

  // create the tx pool and the p2p client, which will need the l2 block source
  const p2pClient = await createP2PClient(store, config, new AztecKVTxPool(store), archiver);

  // now create the merkle trees and the world state synchronizer
  const merkleTrees = await MerkleTrees.new(store);
  const worldStateConfig: WorldStateConfig = getWorldStateConfig();
  const worldStateSynchronizer = new ServerWorldStateSynchronizer(store, merkleTrees, archiver, worldStateConfig);

  // start both and wait for them to sync from the block source
  await Promise.all([p2pClient.start(), worldStateSynchronizer.start()]);

  // start the prover if we have been told to
  const simulationProvider = await getSimulationProvider(config, log);
  const prover = config.disableProver ? await DummyProver.new() : new IntegrationProver(merkleTrees.asLatest());

  const publisher = new Publisher(archiver);

  // now create the sequencer
  const sequencer = config.disableSequencer
    ? undefined
    : await crreateIntegrationSequencer(
        config,
        p2pClient,
        worldStateSynchronizer,
        archiver,
        archiver,
        archiver,
        prover,
        simulationProvider,
        publisher,
      );

  return new AztecNodeService(
    config,
    p2pClient,
    archiver,
    archiver,
    archiver,
    archiver,
    archiver,
    worldStateSynchronizer,
    sequencer,
    ethereumChain.chainInfo.id,
    config.version,
    getGlobalVariableBuilder(config),
    store,
    prover,
    log,
  );
}
