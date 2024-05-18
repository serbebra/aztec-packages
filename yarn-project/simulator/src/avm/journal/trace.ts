import { Fr } from '@aztec/foundation/fields';

import {
  type TracedL1toL2MessageCheck,
  type TracedNoteHash,
  type TracedNoteHashCheck,
  type TracedNullifier,
  type TracedNullifierCheck,
  type TracedPublicStorageRead,
  type TracedPublicStorageWrite,
  type TracedUnencryptedL2Log,
} from './trace_types.js';

export const MAX_PUBLIC_STORAGE_READS = 100;
export const MAX_PUBLIC_STORAGE_WRITES = 100;
export const MAX_NOTE_HASH_CHECKS = 100;
export const MAX_NEW_NOTE_HASHES = 100;
export const MAX_NULLIFIER_CHECKS = 100;
export const MAX_NEW_NULLIFIERS = 100;
export const MAX_L1_TO_L2_MESSAGE_CHECKS = 100;
export const MAX_NEW_LOGS_HASHES = 100;

export class WorldStateAccessTrace {
  public accessCounter: number;

  public publicStorageReads: TracedPublicStorageRead[] = [];
  public publicStorageWrites: TracedPublicStorageWrite[] = [];

  public noteHashChecks: TracedNoteHashCheck[] = [];
  public newNoteHashes: TracedNoteHash[] = [];
  public nullifierChecks: TracedNullifierCheck[] = [];
  public newNullifiers: TracedNullifier[] = [];
  public l1ToL2MessageChecks: TracedL1toL2MessageCheck[] = [];
  public newLogsHashes: TracedUnencryptedL2Log[] = [];

  //public contractCalls: TracedContractCall[] = [];
  //public archiveChecks: TracedArchiveLeafCheck[] = [];

  constructor(parentTrace?: WorldStateAccessTrace) {
    this.accessCounter = parentTrace ? parentTrace.accessCounter : 0;
    // TODO(4805): consider tracking the parent's trace vector lengths so we can enforce limits
  }

  public getAccessCounter() {
    return this.accessCounter;
  }

  public tracePublicStorageRead(storageAddress: Fr, slot: Fr, value: Fr, exists: boolean, cached: boolean) {
    // TODO(4805): check if some threshold is reached for max storage reads
    // (need access to parent length, or trace needs to be initialized with parent's contents)
    if (this.publicStorageReads.length >= MAX_PUBLIC_STORAGE_READS) {
      throw new Error(`Exceeded maximum number of public storage reads: ${MAX_PUBLIC_STORAGE_READS}`);
    }
    const traced: TracedPublicStorageRead = {
      //  callPointer: Fr.ZERO,
      storageAddress,
      slot,
      value,
      exists,
      cached,
      counter: new Fr(this.accessCounter),
      //  endLifetime: Fr.ZERO,
    };
    this.publicStorageReads.push(traced);
    this.incrementAccessCounter();
  }

  public tracePublicStorageWrite(storageAddress: Fr, slot: Fr, value: Fr) {
    // TODO(4805): check if some threshold is reached for max storage writes
    // (need access to parent length, or trace needs to be initialized with parent's contents)
    if (this.publicStorageWrites.length >= MAX_PUBLIC_STORAGE_WRITES) {
      throw new Error(`Exceeded maximum number of public storage writes: ${MAX_PUBLIC_STORAGE_WRITES}`);
    }
    const traced: TracedPublicStorageWrite = {
      //  callPointer: Fr.ZERO,
      storageAddress,
      slot,
      value,
      counter: new Fr(this.accessCounter),
      //  endLifetime: Fr.ZERO,
    };
    this.publicStorageWrites.push(traced);
    this.incrementAccessCounter();
  }

  public traceNoteHashCheck(storageAddress: Fr, noteHash: Fr, exists: boolean, leafIndex: Fr) {
    if (this.noteHashChecks.length >= MAX_NOTE_HASH_CHECKS) {
      throw new Error(`Exceeded maximum number of note hash checks: ${MAX_NOTE_HASH_CHECKS}`);
    }
    const traced: TracedNoteHashCheck = {
      // callPointer: Fr.ZERO,
      storageAddress,
      noteHash,
      exists,
      counter: new Fr(this.accessCounter),
      // endLifetime: Fr.ZERO,
      leafIndex,
    };
    this.noteHashChecks.push(traced);
    this.incrementAccessCounter();
  }

