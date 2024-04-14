import { PROVING_STATUS, type ProvingFailure } from '@aztec/circuit-types';
import { type GlobalVariables, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
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
import { fr } from '@aztec/circuits.js/testing';
import { range } from '@aztec/foundation/array';
import { createJsonRpcClient } from '@aztec/foundation/json-rpc/client';
import { JsonRpcServer } from '@aztec/foundation/json-rpc/server';
import { createDebugLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type MerkleTreeOperations, MerkleTrees } from '@aztec/world-state';

import { type MemDown, default as memdown } from 'memdown';
import { Worker } from 'worker_threads';

import { LocalProvingAgent } from '../agent_pool/proving_agent.js';
import { InMemoryProvingQueue, type ProvingQueue } from '../agent_pool/proving_queue.js';
import {
  getConfig,
  getSimulationProvider,
  makeBloatedProcessedTx,
  makeEmptyProcessedTestTx,
  makeGlobals,
} from '../mocks/fixtures.js';
import { TestCircuitProver } from '../prover/test_circuit_prover.js';
import { ProvingOrchestrator } from './orchestrator.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

const logger = createDebugLogger('aztec:orchestrator-test');

describe('prover/orchestrator', () => {
  let builder: ProvingOrchestrator;
  let builderDb: MerkleTreeOperations;

  let queue: ProvingQueue;
  let queueServer: JsonRpcServer;
  let agents: LocalProvingAgent[];
  let agentWorkers: Worker[];
  let prover: TestCircuitProver;

  beforeEach(async () => {
    const acvmConfig = await getConfig(logger);
    const simulationProvider = await getSimulationProvider({
      acvmWorkingDirectory: acvmConfig?.acvmWorkingDirectory,
      acvmBinaryPath: acvmConfig?.expectedAcvmPath,
    });
    prover = new TestCircuitProver(simulationProvider);

    queue = new InMemoryProvingQueue();
    queueServer = new JsonRpcServer(
      queue,
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
      [],
    );

    queueServer.start(34829);

    const queueClient = createJsonRpcClient<ProvingQueue>(
      'http://localhost:34829',
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

    agents = [new LocalProvingAgent(prover)];
    agents.forEach(a => a.start(queueClient));
    // agents = [];

    // agentWorkers = [
    //   new Worker(new URL('../../dest/agent_pool/proving_agent_remote.js', import.meta.url), {
    //     workerData: {
    //       acvmWorkingDirectory: acvmConfig?.acvmWorkingDirectory,
    //       acvmBinaryPath: acvmConfig?.expectedAcvmPath,
    //       queueUrl: 'http://localhost:34829',
    //     },
    //   }),
    // ];

    agentWorkers = [];
    agentWorkers.forEach(a => a.postMessage('start'));

    builderDb = await MerkleTrees.new(openTmpStore()).then(t => t.asLatest());
    builder = new ProvingOrchestrator(builderDb, queue);
  }, 20_000);

  afterEach(() => {
    queueServer.stop();
    agents.forEach(a => a.stop());
    agentWorkers.forEach(a => a.postMessage('stop'));
  });

  describe('lifecycle', () => {
    it('cancels current block and switches to new ones', async () => {
      const txs1 = await Promise.all([makeBloatedProcessedTx(builderDb, 1), makeBloatedProcessedTx(builderDb, 2)]);

      const txs2 = await Promise.all([makeBloatedProcessedTx(builderDb, 3), makeBloatedProcessedTx(builderDb, 4)]);

      const globals1: GlobalVariables = makeGlobals(100);
      const globals2: GlobalVariables = makeGlobals(101);

      const l1ToL2Messages = range(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, 1 + 0x400).map(fr);

      const blockTicket1 = await builder.startNewBlock(
        2,
        globals1,
        l1ToL2Messages,
        await makeEmptyProcessedTestTx(builderDb),
      );

      await builder.addNewTx(txs1[0]);
      await builder.addNewTx(txs1[1]);

      // Now we cancel the block. The first block will come to a stop as and when current proofs complete
      builder.cancelBlock();

      const result1 = await blockTicket1.provingPromise;

      // in all likelihood, the block will have a failure code as we cancelled it
      // however it may have actually completed proving before we cancelled in which case it could be a success code
      if (result1.status === PROVING_STATUS.FAILURE) {
        expect((result1 as ProvingFailure).reason).toBe('Proving cancelled');
      }

      await builderDb.rollback();

      const blockTicket2 = await builder.startNewBlock(
        2,
        globals2,
        l1ToL2Messages,
        await makeEmptyProcessedTestTx(builderDb),
      );

      await builder.addNewTx(txs2[0]);
      await builder.addNewTx(txs2[1]);

      const result2 = await blockTicket2.provingPromise;
      expect(result2.status).toBe(PROVING_STATUS.SUCCESS);
      const finalisedBlock = await builder.finaliseBlock();

      expect(finalisedBlock.block.number).toEqual(101);
    }, 60_000);

    it('automatically cancels an incomplete block when starting a new one', async () => {
      const txs1 = await Promise.all([makeBloatedProcessedTx(builderDb, 1), makeBloatedProcessedTx(builderDb, 2)]);

      const txs2 = await Promise.all([makeBloatedProcessedTx(builderDb, 3), makeBloatedProcessedTx(builderDb, 4)]);

      const globals1: GlobalVariables = makeGlobals(100);
      const globals2: GlobalVariables = makeGlobals(101);

      const l1ToL2Messages = range(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, 1 + 0x400).map(fr);

      const blockTicket1 = await builder.startNewBlock(
        2,
        globals1,
        l1ToL2Messages,
        await makeEmptyProcessedTestTx(builderDb),
      );

      await builder.addNewTx(txs1[0]);

      await builderDb.rollback();

      const blockTicket2 = await builder.startNewBlock(
        2,
        globals2,
        l1ToL2Messages,
        await makeEmptyProcessedTestTx(builderDb),
      );

      await builder.addNewTx(txs2[0]);
      await builder.addNewTx(txs2[1]);

      const result1 = await blockTicket1.provingPromise;
      expect(result1.status).toBe(PROVING_STATUS.FAILURE);
      expect((result1 as ProvingFailure).reason).toBe('Proving cancelled');

      const result2 = await blockTicket2.provingPromise;
      expect(result2.status).toBe(PROVING_STATUS.SUCCESS);
      const finalisedBlock = await builder.finaliseBlock();

      expect(finalisedBlock.block.number).toEqual(101);
    }, 60_000);
  });
});
