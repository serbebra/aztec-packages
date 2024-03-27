import { Discv5, Discv5EventEmitter } from '@chainsafe/discv5';
import { ENR, SignableENR } from '@chainsafe/enr';
import { PeerId } from '@libp2p/interface';
import { multiaddr } from '@multiformats/multiaddr';

import { LibP2PNode } from './libp2p_service.js';

export class DiscV5Service {
  private discv5: Discv5;
  private enr: SignableENR;
  private discoveryInterval: NodeJS.Timeout | null = null;
  constructor(private libp2pNode: LibP2PNode, peerId: PeerId, hostname: string, port: number, bootnodeEnr?: string) {
    // create ENR from PeerId
    this.enr = SignableENR.createFromPeerId(peerId);

    const multiAddrUdp = multiaddr(`/ip4/${hostname}/udp/${port}/p2p/${peerId.toString()}`);
    const multiAddrTcp = multiaddr(`/ip4/${hostname}/tcp/${port}/p2p/${peerId.toString()}`);

    // set location multiaddr in ENR record
    this.enr.setLocationMultiaddr(multiAddrUdp);
    this.enr.setLocationMultiaddr(multiAddrTcp);

    this.discv5 = Discv5.create({
      enr: this.enr,
      peerId,
      bindAddrs: { ip4: multiAddrUdp },
      config: {
        lookupTimeout: 2000,
      },
    });

    console.log('ENR NodeId: ', this.enr.nodeId);

    (this.discv5 as Discv5EventEmitter).on('discovered', this.onDiscovered);
    (this.discv5 as Discv5EventEmitter).on('enrAdded', async (enr: ENR) => {
      const multiAddrTcp = await enr.getFullMultiaddr('tcp');
      const multiAddrUdp = await enr.getFullMultiaddr('udp');
      console.log('ENR added', multiAddrTcp?.toString(), multiAddrUdp?.toString());
    });

    (this.discv5 as Discv5EventEmitter).on('peer', (peerId: PeerId) => {
      console.log('peer: ', peerId);
    });

    // Add bootnode ENR if provided
    if (bootnodeEnr) {
      console.log('adding enr: ', bootnodeEnr);
      this.discv5.addEnr(bootnodeEnr);
    }
  }

  public async start(): Promise<void> {
    await this.discv5.start();
    this.discoveryInterval = setInterval(async () => {
      const enrs = await this.discv5.findRandomNode();
      if (enrs?.length) {
        console.log(
          'Found random nodes: ',
          enrs.map(n => n.nodeId.toString()),
        );

        // Filter peers with TCP multiaddrs
        const peerEnrs = (
          await Promise.all(
            enrs.map(async enr => {
              const multiAddrTcp = await enr.getFullMultiaddr('tcp');
              return multiAddrTcp ? enr : null;
            }),
          )
        ).filter((enr): enr is ENR => !!enr);

        // Connect to peers in libp2p
        await this.libp2pNode.connectToPeersIfUnknown(peerEnrs);
      }
    }, 2000);
  }

  private onDiscovered(enr: ENR) {
    console.log(`DiscV5 Discovered: ${enr.nodeId}, ${enr.getLocationMultiaddr('udp')}`);
  }
}