  public traceNewNoteHash(storageAddress: Fr, noteHash: Fr) {
    // TODO(4805): check if some threshold is reached for max new note hash
    if (this.newNoteHashes.length >= MAX_NEW_NOTE_HASHES) {
      throw new Error(`Exceeded maximum number of new note hashes: ${MAX_NEW_NOTE_HASHES}`);
    }
    const traced: TracedNoteHash = {
      //  callPointer: Fr.ZERO,
      storageAddress,
      noteHash,
      counter: new Fr(this.accessCounter),
      //  endLifetime: Fr.ZERO,
    };
    this.newNoteHashes.push(traced);
    this.incrementAccessCounter();
  }

  public traceNullifierCheck(storageAddress: Fr, nullifier: Fr, exists: boolean, isPending: boolean, leafIndex: Fr) {
    // TODO(4805): check if some threshold is reached for max new nullifier
    if (this.nullifierChecks.length >= MAX_NULLIFIER_CHECKS) {
      throw new Error(`Exceeded maximum number of nullifier checks: ${MAX_NULLIFIER_CHECKS}`);
    }
    const traced: TracedNullifierCheck = {
      // callPointer: Fr.ZERO,
      storageAddress,
      nullifier,
      exists,
      counter: new Fr(this.accessCounter),
      // endLifetime: Fr.ZERO,
      isPending,
      leafIndex,
    };
    this.nullifierChecks.push(traced);
    this.incrementAccessCounter();
  }

  public traceNewNullifier(storageAddress: Fr, nullifier: Fr) {
    // TODO(4805): check if some threshold is reached for max new nullifier
    if (this.newNullifiers.length >= MAX_NEW_NULLIFIERS) {
      throw new Error(`Exceeded maximum number of new nullifiers: ${MAX_NEW_NULLIFIERS}`);
    }
    const tracedNullifier: TracedNullifier = {
      // callPointer: Fr.ZERO,
      storageAddress,
      nullifier,
      counter: new Fr(this.accessCounter),
      // endLifetime: Fr.ZERO,
    };
    this.newNullifiers.push(tracedNullifier);
    this.incrementAccessCounter();
  }

  public traceL1ToL2MessageCheck(msgHash: Fr, msgLeafIndex: Fr, exists: boolean) {
    // TODO(4805): check if some threshold is reached for max message reads
    if (this.l1ToL2MessageChecks.length >= MAX_L1_TO_L2_MESSAGE_CHECKS) {
      throw new Error(`Exceeded maximum number of L1 to L2 message checks: ${MAX_L1_TO_L2_MESSAGE_CHECKS}`);
    }
    const traced: TracedL1toL2MessageCheck = {
      //callPointer: Fr.ZERO, // FIXME
      leafIndex: msgLeafIndex,
      msgHash: msgHash,
      exists: exists,
      //endLifetime: Fr.ZERO, // FIXME
    };
    this.l1ToL2MessageChecks.push(traced);
    this.incrementAccessCounter();
  }

  public traceNewLog(logHash: Fr) {
    if (this.newLogsHashes.length >= MAX_NEW_LOGS_HASHES) {
      throw new Error(`Exceeded maximum number of new logs hashes: ${MAX_NEW_LOGS_HASHES}`);
    }
    const traced: TracedUnencryptedL2Log = {
      logHash,
      counter: new Fr(this.accessCounter),
    };
    this.newLogsHashes.push(traced);
    this.incrementAccessCounter();
  }

  private incrementAccessCounter() {
    this.accessCounter++;
  }

  /**
   * Merges another trace into this one
   *
   * @param incomingTrace - the incoming trace to merge into this instance
   */
  public acceptAndMerge(incomingTrace: WorldStateAccessTrace) {
    // Merge storage read and write journals
    this.publicStorageReads.push(...incomingTrace.publicStorageReads);
    this.publicStorageWrites.push(...incomingTrace.publicStorageWrites);
    // Merge new note hashes and nullifiers
    this.noteHashChecks.push(...incomingTrace.noteHashChecks);
    this.newNoteHashes.push(...incomingTrace.newNoteHashes);
    this.nullifierChecks.push(...incomingTrace.nullifierChecks);
    this.newNullifiers.push(...incomingTrace.newNullifiers);
    this.l1ToL2MessageChecks.push(...incomingTrace.l1ToL2MessageChecks);
    this.newLogsHashes.push(...incomingTrace.newLogsHashes);
    // it is assumed that the incoming trace was initialized with this as parent, so accept counter
    this.accessCounter = incomingTrace.accessCounter;
  }
}
