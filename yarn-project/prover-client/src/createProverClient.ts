import { type ProverClient } from '@aztec/circuit-types';
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
import { createJsonRpcClient, makeFetch } from '@aztec/foundation/json-rpc/client';

export function createProverClient(url: string, fetch = makeFetch([1, 2, 3], true)): ProverClient {
  const rpc = createJsonRpcClient<ProverClient>(
    url,
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
    'prover',
    fetch,
  );
  return rpc;
}
