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

// This utility is conceptual and needs to align with actual imports

const {
  LISTEN_IP = '0.0.0.0',
  LISTEN_PORT = '40100',
  // ANNOUNCE_PORT = '40100',
  // ANNOUNCE_HOSTAME = '/ip4/10.1.0.85',
  // BOOTSTRAP_NODES = '',
} = process.env;

export class LibP2PNode {
  constructor(private node: Libp2p, private peerId: PeerId, private protocolId = '') {}

  public async start(): Promise<void> {
    if (this.node.status === 'started') {
      throw new Error('Node already started');
    }

    console.log(`Starting P2P node on ${LISTEN_IP}:${LISTEN_PORT}`);

    this.node.addEventListener('peer:discovery', e => {
      console.log(`Discovered peer: ${e.detail.id.toString()}`);
    });

    this.node.addEventListener('peer:connect', e => {
      const peerId = e.detail;
      console.log(`Connected to peer: ${peerId.toString()}`);
      this.handleNewConnection(peerId);
    });

    this.node.addEventListener('peer:disconnect', e => {
      const peerId = e.detail;
      console.log(`Disconnected from peer: ${peerId.toString()}`);
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
      console.log(`RECEIVED MSG from peer ${incoming.connection.remotePeer}: ${msg.toString('hex')}`);
    });

    await this.node.start();
  }

  public static async new(peerId: PeerId) {
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

    return new LibP2PNode(libp2p, peerId);
  }

  public getPerId() {
    if (!this.peerId) {
      throw new Error('Peer ID not available. Ensure libp2p service has been started.');
    }
    return this.peerId!;
  }

  public async connectToPeersIfUnknown(addrs: string[]) {
    for (const addr of addrs) {
      const peerMultiAddr = multiaddr(addr);
      const peerIdStr = peerMultiAddr.getPeerId();

      if (!peerIdStr) {
        throw new Error("Peer ID not found in discovered node's multiaddr");
      }

      const peerId = peerIdFromString(peerIdStr);

      // check if peer is already known
      const hasPeer = await this.node.peerStore.has(peerId);

      if (!hasPeer) {
        console.log('dialling peer: ', peerMultiAddr.toString(), peerId);
        await this.node.dialProtocol(peerMultiAddr, this.protocolId);
      }
    }
  }

  private async handleNewConnection(peerId: PeerId) {
    console.log(`Sending some data to peer: ${peerId}`);
    const stream = await this.node.dialProtocol(peerId, this.protocolId);
    const dataToSend: Uint8Array = new Uint8Array([0x33]); // Example data

    await sendDataOverStream(stream, dataToSend);
    await stream.close();
  }
}

async function sendDataOverStream(stream: Stream, data: Uint8Array): Promise<void> {
  await pipe(toAsyncIterable(data), stream.sink);
}

// Convert data to an async iterable using an async generator function
async function* toAsyncIterable(data: Uint8Array): AsyncIterable<Uint8Array> {
  yield data;
}
