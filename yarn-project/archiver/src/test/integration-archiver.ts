import { L2Block, UnencryptedL2Log } from '@aztec/circuit-types';
import { EthAddress } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';

import { Chain, HttpTransport, PublicClient, createPublicClient, http } from 'viem';
import { localhost } from 'viem/chains';

import { Archiver, ArchiverDataStore } from '../index.js';

const logger = createDebugLogger('aztec:integration-archiver');

export class IntegrationArchver extends Archiver {
  constructor(client: PublicClient<HttpTransport, Chain>, private archiverStore: ArchiverDataStore) {
    super(client, EthAddress.ZERO, EthAddress.ZERO, EthAddress.ZERO, EthAddress.ZERO, archiverStore);
  }

  public static createIntegrationArcvhiver(store: ArchiverDataStore) {
    const publicClient = createPublicClient({
      chain: localhost,
      transport: http(''),
    });
    return new IntegrationArchver(publicClient, store);
  }

  public async addNewL2Block(block: L2Block): Promise<void> {
    const encryptedLogs = block.body.encryptedLogs;
    const unencryptedLogs = block.body.unencryptedLogs;

    await this.archiverStore.addBlockBodies([block.body]);

    await this.archiverStore.addLogs(encryptedLogs, unencryptedLogs, block.number);

    const blockLogs = block.body.txEffects
      .flatMap(txEffect => (txEffect ? [txEffect.unencryptedLogs] : []))
      .flatMap(txLog => txLog.unrollLogs())
      .map(log => UnencryptedL2Log.fromBuffer(log));
    await this.storeRegisteredContractClasses(blockLogs, block.number);
    await this.storeDeployedContractInstances(blockLogs, block.number);
    await this.storeBroadcastedIndividualFunctions(blockLogs, block.number);

    const retrievedBlocks = {
      lastProcessedL1BlockNumber: 0n,
      retrievedData: [block],
    };

    logger(`Adding block ${retrievedBlocks.retrievedData[0].header.globalVariables.blockNumber}`);
    await this.archiverStore.addBlocks(retrievedBlocks);
  }
}
