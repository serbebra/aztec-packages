import { createAccounts } from '@aztec/accounts/testing';
import { type AccountWallet, AztecAddress, Fr, computeAuthWitMessageHash } from '@aztec/aztec.js';
import { EscrowableTokenContract } from '@aztec/noir-contracts.js';

import { DUPLICATE_NULLIFIER_ERROR } from '../fixtures/fixtures.js';
import { setupPXEService } from '../fixtures/utils.js';
import { EscrowTokenContractTest, toAddressOption } from './escrowable_token_contract_test.js';

describe('e2e_token_contract transfer private', () => {
  const walletGroup2: AccountWallet[] = [];
  let teardownB: () => Promise<void>;

  const t = new EscrowTokenContractTest('transfer_private');
  let { asset, accounts, tokenSim, wallets, badAccount, aztecNode } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    ({ asset, accounts, tokenSim, wallets, badAccount, aztecNode } = t);

    // We need a fresh PXE
    {
      const { pxe: pxeB, teardown: _teardown } = await setupPXEService(aztecNode!, {}, undefined, true);
      teardownB = _teardown;
      const freshAccounts = await createAccounts(pxeB, 1);
      walletGroup2.push(freshAccounts[0]);

      await wallets[0].registerRecipient(walletGroup2[0].getCompleteAddress());
      await walletGroup2[0].registerRecipient(wallets[0].getCompleteAddress());

      await pxeB.registerContract({
        artifact: EscrowableTokenContract.artifact,
        instance: asset.instance,
      });

      tokenSim.addAccount(walletGroup2[0].getAddress());
    }
  });

  afterAll(async () => {
    await t.teardown();
    await teardownB();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  describe('standard transfers', () => {
    it('transfer less than balance', async () => {
      const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      await asset.methods
        .transfer(
          accounts[0].address,
          accounts[1].address,
          amount,
          0,
          toAddressOption(),
          toAddressOption(),
          toAddressOption(),
        )
        .send()
        .wait();
      tokenSim.transferPrivate(accounts[0].address, accounts[1].address, amount);
    });

    it('transfer to self', async () => {
      const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
      const amount = balance0 / 2n;
      expect(amount).toBeGreaterThan(0n);
      await asset.methods
        .transfer(
          accounts[0].address,
          accounts[0].address,
          amount,
          0,
          toAddressOption(),
          toAddressOption(),
          toAddressOption(),
        )
        .send()
        .wait();
      tokenSim.transferPrivate(accounts[0].address, accounts[0].address, amount);
    });

    it('transfer on behalf of other', async () => {
      const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
      const amount = balance0 / 2n;
      const nonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      // docs:start:authwit_transfer_example
      const action = asset
        .withWallet(wallets[1])
        .methods.transfer(
          accounts[0].address,
          accounts[1].address,
          amount,
          nonce,
          toAddressOption(),
          toAddressOption(),
          toAddressOption(),
        );

      const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
      await wallets[1].addAuthWitness(witness);
      expect(await wallets[0].lookupValidity(wallets[0].getAddress(), { caller: accounts[1].address, action })).toEqual(
        {
          isValidInPrivate: true,
          isValidInPublic: false,
        },
      );
      // docs:end:authwit_transfer_example

      // Perform the transfer
      await action.send().wait();
      tokenSim.transferPrivate(accounts[0].address, accounts[1].address, amount);

      // Perform the transfer again, should fail
      const txReplay = asset
        .withWallet(wallets[1])
        .methods.transfer(
          accounts[0].address,
          accounts[1].address,
          amount,
          nonce,
          toAddressOption(),
          toAddressOption(),
          toAddressOption(),
        )
        .send();
      await expect(txReplay.wait()).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
    });

    describe('failure cases', () => {
      it('transfer less than balance to "no-one"', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        // @todo Should throw a proper error
        await expect(
          asset.methods.transfer(
            accounts[0].address,
            AztecAddress.ZERO,
            amount,
            0,
            toAddressOption(),
            toAddressOption(),
            toAddressOption(),
          ).simulate,
        ).rejects.toThrow();
      });

      it('transfer more than balance', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
        const amount = balance0 + 1n;
        expect(amount).toBeGreaterThan(0n);
        await expect(
          asset.methods
            .transfer(
              accounts[0].address,
              accounts[1].address,
              amount,
              0,
              toAddressOption(),
              toAddressOption(),
              toAddressOption(),
            )
            .simulate(),
        ).rejects.toThrow('Assertion failed: Balance too low');
      });

      it('transfer on behalf of self with non-zero nonce', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
        const amount = balance0 - 1n;
        expect(amount).toBeGreaterThan(0n);
        await expect(
          asset.methods
            .transfer(
              accounts[0].address,
              accounts[1].address,
              amount,
              1,
              toAddressOption(),
              toAddressOption(),
              toAddressOption(),
            )
            .simulate(),
        ).rejects.toThrow('Assertion failed: invalid nonce');
      });

      it('transfer more than balance on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
        const balance1 = await asset.methods.balance_of_private(accounts[1].address).simulate();
        const amount = balance0 + 1n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset
          .withWallet(wallets[1])
          .methods.transfer(
            accounts[0].address,
            accounts[1].address,
            amount,
            nonce,
            toAddressOption(),
            toAddressOption(),
            toAddressOption(),
          );

        // Both wallets are connected to same node and PXE so we could just insert directly using
        // await wallet.signAndAddAuthWitness(messageHash, );
        // But doing it in two actions to show the flow.
        const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
        await wallets[1].addAuthWitness(witness);

        // Perform the transfer
        await expect(action.simulate()).rejects.toThrow('Assertion failed: Balance too low');
        expect(await asset.methods.balance_of_private(accounts[0].address).simulate()).toEqual(balance0);
        expect(await asset.methods.balance_of_private(accounts[1].address).simulate()).toEqual(balance1);
      });

      it('transfer on behalf of other without approval', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
        const amount = balance0 / 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset
          .withWallet(wallets[1])
          .methods.transfer(
            accounts[0].address,
            accounts[1].address,
            amount,
            nonce,
            toAddressOption(),
            toAddressOption(),
            toAddressOption(),
          );
        const messageHash = computeAuthWitMessageHash(
          accounts[1].address,
          wallets[0].getChainId(),
          wallets[0].getVersion(),
          action.request(),
        );

        await expect(action.simulate()).rejects.toThrow(
          `Unknown auth witness for message hash ${messageHash.toString()}`,
        );
      });

      it('transfer on behalf of other, wrong designated caller', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
        const amount = balance0 / 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset
          .withWallet(wallets[2])
          .methods.transfer(
            accounts[0].address,
            accounts[1].address,
            amount,
            nonce,
            toAddressOption(),
            toAddressOption(),
            toAddressOption(),
          );
        const expectedMessageHash = computeAuthWitMessageHash(
          accounts[2].address,
          wallets[0].getChainId(),
          wallets[0].getVersion(),
          action.request(),
        );

        const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
        await wallets[2].addAuthWitness(witness);

        await expect(action.simulate()).rejects.toThrow(
          `Unknown auth witness for message hash ${expectedMessageHash.toString()}`,
        );
        expect(await asset.methods.balance_of_private(accounts[0].address).simulate()).toEqual(balance0);
      });

      it('transfer on behalf of other, cancelled authwit', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
        const amount = balance0 / 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset
          .withWallet(wallets[1])
          .methods.transfer(
            accounts[0].address,
            accounts[1].address,
            amount,
            nonce,
            toAddressOption(),
            toAddressOption(),
            toAddressOption(),
          );

        const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
        await wallets[1].addAuthWitness(witness);

        await wallets[0].cancelAuthWit(witness.requestHash).send().wait();

        // Perform the transfer, should fail because nullifier already emitted
        const txCancelledAuthwit = asset
          .withWallet(wallets[1])
          .methods.transfer(
            accounts[0].address,
            accounts[1].address,
            amount,
            nonce,
            toAddressOption(),
            toAddressOption(),
            toAddressOption(),
          )
          .send();
        await expect(txCancelledAuthwit.wait()).rejects.toThrowError(DUPLICATE_NULLIFIER_ERROR);
      });

      it('transfer on behalf of other, cancelled authwit, flow 2', async () => {
        const balance0 = await asset.methods.balance_of_private(accounts[0].address).simulate();
        const amount = balance0 / 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const action = asset
          .withWallet(wallets[1])
          .methods.transfer(
            accounts[0].address,
            accounts[1].address,
            amount,
            nonce,
            toAddressOption(),
            toAddressOption(),
            toAddressOption(),
          );

        const witness = await wallets[0].createAuthWit({ caller: accounts[1].address, action });
        await wallets[1].addAuthWitness(witness);

        await wallets[0].cancelAuthWit({ caller: accounts[1].address, action }).send().wait();

        // Perform the transfer, should fail because nullifier already emitted
        const txCancelledAuthwit = asset
          .withWallet(wallets[1])
          .methods.transfer(
            accounts[0].address,
            accounts[1].address,
            amount,
            nonce,
            toAddressOption(),
            toAddressOption(),
            toAddressOption(),
          )
          .send();
        await expect(txCancelledAuthwit.wait()).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
      });

      it('transfer on behalf of other, invalid spend_private_authwit on "from"', async () => {
        const nonce = Fr.random();

        // Should fail as the returned value from the badAccount is malformed
        const txCancelledAuthwit = asset
          .withWallet(wallets[1])
          .methods.transfer(
            badAccount.address,
            accounts[1].address,
            0,
            nonce,
            toAddressOption(),
            toAddressOption(),
            toAddressOption(),
          )
          .send();
        await expect(txCancelledAuthwit.wait()).rejects.toThrow(
          "Assertion failed: Message not authorized by account 'result == IS_VALID_SELECTOR'",
        );
      });
    });
  });
});
