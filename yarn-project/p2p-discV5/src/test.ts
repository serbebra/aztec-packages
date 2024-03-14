import { Discv5, Discv5EventEmitter } from '@chainsafe/discv5';
import { SignableENR } from '@chainsafe/enr';
import { PeerId } from '@libp2p/interface';
import { multiaddr } from '@multiformats/multiaddr';

import { createLibP2PPeerId } from './util.js';

const nodes: Discv5[] = [];

let nodeIdx = 0;
const portBase = 40400;

type Node = {
  peerId: PeerId;
  enr: SignableENR;
  discv5: Discv5;
};
async function getDiscv5Node(): Promise<Node> {
  const idx = nodeIdx++;
  const port = portBase + idx;
  const peerId = await createLibP2PPeerId();
  const enr = SignableENR.createFromPeerId(peerId);

  const bindAddrUdp = `/ip4/127.0.0.1/udp/${port}`;
  const multiAddrUdp = multiaddr(bindAddrUdp);
  enr.setLocationMultiaddr(multiAddrUdp);

  const discv5 = Discv5.create({
    enr,
    peerId,
    bindAddrs: { ip4: multiAddrUdp },
    config: {
      lookupTimeout: 2000,
    },
  }) as Discv5 & Discv5EventEmitter;

  discv5.on('discovered', async (enr: SignableENR) => {
    const addr = await enr.getFullMultiaddr('udp');
    console.log('Discovered new peer', { enr: enr.encodeTxt(), addr });
  });

  nodes.push(discv5);

  await discv5.start();

  return { peerId, enr, discv5 };
}

async function main() {
  const node0 = await getDiscv5Node();
  const node1 = await getDiscv5Node();
  const node2 = await getDiscv5Node();

  node0.discv5.addEnr(node1.enr.toENR());
  node1.discv5.addEnr(node2.enr.toENR());
  const foundNodes = await node0.discv5.findNode(node2.enr.nodeId);
  console.log(
    'found nodes',
    foundNodes.map(enr => enr.encodeTxt()),
  );
}

main().catch(err => {
  console.error('Error in DiscV5 test: ', err);
});
