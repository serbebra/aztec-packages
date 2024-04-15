import { KVArchiverDataStore } from '@aztec/archiver';
import { mockTx } from '@aztec/circuit-types';
import { AztecAddress, FunctionSelector, GlobalVariables, Header } from '@aztec/circuits.js';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type ContractDataSource, ContractInstanceWithAddress, PublicFunction } from '@aztec/types/contracts';
import { MerkleTreeOperations, MerkleTrees } from '@aztec/world-state';

import { PublicProcessor, PublicProcessorFactory, SimulationProvider, WASMSimulator } from '../index.js';

describe('public processor integration suite', () => {
  let processor: PublicProcessor;
  let simulator: SimulationProvider;
  let merkleDb: MerkleTreeOperations;
  let contractDataSource: ContractDataSource;
  let globalVariables: GlobalVariables;
  let header: Header | undefined;

  beforeEach(async () => {
    simulator = new WASMSimulator();
    const store = openTmpStore(true);
    merkleDb = await MerkleTrees.new(store).then(t => t.asLatest());
    contractDataSource = new ArchiverContractDataSource(store);
    globalVariables = GlobalVariables.empty();
    const factory = new PublicProcessorFactory(merkleDb, contractDataSource, simulator);
    processor = await factory.create(header, globalVariables);
  });

  it('processes a transaction with a public function call', async () => {
    // mockTx
  });
});

// The fact we need this adapter means we are missing an abstraction: the Archiver should NOT be the implementor
// of the DataSource interfaces. We need a class that just implements the DataStore, and another one that takes
// care of the syncing. The Archiver as it is today conflates both.
class ArchiverContractDataSource extends KVArchiverDataStore implements ContractDataSource {
  async getPublicFunction(address: AztecAddress, selector: FunctionSelector): Promise<PublicFunction | undefined> {
    const instance = await this.getContract(address);
    if (!instance) {
      throw new Error(`Contract ${address.toString()} not found`);
    }
    const contractClass = await this.getContractClass(instance.contractClassId);
    if (!contractClass) {
      throw new Error(`Contract class ${instance.contractClassId.toString()} for ${address.toString()} not found`);
    }
    return contractClass.publicFunctions.find(f => f.selector.equals(selector));
  }
  getBlockNumber(): Promise<number> {
    return this.getSynchedL2BlockNumber();
  }
  getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return this.getContractInstance(address);
  }
}
