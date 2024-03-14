import { Discv5, Discv5EventEmitter } from '@chainsafe/discv5';
import { SignableENR } from '@chainsafe/enr';
import { PeerId } from '@libp2p/interface';
import { Multiaddr, multiaddr } from '@multiformats/multiaddr';

// import { EventEmitter } from 'events';
import { createLibP2PPeerId } from './util.js';

const { PRIVATE_KEY } = process.env;

// declare module '@chainsafe/discv5' {
//   interface Discv5 extends EventEmitter {}
// }

console.log('private key', PRIVATE_KEY);

async function main() {
  const peerId = await createLibP2PPeerId(PRIVATE_KEY);
  const enr = SignableENR.createFromPeerId(peerId);
  const multiAddrUdp = multiaddr(`/ip4/0.0.0.0/udp/40400`);
  enr.setLocationMultiaddr(multiAddrUdp);

  const discv5: Discv5 & Discv5EventEmitter = Discv5.create({
    enr,
    peerId,
    bindAddrs: { ip4: multiAddrUdp },
    config: {
      lookupTimeout: 2000,
    },
    // config: { enrUpdate: !enr.ip && !enr.ip6 },
  });

  discv5.on('multiaddrUpdated', (addr: Multiaddr) => {
    console.log('Advertised socket address updated', { addr: addr.toString() });
  });
  discv5.on('discovered', async (enr: SignableENR) => {
    const addr = await enr.getFullMultiaddr('udp');
    console.log('Discovered new peer', { enr: enr.encodeTxt(), addr });
  });
  discv5.on('peer', (peerId: PeerId) => {
    console.log('peer: ', peerId);
  });
  discv5.on('talkReqReceived', (nodeAddr: string, enr: string, request: any) => {
    console.log('received talk request', { nodeAddr, enr, request });
    const resp = Buffer.from([1, 2, 3]);
    void discv5.sendTalkResp(nodeAddr, request.id, resp);
  });

  await discv5.start();
  const addr = await enr.getFullMultiaddr('udp');

  console.log('Discv5 started');
  // console.log('ENR: ', Buffer.from(enr.encode()).toString('base64'));
  console.log('ENR: ', enr.encodeTxt());
  console.log('addr: ', addr);
  console.log('peerId: ', peerId.toString());
}

main().catch(err => {
  console.error('Error in DiscV5 bootnode: ', err);
});
