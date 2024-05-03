import { createAccount, createAccounts, getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
import {
  AztecAddress,
  ExtendedNote,
  Fr,
  Note,
  computeSecretHash,
  createDebugLogger,
  createPXEClient,
  waitForPXE,
} from '@aztec/aztec.js';
import { TokenContract, TokenContractArtifact } from '@aztec/noir-contracts.js/Token';

const initialSupply = 1_000_000n;
const tokenName = 'Aztec Token';
const tokenSymbol = 'AZT';

const logger = createDebugLogger('p2p_test');

const PXE_URLs = [
  'http://18.171.149.54:8080',
  'http://3.8.177.82:8080',
  'http://3.8.126.188:8080',
  'http://13.40.99.79:8080',
  'http://3.8.211.176:8080',
];

async function main() {
  logger.info('Hello Aztec!');
  // const pxe = createPXEClient(process.env.PXE_URL || 'http://localhost:8080');
  const pxes = PXE_URLs.map(url => createPXEClient(url));
  // const pxe = pxes[2];
  await Promise.all(pxes.map(pxe => waitForPXE(pxe)));
  // const nodeInfo = await pxe.getNodeInfo();
  // logger.info(`Node info: ${JSON.stringify(nodeInfo)}`);

  // const accounts = await createAccounts(pxe, 4);
  // const accounts = await getDeployedTestAccountsWallets(pxe);

  // logger.info(`Accounts created: ${accounts.length}`);

  // const aliceWallet = accounts[0];
  const aliceWallet = await createAccount(pxes[0]);
  const bobWallet = await createAccount(pxes[1]);
  const charlieWallet = await createAccount(pxes[2]);
  const dickWallet = await createAccount(pxes[3]);

  const alice = aliceWallet.getAddress();
  const bob = bobWallet.getAddress();
  const charlie = charlieWallet.getAddress();
  const dick = dickWallet.getAddress();

  logger.info(`Loaded alice's account at ${alice.toShortString()}`);
  logger.info(`Loaded bob's account at ${bob.toShortString()}`);

  ////////////// DEPLOY OUR TOKEN CONTRACT //////////////

  logger.info(`Deploying token contract...`);

  // Deploy the contract and set Alice as the admin while doing so
  const contract = await TokenContract.deploy(aliceWallet, alice, tokenName, tokenSymbol, 18).send().deployed();
  logger.info(`Contract successfully deployed at address ${contract.address.toShortString()}`);

  // Create the contract abstraction and link it to Alice's wallet for future signing
  const tokenContractAlice = await TokenContract.at(contract.address, aliceWallet);
  await bobWallet.registerContract({ instance: contract.instance, artifact: TokenContractArtifact });
  const tokenContractBob = await TokenContract.at(contract.address, bobWallet);
  await charlieWallet.registerContract({ instance: contract.instance, artifact: TokenContractArtifact });
  const tokenContractCharlie = await TokenContract.at(contract.address, charlieWallet);
  await dickWallet.registerContract({ instance: contract.instance, artifact: TokenContractArtifact });
  const tokenContractDick = await TokenContract.at(contract.address, dickWallet);

  // Create a secret and a corresponding hash that will be used to mint funds privately
  const aliceSecret = Fr.random();
  const aliceSecretHash = computeSecretHash(aliceSecret);

  logger.info(`Minting tokens to Alice...`);
  // Mint the initial supply privately "to secret hash"
  const receipt = await tokenContractAlice.methods.mint_private(initialSupply, aliceSecretHash).send().wait();

  // Add the newly created "pending shield" note to PXE
  const note = new Note([new Fr(initialSupply), aliceSecretHash]);
  await pxes[0].addNote(
    new ExtendedNote(
      note,
      alice,
      contract.address,
      TokenContract.storage.pending_shields.slot,
      TokenContract.notes.TransparentNote.id,
      receipt.txHash,
    ),
  );

  // Make the tokens spendable by redeeming them using the secret (converts the "pending shield note" created above
  // to a "token note")
  await tokenContractAlice.methods.redeem_shield(alice, initialSupply, aliceSecret).send().wait();
  logger.info(`${initialSupply} tokens were successfully minted and redeemed by Alice`);

  // const tokenContractBob = tokenContractAlice.withWallet(bobWallet);
  // const tokenContractCharlie = tokenContractAlice.withWallet(charlieWallet);
  // const tokenContractDick = tokenContractAlice.withWallet(dickWallet);

  await pxes[0].registerRecipient(bobWallet.getCompleteAddress());
  await pxes[0].registerRecipient(charlieWallet.getCompleteAddress());
  await pxes[0].registerRecipient(dickWallet.getCompleteAddress());

  await pxes[1].registerRecipient(aliceWallet.getCompleteAddress());
  await pxes[1].registerRecipient(charlieWallet.getCompleteAddress());
  await pxes[1].registerRecipient(dickWallet.getCompleteAddress());

  await pxes[2].registerRecipient(aliceWallet.getCompleteAddress());
  await pxes[2].registerRecipient(bobWallet.getCompleteAddress());
  await pxes[2].registerRecipient(dickWallet.getCompleteAddress());

  await pxes[3].registerRecipient(aliceWallet.getCompleteAddress());
  await pxes[3].registerRecipient(bobWallet.getCompleteAddress());
  await pxes[3].registerRecipient(charlieWallet.getCompleteAddress());

  // split tokens
  const splitQuantity = 250_000n;

  // BOB
  logger.info(`Transferring ${splitQuantity} tokens from Alice to Bob...`);
  await tokenContractAlice.methods.transfer(alice, bob, splitQuantity, 0).send().wait();

  // Check the new balances
  let aliceBalance = await tokenContractAlice.methods.balance_of_private(alice).simulate();
  logger.info(`Alice's balance ${aliceBalance}`);

  const bobBalance = await tokenContractBob.methods.balance_of_private(bob).simulate();
  logger.info(`bob's balance ${bobBalance}`);

  // CHARLIE
  logger.info(`Transferring ${splitQuantity} tokens from Alice to Charlie...`);
  await tokenContractAlice.methods.transfer(alice, charlie, splitQuantity, 0).send().wait();

  // Check the new balances
  aliceBalance = await tokenContractAlice.methods.balance_of_private(alice).simulate();
  logger.info(`Alice's balance ${aliceBalance}`);

  const charlieBalance = await tokenContractCharlie.methods.balance_of_private(charlie).simulate();
  logger.info(`charlie's balance ${charlieBalance}`);

  // DICK
  logger.info(`Transferring ${splitQuantity} tokens from Alice to Dick...`);
  await tokenContractAlice.methods.transfer(alice, dick, splitQuantity, 0).send().wait();

  // Check the new balances
  aliceBalance = await tokenContractAlice.methods.balance_of_private(alice).simulate();
  logger.info(`Alice's balance ${aliceBalance}`);

  const dickBalance = await tokenContractDick.methods.balance_of_private(dick).simulate();
  logger.info(`dick's balance ${dickBalance}`);

  setInterval(async () => {
    // select random sender
    let randomAccNum = Math.floor(Math.random() * 4);
    const receivers: [string, AztecAddress, TokenContract][] = [
      ['alice', alice, tokenContractAlice],
      ['bob', bob, tokenContractBob],
      ['charlie', charlie, tokenContractCharlie],
      ['dick', dick, tokenContractDick],
    ];

    const [senderName, sender, tokenContractSender] = receivers.splice(randomAccNum, 1)[0];

    // select random receiver
    randomAccNum = Math.floor(Math.random() * 3);
    const [recName, receiver, tokenContractRec] = receivers[randomAccNum];
    const transferQuantity = 1n;
    logger.info(`Transferring ${transferQuantity} tokens from ${senderName} to ${recName}...`);
    await tokenContractSender.methods.transfer(sender, receiver, transferQuantity, 0).send().wait();

    // Check the new balances
    const senderBalance = await tokenContractSender.methods.balance_of_private(sender).simulate();
    logger.info(`${senderName}'s balance ${senderBalance}`);

    const recBalance = await tokenContractRec.methods.balance_of_private(receiver).simulate();
    logger.info(`${recName}'s balance ${recBalance}`);
  }, 60_000);
}

main()
  .catch(error => logger.error(`Error in main: ${error.message}`))
  .finally(() => logger.info('Goodbye Aztec!'));
