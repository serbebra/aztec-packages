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
import { JsonRpcServer } from '@aztec/foundation/json-rpc/server';

import type { ProvingRequest, ProvingRequestResult, ProvingRequestType } from './proving-request.js';

export type GetJobOptions = {
  timeoutSec?: number;
};

export type ProvingJob<T extends ProvingRequest> = {
  id: string;
  request: T;
};

export interface ProvingRequestProducer {
  prove<T extends ProvingRequest>(request: T): Promise<ProvingRequestResult<T['type']>>;
  cancelAll(): void;
}

export interface ProvingQueueConsumer {
  getProvingJob(options?: GetJobOptions): Promise<ProvingJob<ProvingRequest> | null>;
  resolveProvingJob<T extends ProvingRequestType>(jobId: string, result: ProvingRequestResult<T>): Promise<void>;
  rejectProvingJob(jobId: string, reason: Error): Promise<void>;
}

export interface ProvingQueue extends ProvingQueueConsumer, ProvingRequestProducer {}

export function createProvingQueueServer(
  queue: ProvingQueue | ProvingQueueConsumer | ProvingRequestProducer,
): JsonRpcServer {
  return new JsonRpcServer(
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
  );
}

export function createProvingQueueClient(
  url: string,
  namespace?: string,
  fetch = makeFetch([1, 2, 3], false),
): ProvingQueue {
  return createJsonRpcClient(
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
    namespace,
    fetch,
  ) as ProvingQueue;
}

export function createProvingRequestProducerClient(
  url: string,
  namespace?: string,
  fetch = makeFetch([1, 2, 3], false),
): ProvingRequestProducer {
  return createJsonRpcClient<ProvingRequestProducer>(
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
    namespace,
    fetch,
  ) as ProvingRequestProducer;
}

export function createProvingQueueConsumerClient(
  url: string,
  namespace?: string,
  fetch = makeFetch([1, 2, 3], false),
): ProvingQueueConsumer {
  return createJsonRpcClient<ProvingQueueConsumer>(
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
    namespace,
    fetch,
  ) as ProvingQueueConsumer;
}
