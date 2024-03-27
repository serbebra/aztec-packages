import {
  Body,
  L2Block,
  MerkleTreeId,
  PROVING_STATUS,
  ProcessedTx,
  ProverClient,
  ProvingResult,
  ProvingSuccess,
  ProvingTicket,
  TxEffect,
  toTxEffect,
} from '@aztec/circuit-types';
import {
  ContentCommitment,
  Fr,
  GlobalVariables,
  Header,
  L1_TO_L2_MSG_SUBTREE_HEIGHT,
  L1_TO_L2_MSG_TREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  makeEmptyProof,
} from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/utils';
import { SHA256Trunc, StandardTree } from '@aztec/merkle-tree';
import { MerkleTreeOperations } from '@aztec/world-state';

import { buildBaseRollupInput, getTreeSnapshot } from '../orchestrator/block-building-helpers.js';

const logger = createDebugLogger('aztec:integration-prover');

export class IntegrationProver implements ProverClient {
  private txs: ProcessedTx[] = [];
  private numTxs = 0;
  private totalTxs = 0;
  private globalVariables?: GlobalVariables;
  private emptyTx?: ProcessedTx;
  private promiseResolve?: (result: ProvingResult) => void;

  constructor(private db: MerkleTreeOperations) {}

  start(): Promise<void> {
    return Promise.resolve();
  }
  stop(): Promise<void> {
    return Promise.resolve();
  }
  startNewBlock(
    numTxs: number,
    globalVariables: GlobalVariables,
    _l1ToL2Messages: Fr[],
    emptyTx: ProcessedTx,
  ): Promise<ProvingTicket> {
    this.numTxs = numTxs;
    this.totalTxs = 2 ** Math.ceil(Math.log2(numTxs));
    this.totalTxs = Math.max(2, this.totalTxs);
    this.globalVariables = globalVariables;
    this.emptyTx = emptyTx;
    this.txs = [];
    const promise = new Promise<ProvingResult>(resolve => {
      this.promiseResolve = resolve;
    }).catch((reason: string) => ({ status: PROVING_STATUS.FAILURE, reason } as const));
    const ticket: ProvingTicket = {
      provingPromise: promise,
    };
    return Promise.resolve(ticket);
  }
  async addNewTx(tx: ProcessedTx): Promise<void> {
    this.txs.push(tx);
    await buildBaseRollupInput(tx, this.globalVariables!, this.db);
    if (this.numTxs > this.txs.length) {
      return Promise.resolve();
    }
    for (let i = this.txs.length; i < this.totalTxs; i++) {
      this.txs.push(this.emptyTx!);
      await buildBaseRollupInput(this.emptyTx!, this.globalVariables!, this.db);
    }
    const txEffects: TxEffect[] = this.txs.map(tx => toTxEffect(tx));

    const blockBody = new Body(txEffects);

    const stateRef = await this.db.getStateReference();
    // const getRootTreeSiblingPath = async (treeId: MerkleTreeId) => {
    //   const { size } = await this.db.getTreeInfo(treeId);
    //   const path = await this.db.getSiblingPath(treeId, size);
    //   return path.toFields();
    // };

    // Get tree snapshots
    //const startL1ToL2MessageTreeSnapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, this.db);

    // Get blocks tree
    const startArchiveSnapshot = await getTreeSnapshot(MerkleTreeId.ARCHIVE, this.db);
    //const newArchiveSiblingPathArray = await getRootTreeSiblingPath(MerkleTreeId.ARCHIVE);

    // const newArchiveSiblingPath = makeTuple(
    //   ARCHIVE_HEIGHT,
    //   i => (i < newArchiveSiblingPathArray.length ? newArchiveSiblingPathArray[i] : Fr.ZERO),
    //   0,
    // );

    const tree = new StandardTree(openTmpStore(true), new SHA256Trunc(), 'temp_l1_tree', L1_TO_L2_MSG_SUBTREE_HEIGHT);
    const l1ToL2MessagesPadded = padArrayEnd([], Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
    await tree.appendLeaves(l1ToL2MessagesPadded.map(msg => msg.toBuffer()));

    const l1Root = tree.getRoot(true);

    logger(`Root: ${l1Root.toString('hex')}`);

    const txEffectsHash = blockBody.getTxsEffectsHash();
    const contentCommitment = ContentCommitment.empty();
    contentCommitment.txsEffectsHash = txEffectsHash;
    contentCommitment.inHash = l1Root;
    const header = new Header(startArchiveSnapshot, contentCommitment, stateRef, this.globalVariables!);
    await this.db.updateArchive(header);
    const archive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, this.db);

    const l2Block = L2Block.fromFields({
      archive: archive,
      header: header,
      body: blockBody,
    });
    const result: ProvingSuccess = {
      status: PROVING_STATUS.SUCCESS,
      proof: makeEmptyProof(),
      block: l2Block,
    };
    this.promiseResolve!(result);
    return Promise.resolve();
  }
}
