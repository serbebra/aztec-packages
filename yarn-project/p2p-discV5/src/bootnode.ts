import { Discv5, Discv5EventEmitter } from '@chainsafe/discv5';
import { SignableENR } from '@chainsafe/enr';
import { PeerId } from '@libp2p/interface';
import { Multiaddr, multiaddr } from '@multiformats/multiaddr';

import { createLibP2PPeerId } from './util.js';

const { PRIVATE_KEY } = process.env;

async function main() {
  const peerId = await createLibP2PPeerId(PRIVATE_KEY);
  const enr = SignableENR.createFromPeerId(peerId);
  const multiAddrUdp = multiaddr(`/ip4/127.0.0.1/udp/40400`);
  enr.setLocationMultiaddr(multiAddrUdp);

  const discv5: Discv5 = Discv5.create({
    enr,
    peerId,
    bindAddrs: { ip4: multiAddrUdp },
    config: {
      lookupTimeout: 2000,
    },
  });

  (discv5 as Discv5EventEmitter).on('multiaddrUpdated', (addr: Multiaddr) => {
    console.log('Advertised socket address updated', { addr: addr.toString() });
  });
  (discv5 as Discv5EventEmitter).on('discovered', async (enr: SignableENR) => {
    const addr = await enr.getFullMultiaddr('udp');
    console.log('Discovered new peer', { enr: enr.encodeTxt(), addr });
  });
  (discv5 as Discv5EventEmitter).on('peer', (peerId: PeerId) => {
    console.log('peer: ', peerId);
  });

  await discv5.start();
  const addr = await enr.getFullMultiaddr('udp');

  console.log('Discv5 started');
  // console.log('ENR: ', Buffer.from(enr.encode()).toString('base64'));
  console.log('ENR: ', enr.encodeTxt());
  console.log('addr: ', addr);
  console.log('peerId: ', peerId.toString());
  console.log('nodeId: ', enr.nodeId);
}

main().catch(err => {
  console.error('Error in DiscV5 bootnode: ', err);
});
