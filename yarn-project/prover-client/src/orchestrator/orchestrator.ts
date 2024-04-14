import { Body, L2Block, MerkleTreeId, type ProcessedTx, type TxEffect, toTxEffect } from '@aztec/circuit-types';
import {
  type BlockResult,
  PROVING_STATUS,
  type ProvingResult,
  type ProvingTicket,
} from '@aztec/circuit-types/interfaces';
import { type CircuitSimulationStats } from '@aztec/circuit-types/stats';
import {
  type AppendOnlyTreeSnapshot,
  type BaseOrMergeRollupPublicInputs,
  BaseParityInputs,
  type BaseRollupInputs,
  Fr,
  type GlobalVariables,
  L1_TO_L2_MSG_SUBTREE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  type Proof,
  RootParityInput,
  RootParityInputs,
} from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { padArrayEnd } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';
import { type Tuple } from '@aztec/foundation/serialize';
import { elapsed } from '@aztec/foundation/timer';
import { type MerkleTreeOperations } from '@aztec/world-state';

import { inspect } from 'util';

import { type CircuitProver } from '../prover/index.js';
import {
  buildBaseRollupInput,
  createMergeRollupInputs,
  getRootRollupInput,
  getSubtreeSiblingPath,
  getTreeSnapshot,
  validatePartialState,
  validateRootOutput,
  validateTx,
} from './block-building-helpers.js';
import { type MergeRollupInputData, ProvingState } from './proving-state.js';

const logger = createDebugLogger('aztec:prover:proving-orchestrator');

/**
 * Implements an event driven proving scheduler to build the recursive proof tree. The idea being:
 * 1. Transactions are provided to the scheduler post simulation.
 * 2. Tree insertions are performed as required to generate transaction specific proofs
 * 3. Those transaction specific proofs are generated in the necessary order accounting for dependencies
 * 4. Once a transaction is proven, it will be incorporated into a merge proof
 * 5. Merge proofs are produced at each level of the tree until the root proof is produced
 *
 * The proving implementation is determined by the provided prover. This could be for example a local prover or a remote prover pool.
 */

/**
 * Enums and structs to communicate the type of work required in each request.
 */
export enum PROVING_JOB_TYPE {
  STATE_UPDATE,
  BASE_ROLLUP,
  MERGE_ROLLUP,
  ROOT_ROLLUP,
  BASE_PARITY,
  ROOT_PARITY,
  PUBLIC_KERNEL,
}

export type ProvingJob = {
  type: PROVING_JOB_TYPE;
  operation: () => Promise<void>;
};

/**
 * The orchestrator, managing the flow of recursive proving operations required to build the rollup proof tree.
 */
export class ProvingOrchestrator {
  private provingState: ProvingState | undefined = undefined;
  private jobProcessPromise?: Promise<void>;
  private stopped = false;
  constructor(private db: MerkleTreeOperations, private prover: CircuitProver) {}

  public static async new(db: MerkleTreeOperations, prover: CircuitProver) {
    const orchestrator = new ProvingOrchestrator(db, prover);
    await orchestrator.start();
    return Promise.resolve(orchestrator);
  }

  public start() {
    return Promise.resolve();
  }

  public async stop() {
    this.stopped = true;
    await this.jobProcessPromise;
  }

