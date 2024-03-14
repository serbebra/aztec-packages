import { ENR } from '@chainsafe/enr';

import { DiscV5Service } from './discv5.js';
import { LibP2PNode } from './libp2p_service.js';
import { createLibP2PPeerId } from './util.js';

const {
  PRIVATE_KEY = '0802122016b00d00f30e91f8590883a3483caa190c9aa6295c8798b7ec05d65f6dd59ca1',
  LISTEN_IP = '0.0.0.0',
  LISTEN_PORT = '40100',
  // ANNOUNCE_PORT = '40100',
  // ANNOUNCE_HOSTAME = '/ip4/10.1.0.85',
  BOOTSTRAP_NODE,
} = process.env;

async function main() {
  const peerId = await createLibP2PPeerId(PRIVATE_KEY);

  console.log('peerId: ', peerId.toString());

  const node = await LibP2PNode.new(peerId);
  const discV5 = new DiscV5Service(peerId, LISTEN_IP, +LISTEN_PORT, BOOTSTRAP_NODE);

  node.start();
  console.log('Node started');

  await discV5.start();
  console.log('DiscV5 started');

  // const bootstrapNode = ENR.parse(BOOTSTRAP_NODE);
  // await node.connect(bootstrapNode);

  // console.log('Listening on: ', node.multiaddrs);
  // console.log('Peer ID: ', node.peerId.toB58String());
  // console.log('ENR: ', stringifyFn(node.enr));
  // console.log('Bootstrapping to: ', bootstrapNode);
}

main().catch(err => {
  console.error('Error in DiscV5 node: ', err);
});
