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

    const listenMultiAddrUdp = multiaddr(`/ip4/0.0.0.0/udp/${port}`);

    // set location multiaddr in ENR record
    this.enr.setLocationMultiaddr(multiAddrUdp);
    this.enr.setLocationMultiaddr(multiAddrTcp);

    this.discv5 = Discv5.create({
      enr: this.enr,
      peerId,
      bindAddrs: { ip4: listenMultiAddrUdp },
      config: {
        lookupTimeout: 2000,
      },
    });

    console.log('ENR NodeId: ', this.enr.nodeId);
    console.log('ENR UDP: ', multiAddrUdp.toString());

    (this.discv5 as Discv5EventEmitter).on('discovered', async (enr: ENR) => await this.onDiscovered(enr));
    (this.discv5 as Discv5EventEmitter).on('enrAdded', async (enr: ENR) => {
      console.log('ENR added: ', enr.encodeTxt());
      const multiAddrTcp = await enr.getFullMultiaddr('tcp');
      const multiAddrUdp = await enr.getFullMultiaddr('udp');
      console.log('ENR multiaddr: ', multiAddrTcp?.toString(), multiAddrUdp?.toString());
    });

    (this.discv5 as Discv5EventEmitter).on('peer', (peerId: PeerId) => {
      console.log('peer: ', peerId);
    });

    // Add bootnode ENR if provided
    if (bootnodeEnr) {
      console.log('adding enr: ', bootnodeEnr);
      try {
        this.discv5.addEnr(bootnodeEnr);
      } catch (e) {
        console.error('Error adding bootnode ENR: ', e);
      }
    }
  }

  public async start(): Promise<void> {
    await this.discv5.start();
    this.discoveryInterval = setInterval(async () => {
      const enrs = await this.discv5.findRandomNode();
      if (enrs?.length) {
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

  private async onDiscovered(enr: ENR) {
    await this.libp2pNode.connectToPeersIfUnknown([enr]);
  }
}
