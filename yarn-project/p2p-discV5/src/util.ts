import { unmarshalPrivateKey } from '@libp2p/crypto/keys';
import { createFromPrivKey, createSecp256k1PeerId } from '@libp2p/peer-id-factory';

/**
 * Create a libp2p peer ID from the private key if provided, otherwise creates a new random ID.
 * @param privateKey - Peer ID private key as hex string
 * @returns The peer ID.
 */
export async function createLibP2PPeerId(privateKey?: string) {
  if (privateKey) {
    const privateKeyObject = await unmarshalPrivateKey(Buffer.from(privateKey, 'hex'));
    const peerId = await createFromPrivKey(privateKeyObject);
    return peerId;
  } else {
    const peerId = await createSecp256k1PeerId();
    return peerId;
  }
}
