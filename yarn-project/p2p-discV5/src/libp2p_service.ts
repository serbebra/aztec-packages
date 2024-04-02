import { ENR } from '@chainsafe/enr';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import type { IncomingStreamData, PeerId, Stream } from '@libp2p/interface';
import type { ServiceMap } from '@libp2p/interface-libp2p';
import { mplex } from '@libp2p/mplex';
import { peerIdFromString } from '@libp2p/peer-id';
import { tcp } from '@libp2p/tcp';
import { multiaddr } from '@multiformats/multiaddr';
import { pipe } from 'it-pipe';
import { Libp2p, Libp2pOptions, ServiceFactoryMap, createLibp2p } from 'libp2p';

import { AztecPeerStore } from './peer_store.js';

// This utility is conceptual and needs to align with actual imports

const {
  LISTEN_IP = '0.0.0.0',
  LISTEN_PORT = '40100',
  ANNOUNCE_PORT = '40100',
  PUBLIC_IP = '',
  // BOOTSTRAP_NODES = '',
} = process.env;

export class LibP2PNode {
  constructor(
    private node: Libp2p,
    private peerId: PeerId,
    private peerStore: AztecPeerStore,
    private protocolId = '/aztec/1.0.0',
  ) {}

  public async start(): Promise<void> {
    if (this.node.status === 'started') {
      throw new Error('Node already started');
    }

    console.log(`Starting P2P node on ${LISTEN_IP}:${LISTEN_PORT}`);
    console.log(`External: ${`/ip4/${PUBLIC_IP}/tcp/${ANNOUNCE_PORT}`}`);

    this.node.addEventListener('peer:discovery', e => {
      console.log(`Discovered peer: ${e.detail.id.toString()}`);
    });

    this.node.addEventListener('peer:connect', async e => {
      const peerId = e.detail;
      await this.handleNewConnection(peerId);
    });

    this.node.addEventListener('peer:disconnect', async e => {
      const peerId = e.detail;
      await this.handlePeerDisconnect(peerId);
    });

    await this.node.handle(this.protocolId, async (incoming: IncomingStreamData) => {
      const { stream } = incoming;
      let msg = Buffer.alloc(0);
      try {
        await pipe(stream, async function (source) {
          for await (const chunk of source) {
            const payload = chunk.subarray();
            msg = Buffer.concat([msg, Buffer.from(payload)]);
          }
        });
        await stream.close();
      } catch {
        console.error('Failed to handle incoming stream');
      }
      if (!msg.length) {
        console.log(`Empty message received from peer ${incoming.connection.remotePeer}`);
      }
      console.log(`\n\n MSG from peer ${incoming.connection.remotePeer}: ${msg.toString('hex')}\n\n`);
    });

    await this.node.start();

    // Check store for existing peers
    const peers = this.peerStore.getAllPeers();
    const peersToConnect = [];
    for (const enr of peers) {
      const peerIdStr = peerIdFromString((await enr.peerId()).toString());
      if (!peerIdStr) {
        console.error('Peer ID not found for enr. Skipping.');
        continue;
      }
      peersToConnect.push(enr);
    }
    await this.connectToPeersIfUnknown(peersToConnect);
  }

  public static async new(peerId: PeerId, peerStore: AztecPeerStore) {
    const bindAddrTcp = `/ip4/${LISTEN_IP}/tcp/${LISTEN_PORT}/p2p/${peerId.toString()}`;

    const opts: Libp2pOptions<ServiceMap> = {
      start: false,
      peerId,
      addresses: {
        listen: [bindAddrTcp],
      },
      transports: [tcp()],
      streamMuxers: [yamux(), mplex()],
      connectionEncryption: [noise()],
    };

    const services: ServiceFactoryMap = {
      identify: identify({ protocolPrefix: 'aztec' }),
    };

    const libp2p = await createLibp2p({ ...opts, services });

    return new LibP2PNode(libp2p, peerId, peerStore);
  }

  public getPerId() {
    if (!this.peerId) {
      throw new Error('Peer ID not available. Ensure libp2p service has been started.');
    }
    return this.peerId!;
  }

  public async connectToPeersIfUnknown(enrs: ENR[]) {
    for (const enr of enrs) {
      const addr = await enr.getFullMultiaddr('tcp');
      if (!addr) {
        // No TCP multiaddr found in ENR. Skipping.
        continue;
      }
      const peerMultiAddr = multiaddr(addr);
      const peerIdStr = peerMultiAddr.getPeerId();

      if (!peerIdStr) {
        throw new Error(`Peer ID not found in discovered node's multiaddr: ${addr}`);
      }

      const peerId = peerIdFromString(peerIdStr);

      // check if peer is already known
      const hasPeer = await this.node.peerStore.has(peerId);

      if (!hasPeer) {
        console.log('dialling peer: ', peerMultiAddr.toString(), peerId);
        try {
          const stream = await this.node.dialProtocol(peerMultiAddr, this.protocolId);

          // dial successful, add to DB
          if (!this.peerStore.getPeer(peerId.toString())) {
            await this.peerStore.addPeer(peerId.toString(), enr);
          }

          await stream.close();
        } catch (error) {
          console.error(`Failed to dial peer: ${peerMultiAddr.toString()}`, error);
        }
      }
    }
  }

  private async handleNewConnection(peerId: PeerId) {
    console.log(`Connected to peer: ${peerId.toString()}. Sending some data.`);
    const stream = await this.node.dialProtocol(peerId, this.protocolId);
    const dataToSend: Uint8Array = new Uint8Array([0x33]); // Example data

    await sendDataOverStream(stream, dataToSend);
    await stream.close();
  }

  private async handlePeerDisconnect(peerId: PeerId) {
    console.log(`Disconnected from peer: ${peerId.toString()}`);
    // TODO: consider better judgement for removing peers, e.g. try reconnecting
    await this.peerStore.removePeer(peerId.toString());
  }
}

async function sendDataOverStream(stream: Stream, data: Uint8Array): Promise<void> {
  await pipe(toAsyncIterable(data), stream.sink);
}

// Convert data to an async iterable using an async generator function
async function* toAsyncIterable(data: Uint8Array): AsyncIterable<Uint8Array> {
  yield data;
}