  /**
   * Starts off a new block
   * @param numTxs - The total number of transactions in the block. Must be a power of 2
   * @param globalVariables - The global variables for the block
   * @param l1ToL2Messages - The l1 to l2 messages for the block
   * @param emptyTx - The instance of an empty transaction to be used to pad this block
   * @returns A proving ticket, containing a promise notifying of proving completion
   */
  public async startNewBlock(
    numTxs: number,
    globalVariables: GlobalVariables,
    l1ToL2Messages: Fr[],
    emptyTx: ProcessedTx,
  ): Promise<ProvingTicket> {
    // Check that the length of the array of txs is a power of two
    // See https://graphics.stanford.edu/~seander/bithacks.html#DetermineIfPowerOf2
    if (!Number.isInteger(numTxs) || numTxs < 2 || (numTxs & (numTxs - 1)) !== 0) {
      throw new Error(`Length of txs for the block should be a power of two and at least two (got ${numTxs})`);
    }
    // Cancel any currently proving block before starting a new one
    this.cancelBlock();
    logger.info(`Starting new block with ${numTxs} transactions`);
    // we start the block by enqueueing all of the base parity circuits
    let baseParityInputs: BaseParityInputs[] = [];
    let l1ToL2MessagesPadded: Tuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>;
    try {
      l1ToL2MessagesPadded = padArrayEnd(l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
    } catch (err) {
      throw new Error('Too many L1 to L2 messages');
    }
    baseParityInputs = Array.from({ length: NUM_BASE_PARITY_PER_ROOT_PARITY }, (_, i) =>
      BaseParityInputs.fromSlice(l1ToL2MessagesPadded, i),
    );

    const messageTreeSnapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, this.db);

    const newL1ToL2MessageTreeRootSiblingPathArray = await getSubtreeSiblingPath(
      MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
      L1_TO_L2_MSG_SUBTREE_HEIGHT,
      this.db,
    );

    const newL1ToL2MessageTreeRootSiblingPath = makeTuple(
      L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
      i =>
        i < newL1ToL2MessageTreeRootSiblingPathArray.length ? newL1ToL2MessageTreeRootSiblingPathArray[i] : Fr.ZERO,
      0,
    );

    // Update the local trees to include the new l1 to l2 messages
    await this.db.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2MessagesPadded);

    let provingState: ProvingState | undefined = undefined;

    const promise = new Promise<ProvingResult>((resolve, reject) => {
      provingState = new ProvingState(
        numTxs,
        resolve,
        reject,
        globalVariables,
        l1ToL2MessagesPadded,
        baseParityInputs.length,
        emptyTx,
        messageTreeSnapshot,
        newL1ToL2MessageTreeRootSiblingPath,
      );
    }).catch((reason: string) => ({ status: PROVING_STATUS.FAILURE, reason } as const));

    for (let i = 0; i < baseParityInputs.length; i++) {
      void this.runBaseParityCircuit(provingState, baseParityInputs[i], i);
    }

    this.provingState = provingState;

