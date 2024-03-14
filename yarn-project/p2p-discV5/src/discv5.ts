import { Discv5, Discv5EventEmitter } from '@chainsafe/discv5';
import { ENR, SignableENR } from '@chainsafe/enr';
import { PeerId } from '@libp2p/interface';
import { multiaddr } from '@multiformats/multiaddr';

export class DiscV5Service {
  private discv5: Discv5 & Discv5EventEmitter;
  private enr: SignableENR;
  constructor(peerId: PeerId, hostname: string, port: number, bootnodeEnr?: string) {
    // create ENR from PeerId
    this.enr = SignableENR.createFromPeerId(peerId);

    const multiAddrUdp = multiaddr(`/ip4/${hostname}/udp/${port}`);

    // set location multiaddr in ENR record
    this.enr.setLocationMultiaddr(multiAddrUdp);

    this.discv5 = Discv5.create({
      enr: this.enr,
      peerId,
      bindAddrs: { ip4: multiAddrUdp },
      config: {
        lookupTimeout: 2000,
      },
    });
    this.discv5.on('discovered', this.onDiscovered);
    this.discv5.on('enrAdded', async (enr: ENR) => {
      const multiAddr = await enr.getFullMultiaddr('udp');
      console.log('ENR added', enr.encodeTxt(), multiAddr?.toString());

      this.discv5.sendTalkReq(enr, Buffer.from([0, 1, 2, 3]), 'foo');
      // console.log('looking for peer:', enr.nodeId);
      // const peer = await this.discv5.findNode(enr.nodeId);
      // console.log('peer', peer);
    });

    this.discv5.on('peer', (peerId: PeerId) => {
      console.log('peer: ', peerId);
    });

    // Add bootnode ENR if provided
    if (bootnodeEnr) {
      this.discv5.addEnr(bootnodeEnr);
    }
  }

  public async start(): Promise<void> {
    await this.discv5.start();
  }

  private onDiscovered(enr: ENR) {
    console.log(`DiscV5 Discovered: ${enr.nodeId}, ${enr.getLocationMultiaddr('tcp')}`);
  }
}
