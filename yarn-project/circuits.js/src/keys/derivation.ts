import { AztecAddress } from '@aztec/foundation/aztec-address';
import { poseidon2Hash, sha512ToGrumpkinScalar } from '@aztec/foundation/crypto';
import { Fq, type Fr, type GrumpkinScalar } from '@aztec/foundation/fields';

import { Grumpkin } from '../barretenberg/crypto/grumpkin/index.js';
import { GeneratorIndex } from '../constants.gen.js';
import { GrumpkinPrivateKey } from '../types/grumpkin_private_key.js';
import { type PublicKey } from '../types/public_key.js';
import { PublicKeys } from '../types/public_keys.js';
import { type KeyPrefix } from './key_types.js';
import { getKeyGenerator } from './utils.js';

const curve = new Grumpkin();

export function computeAppNullifierSecretKey(masterNullifierSecretKey: GrumpkinPrivateKey, app: AztecAddress): Fr {
  return poseidon2Hash([masterNullifierSecretKey.high, masterNullifierSecretKey.low, app, GeneratorIndex.NSK_M]);
}

export function computeAppSecretKey(skM: GrumpkinPrivateKey, app: AztecAddress, keyPrefix: KeyPrefix): Fr {
  const generator = getKeyGenerator(keyPrefix);
  return poseidon2Hash([skM.high, skM.low, app, generator]);
}

export function computeIvpkApp(ivpk: PublicKey, address: AztecAddress) {
  const I = Fq.fromBuffer(poseidon2Hash([address.toField(), ivpk.x, ivpk.y, GeneratorIndex.IVSK_M]).toBuffer());
  return curve.add(curve.mul(Grumpkin.generator, I), ivpk);
}

export function computeIvskApp(ivsk: GrumpkinPrivateKey, address: AztecAddress) {
  const ivpk = curve.mul(Grumpkin.generator, ivsk);
  const I = Fq.fromBuffer(poseidon2Hash([address.toField(), ivpk.x, ivpk.y, GeneratorIndex.IVSK_M]).toBuffer());
  return new Fq((I.toBigInt() + ivsk.toBigInt()) % Fq.MODULUS);
}

export function computeOvskApp(ovsk: GrumpkinPrivateKey, address: AztecAddress) {
  return GrumpkinPrivateKey.fromBuffer(
    poseidon2Hash([address.toField(), ovsk.high, ovsk.low, GeneratorIndex.OVSK_M]).toBuffer(),
  );
}

export function deriveMasterNullifierSecretKey(secretKey: Fr): GrumpkinScalar {
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.NSK_M]);
}

export function deriveMasterIncomingViewingSecretKey(secretKey: Fr): GrumpkinScalar {
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.IVSK_M]);
}

export function deriveMasterOutgoingViewingSecretKey(secretKey: Fr): GrumpkinScalar {
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.OVSK_M]);
}

export function deriveSigningKey(secretKey: Fr): GrumpkinScalar {
  // TODO(#5837): come up with a standard signing key derivation scheme instead of using ivsk_m as signing keys here
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.IVSK_M]);
}

export function computeAddress(publicKeysHash: Fr, partialAddress: Fr) {
  const addressFr = poseidon2Hash([publicKeysHash, partialAddress, GeneratorIndex.CONTRACT_ADDRESS_V1]);
  return AztecAddress.fromField(addressFr);
}

export function derivePublicKeyFromSecretKey(secretKey: Fq) {
  const curve = new Grumpkin();
  return curve.mul(curve.generator(), secretKey);
}

/**
 * Computes secret and public keys and public keys hash from a secret key.
 * @param secretKey - The secret key to derive keys from.
 * @returns The derived keys.
 */
export function deriveKeys(secretKey: Fr) {
  // First we derive master secret keys -  we use sha512 here because this derivation will never take place
  // in a circuit
  const masterNullifierSecretKey = deriveMasterNullifierSecretKey(secretKey);
  const masterIncomingViewingSecretKey = deriveMasterIncomingViewingSecretKey(secretKey);
  const masterOutgoingViewingSecretKey = deriveMasterOutgoingViewingSecretKey(secretKey);
  const masterTaggingSecretKey = sha512ToGrumpkinScalar([secretKey, GeneratorIndex.TSK_M]);

  // Then we derive master public keys
  const masterNullifierPublicKey = derivePublicKeyFromSecretKey(masterNullifierSecretKey);
  const masterIncomingViewingPublicKey = derivePublicKeyFromSecretKey(masterIncomingViewingSecretKey);
  const masterOutgoingViewingPublicKey = derivePublicKeyFromSecretKey(masterOutgoingViewingSecretKey);
  const masterTaggingPublicKey = derivePublicKeyFromSecretKey(masterTaggingSecretKey);

  // We hash the public keys to get the public keys hash
  const publicKeys = new PublicKeys(
    masterNullifierPublicKey,
    masterIncomingViewingPublicKey,
    masterOutgoingViewingPublicKey,
    masterTaggingPublicKey,
  );

  return {
    masterNullifierSecretKey,
    masterIncomingViewingSecretKey,
    masterOutgoingViewingSecretKey,
    masterTaggingSecretKey,
    publicKeys,
  };
}