    const ticket: ProvingTicket = {
      provingPromise: promise,
    };
    return ticket;
  }

  /**
   * The interface to add a simulated transaction to the scheduler
   * @param tx - The transaction to be proven
   */
  public async addNewTx(tx: ProcessedTx): Promise<void> {
    if (!this.provingState) {
      throw new Error(`Invalid proving state, call startNewBlock before adding transactions`);
    }

    if (!this.provingState.isAcceptingTransactions()) {
      throw new Error(`Rollup not accepting further transactions`);
    }

    validateTx(tx);

    logger.info(`Received transaction: ${tx.hash}`);

    // We start the transaction by enqueueing the state updates
    const txIndex = this.provingState.addNewTx(tx);
    await this.prepareBaseRollupInputs(this.provingState, tx);
    this.proveNextPublicFunction(this.provingState, txIndex, 0);
  }

  /**
   * Marks the block as full and pads it to the full power of 2 block size, no more transactions will be accepted.
   */
  public async setBlockCompleted() {
    if (!this.provingState) {
      throw new Error(`Invalid proving state, call startNewBlock before adding transactions or completing the block`);
    }

    // we need to pad the rollup with empty transactions
    logger.info(
      `Padding rollup with ${
        this.provingState.totalNumTxs - this.provingState.transactionsReceived
      } empty transactions`,
    );
    for (let i = this.provingState.transactionsReceived; i < this.provingState.totalNumTxs; i++) {
      const paddingTxIndex = this.provingState.addNewTx(this.provingState.emptyTx);
      await this.prepareBaseRollupInputs(this.provingState, this.provingState!.emptyTx);
      // TODO(@Phil): Properly encapsulate this stuff
      const tx = this.provingState.allTxs[paddingTxIndex];
      const inputs = this.provingState.baseRollupInputs[paddingTxIndex];
      const treeSnapshots = this.provingState.txTreeSnapshots[paddingTxIndex];
      void this.runBaseRollup(this.provingState, BigInt(paddingTxIndex), tx, inputs, treeSnapshots);
    }
  }

  /**
   * Cancel any further proving of the block
   */
  public cancelBlock() {
    this.provingState?.cancel();
  }

  /**
   * Performs the final tree update for the block and returns the fully proven block.
   * @returns The fully proven block and proof.
   */
  public async finaliseBlock() {
    if (!this.provingState || !this.provingState.rootRollupPublicInputs || !this.provingState.finalProof) {
      throw new Error(`Invalid proving state, a block must be proven before it can be finalised`);
    }
    if (this.provingState.block) {
      throw new Error('Block already finalised');
    }

    const rootRollupOutputs = this.provingState.rootRollupPublicInputs;

    logger?.debug(`Updating and validating root trees`);
    await this.db.updateArchive(rootRollupOutputs.header);

    await validateRootOutput(rootRollupOutputs, this.db);

    // Collect all new nullifiers, commitments, and contracts from all txs in this block
    const nonEmptyTxEffects: TxEffect[] = this.provingState!.allTxs.map(tx => toTxEffect(tx)).filter(
      txEffect => !txEffect.isEmpty(),
    );
    const blockBody = new Body(nonEmptyTxEffects);

    const l2Block = L2Block.fromFields({
      archive: rootRollupOutputs.archive,
      header: rootRollupOutputs.header,
      body: blockBody,
    });

    if (!l2Block.body.getTxsEffectsHash().equals(rootRollupOutputs.header.contentCommitment.txsEffectsHash)) {
      logger.debug(inspect(blockBody));
      throw new Error(
        `Txs effects hash mismatch, ${l2Block.body
          .getTxsEffectsHash()
          .toString('hex')} == ${rootRollupOutputs.header.contentCommitment.txsEffectsHash.toString('hex')} `,
      );
    }

    logger.info(`Successfully proven block ${l2Block.number}!`);

    this.provingState.block = l2Block;

    const blockResult: BlockResult = {
      proof: this.provingState.finalProof,
      block: l2Block,
    };

    return blockResult;
  }

  private proveNextPublicFunction(provingState: ProvingState | undefined, txIndex: number, nextFunctionIndex: number) {
    if (!provingState?.verifyState()) {
      logger.debug(`Not executing public function, state invalid`);
      return;
    }
    const request = provingState.getPublicFunction(txIndex, nextFunctionIndex);
    if (!request) {
      // TODO(@Phil): Properly encapsulate this stuff
      const tx = provingState.allTxs[txIndex];
      const inputs = provingState.baseRollupInputs[txIndex];
      const treeSnapshots = provingState.txTreeSnapshots[txIndex];
      void this.runBaseRollup(provingState, BigInt(txIndex), tx, inputs, treeSnapshots);
      return;
    }
    this.proveNextPublicFunction(provingState, txIndex, nextFunctionIndex + 1);
  }

  // Updates the merkle trees for a transaction. The first enqueued job for a transaction
  private async prepareBaseRollupInputs(provingState: ProvingState | undefined, tx: ProcessedTx) {
    if (!provingState?.verifyState()) {
      logger.debug('Not preparing base rollup inputs, state invalid');
      return;
    }
    const inputs = await buildBaseRollupInput(tx, provingState.globalVariables, this.db);
    const promises = [MerkleTreeId.NOTE_HASH_TREE, MerkleTreeId.NULLIFIER_TREE, MerkleTreeId.PUBLIC_DATA_TREE].map(
      async (id: MerkleTreeId) => {
        return { key: id, value: await getTreeSnapshot(id, this.db) };
      },
    );
    const treeSnapshots: Map<MerkleTreeId, AppendOnlyTreeSnapshot> = new Map(
      (await Promise.all(promises)).map(obj => [obj.key, obj.value]),
    );

    if (!provingState?.verifyState()) {
      logger.debug(`Discarding proving job, state no longer valid`);
      return;
    }
    // TODO(@Phil): Properly encapsulate this stuff
    provingState!.baseRollupInputs.push(inputs);
    provingState!.txTreeSnapshots.push(treeSnapshots);
  }

  // Stores the intermediate inputs prepared for a merge proof
  private storeMergeInputs(
    provingState: ProvingState,
    currentLevel: bigint,
    currentIndex: bigint,
    mergeInputs: [BaseOrMergeRollupPublicInputs, Proof],
  ) {
    const mergeLevel = currentLevel - 1n;
    const indexWithinMergeLevel = currentIndex >> 1n;
    const mergeIndex = 2n ** mergeLevel - 1n + indexWithinMergeLevel;
    const subscript = Number(mergeIndex);
    const indexWithinMerge = Number(currentIndex & 1n);
    const ready = provingState.storeMergeInputs(mergeInputs, indexWithinMerge, subscript);
    return { ready, indexWithinMergeLevel, mergeLevel, mergeInputData: provingState.getMergeInputs(subscript) };
  }

  // Executes the base rollup circuit and stored the output as intermediate state for the parent merge/root circuit
  // Executes the next level of merge if all inputs are available
  private async runBaseRollup(
    provingState: ProvingState | undefined,
    index: bigint,
    tx: ProcessedTx,
    inputs: BaseRollupInputs,
    treeSnapshots: Map<MerkleTreeId, AppendOnlyTreeSnapshot>,
  ) {
    if (!provingState?.verifyState()) {
      logger.debug('Not running base rollup, state invalid');
      return;
    }
    const [duration, baseRollupOutputs] = await elapsed(async () => {
      const [rollupOutput, proof] = await this.prover.getBaseRollupProof(inputs);
      validatePartialState(rollupOutput.end, treeSnapshots);
      return { rollupOutput, proof };
    });
    logger.debug(`Simulated base rollup circuit`, {
      eventName: 'circuit-simulation',
      circuitName: 'base-rollup',
      duration,
      inputSize: inputs.toBuffer().length,
      outputSize: baseRollupOutputs.rollupOutput.toBuffer().length,
    } satisfies CircuitSimulationStats);
    if (!provingState?.verifyState()) {
      logger.debug(`Discarding job as state no longer valid`);
      return;
    }
    const currentLevel = provingState.numMergeLevels + 1n;
    logger.info(`Completed base rollup at index ${index}, current level ${currentLevel}`);
    this.storeAndExecuteNextMergeLevel(provingState, currentLevel, index, [
      baseRollupOutputs.rollupOutput,
      baseRollupOutputs.proof,
    ]);
  }

  // Executes the merge rollup circuit and stored the output as intermediate state for the parent merge/root circuit
  // Executes the next level of merge if all inputs are available
  private async runMergeRollup(
    provingState: ProvingState | undefined,
    level: bigint,
    index: bigint,
    mergeInputData: MergeRollupInputData,
  ) {
    if (!provingState?.verifyState()) {
      logger.debug('Not running merge rollup, state invalid');
      return;
    }
    const circuitInputs = createMergeRollupInputs(
      [mergeInputData.inputs[0]!, mergeInputData.proofs[0]!],
      [mergeInputData.inputs[1]!, mergeInputData.proofs[1]!],
    );
    const [duration, circuitOutputs] = await elapsed(() => this.prover.getMergeRollupProof(circuitInputs));
    logger.debug(`Simulated merge rollup circuit`, {
      eventName: 'circuit-simulation',
      circuitName: 'merge-rollup',
      duration,
      inputSize: circuitInputs.toBuffer().length,
      outputSize: circuitOutputs[0].toBuffer().length,
    } satisfies CircuitSimulationStats);
    if (!provingState?.verifyState()) {
      logger.debug(`Discarding job as state no longer valid`);
      return;
    }
    logger.info(`Completed merge rollup at level ${level}, index ${index}`);
    this.storeAndExecuteNextMergeLevel(provingState, level, index, circuitOutputs);
  }

  // Executes the root rollup circuit
  private async runRootRollup(provingState: ProvingState | undefined) {
    if (!provingState?.verifyState()) {
      logger.debug('Not running root rollup, state no longer valid');
      return;
    }
    const mergeInputData = provingState.getMergeInputs(0);
    const rootParityInput = provingState.finalRootParityInput!;

    const rootInput = await getRootRollupInput(
      mergeInputData.inputs[0]!,
      mergeInputData.proofs[0]!,
      mergeInputData.inputs[1]!,
      mergeInputData.proofs[1]!,
      rootParityInput,
      provingState.newL1ToL2Messages,
      provingState.messageTreeSnapshot,
      provingState.messageTreeRootSiblingPath,
      this.db,
    );

    // Simulate and get proof for the root circuit
    const [rootOutput, rootProof] = await this.prover.getRootRollupProof(rootInput);

    logger.info(`Completed root rollup`);

    provingState.rootRollupPublicInputs = rootOutput;
    provingState.finalProof = rootProof;

    const provingResult: ProvingResult = {
      status: PROVING_STATUS.SUCCESS,
    };
    provingState.resolve(provingResult);
  }

  // Executes the base parity circuit and stores the intermediate state for the root parity circuit
  // Enqueues the root parity circuit if all inputs are available
  private async runBaseParityCircuit(provingState: ProvingState | undefined, inputs: BaseParityInputs, index: number) {
    if (!provingState?.verifyState()) {
      logger.debug('Not running base parity, state no longer valid');
      return;
    }
    const [duration, circuitOutputs] = await elapsed(async () => {
      const [parityPublicInputs, proof] = await this.prover.getBaseParityProof(inputs);
      return new RootParityInput(proof, parityPublicInputs);
    });
    logger.debug(`Simulated base parity circuit`, {
      eventName: 'circuit-simulation',
      circuitName: 'base-parity',
      duration,
      inputSize: inputs.toBuffer().length,
      outputSize: circuitOutputs.toBuffer().length,
    } satisfies CircuitSimulationStats);

    if (!provingState?.verifyState()) {
      logger.debug(`Discarding job as state no longer valid`);
      return;
    }
    provingState.setRootParityInputs(circuitOutputs, index);

    if (!provingState.areRootParityInputsReady()) {
      // not ready to run the root parity circuit yet
      return;
    }
    const rootParityInputs = new RootParityInputs(
      provingState.rootParityInput as Tuple<RootParityInput, typeof NUM_BASE_PARITY_PER_ROOT_PARITY>,
    );
    void this.runRootParityCircuit(provingState, rootParityInputs);
  }

  // Runs the root parity circuit ans stored the outputs
  // Enqueues the root rollup proof if all inputs are available
  private async runRootParityCircuit(provingState: ProvingState | undefined, inputs: RootParityInputs) {
    if (!provingState?.verifyState()) {
      logger.debug(`Not running root parity circuit as state is no longer valid`);
      return;
    }
    const [duration, circuitOutputs] = await elapsed(async () => {
      const [parityPublicInputs, proof] = await this.prover.getRootParityProof(inputs);
      return new RootParityInput(proof, parityPublicInputs);
    });
    logger.debug(`Simulated root parity circuit`, {
      eventName: 'circuit-simulation',
      circuitName: 'root-parity',
      duration,
      inputSize: inputs.toBuffer().length,
      outputSize: circuitOutputs.toBuffer().length,
    } satisfies CircuitSimulationStats);

    if (!provingState?.verifyState()) {
      logger.debug(`Discarding job as state no longer valid`);
      return;
    }
    provingState!.finalRootParityInput = circuitOutputs;
    await this.checkAndExecuteRootRollup(provingState);
  }

  private async checkAndExecuteRootRollup(provingState: ProvingState | undefined) {
    if (!provingState?.isReadyForRootRollup()) {
      logger.debug('Not ready for root rollup');
      return;
    }
    await this.runRootRollup(provingState);
  }

  private storeAndExecuteNextMergeLevel(
    provingState: ProvingState,
    currentLevel: bigint,
    currentIndex: bigint,
    mergeInputData: [BaseOrMergeRollupPublicInputs, Proof],
  ) {
    const result = this.storeMergeInputs(provingState, currentLevel, currentIndex, mergeInputData);

    // Are we ready to execute the next circuit?
    if (!result.ready) {
      return;
    }

    if (result.mergeLevel === 0n) {
      void this.checkAndExecuteRootRollup(provingState);
    } else {
      // onto the next merge level
      void this.runMergeRollup(provingState, result.mergeLevel, result.indexWithinMergeLevel, result.mergeInputData);
    }
  }
}
