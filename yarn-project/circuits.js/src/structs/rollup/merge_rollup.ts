import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { PreviousRollupData } from './previous_rollup_data.js';

/**
 * Represents inputs of the merge rollup circuit.
 */
export class MergeRollupInputs {
  constructor(
    /**
     * Previous rollup data from the 2 merge or base rollup circuits that preceded this merge rollup circuit.
     */
    public previousRollupData: [PreviousRollupData, PreviousRollupData],
  ) {}

  toBuffer() {
    return serializeToBuffer(this.previousRollupData);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new MergeRollupInputs([reader.readObject(PreviousRollupData), reader.readObject(PreviousRollupData)]);
  }

  toString() {
    return this.toBuffer().toString('hex');
  }

  static fromString(str: string) {
    return MergeRollupInputs.fromBuffer(Buffer.from(str, 'hex'));
  }
}
