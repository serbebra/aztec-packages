import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { PeerId } from '@libp2p/interface';
import type { ServiceMap } from '@libp2p/interface-libp2p';
import { mplex } from '@libp2p/mplex';
import { tcp } from '@libp2p/tcp';
import { Libp2p, Libp2pOptions, ServiceFactoryMap, createLibp2p } from 'libp2p';

const {
  LISTEN_IP = '0.0.0.0',
  LISTEN_PORT = '40100',
  // ANNOUNCE_PORT = '40100',
  // ANNOUNCE_HOSTAME = '/ip4/10.1.0.85',
  // BOOTSTRAP_NODES = '',
} = process.env;

export class LibP2PNode {
  constructor(private node: Libp2p, private peerId: PeerId) {}

  public start(): void {
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
  }

  public static async new(peerId: PeerId) {
    // const peerId = await createLibP2PPeerId(PRIVATE_KEY);

    // const enr = SignableENR.createFromPeerId(peerId);

    // const bindAddrUdp = `/ip4/${LISTEN_IP}/udp/${LISTEN_PORT}`;
    // const multiAddrUdp = multiaddr(bindAddrUdp);
    const bindAddrTcp = `/ip4/${LISTEN_IP}/tcp/${LISTEN_PORT}`;

    // enr.setLocationMultiaddr(multiAddrUdp);

    // const setupDiscV5 = (options: IDiscv5DiscoveryOptions): (() => PeerDiscovery) => {
    //   return () => new Discv5Discovery(options);
    // };

    // const bootstrapMultiAddr = multiaddr('')

    // const bootNodes = BOOTSTRAP_NODES.split(',');

    const opts: Libp2pOptions<ServiceMap> = {
      start: false,
      peerId,
      addresses: {
        listen: [bindAddrTcp],
      },
      // peerDiscovery: [
      //   setupDiscV5({ peerId, enr, bindAddrs: { ip4: multiAddrUdp.toString() }, bootEnrs: [], enabled: true }),
      // ],
      transports: [tcp()],
      streamMuxers: [yamux(), mplex()],
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

  private handleNewConnection(peerId: PeerId) {
    console.log(`Handling new connection from peer: ${peerId}`);
  }
}
