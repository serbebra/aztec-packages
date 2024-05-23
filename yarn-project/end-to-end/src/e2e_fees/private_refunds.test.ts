import { AztecAddress, FeePaymentMethod, Wallet, computeAuthWitMessageHash } from '@aztec/aztec.js';
import { type FunctionCall } from '@aztec/circuit-types';
import { FunctionData, type GasSettings } from '@aztec/circuits.js';
import { FunctionSelector } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { PrivateFPCContract, type PrivateTokenContract } from '@aztec/noir-contracts.js';

import { expectMapping } from '../fixtures/utils.js';
import { FeesTest } from './fees_test.js';

describe('e2e_fees/private_refunds', () => {
  let aliceWallet: Wallet;
  let aliceAddress: AztecAddress;
  let privateToken: PrivateTokenContract;
  let privateFPC: PrivateFPCContract;

  let InitialAlicePrivateTokens: bigint;
  let InitialPrivateFPCPrivateTokens: bigint;
  let InitialPrivateFPCGas: bigint;

  const t = new FeesTest('private_payment');

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyFundAliceWithPrivateTokens();
    ({ aliceWallet, aliceAddress, privateFPC, privateToken } = await t.setup());
  });

  afterAll(async () => {
    await t.teardown();
  });

  beforeEach(async () => {
    [[InitialAlicePrivateTokens, InitialPrivateFPCPrivateTokens], [InitialPrivateFPCGas]] = await Promise.all([
      t.privateTokenBalances(aliceAddress, privateFPC.address),
      t.gasBalances(aliceAddress, privateFPC.address),
    ]);
  });

  it('can do private payments and refunds', async () => {
    const tx = await privateToken.methods
      .private_get_name()
      .send({
        fee: {
          gasSettings: t.gasSettings,
          paymentMethod: new PrivateRefundPaymentMethod(privateToken.address, privateFPC.address, aliceWallet),
        },
      })
      .wait();

    expect(tx.transactionFee).toBeGreaterThan(0);

    // const refund = t.maxFee - tx.transactionFee!;

    await expectMapping(
      t.privateTokenBalances,
      [aliceAddress, privateFPC.address],
      [InitialAlicePrivateTokens - tx.transactionFee!, InitialPrivateFPCPrivateTokens + tx.transactionFee!],
    );

    await expectMapping(t.gasBalances, [privateFPC.address], [InitialPrivateFPCGas + tx.transactionFee!]);
  });
});

/**
 * Holds information about how the fee for a transaction is to be paid.
 */
export class PrivateRefundPaymentMethod implements FeePaymentMethod {
  constructor(
    /**
     * The asset used to pay the fee.
     */
    private asset: AztecAddress,
    /**
     * Address which will hold the fee payment.
     */
    private paymentContract: AztecAddress,

    /**
     * An auth witness provider to authorize fee payments
     */
    private wallet: Wallet,
  ) {}

  /**
   * The asset used to pay the fee.
   * @returns The asset used to pay the fee.
   */
  getAsset() {
    return this.asset;
  }

  /**
   * The address which will facilitate the fee payment.
   * @returns The contract address responsible for holding the fee payment.
   */
  getPaymentContract() {
    return this.paymentContract;
  }

  /**
   * Creates a function call to pay the fee in the given asset.
   * @param gasSettings - The gas settings.
   * @returns The function call to pay the fee.
   */
  async getFunctionCalls(gasSettings: GasSettings): Promise<FunctionCall[]> {
    const nonce = Fr.random();
    const maxFee = gasSettings.getFeeLimit();
    const messageHash = computeAuthWitMessageHash(
      this.paymentContract,
      this.wallet.getChainId(),
      this.wallet.getVersion(),
      {
        args: [this.wallet.getCompleteAddress().address, this.paymentContract, maxFee, nonce],
        functionData: new FunctionData(
          FunctionSelector.fromSignature('setup_refund((Field),(Field),Field,Field)'),
          /*isPrivate=*/ true,
          /*isStatic=*/ false,
        ),
        to: this.asset,
      },
    );
    await this.wallet.createAuthWit(messageHash);

    return [
      {
        to: this.getPaymentContract(),
        functionData: new FunctionData(
          FunctionSelector.fromSignature('fund_transaction_privately(Field,(Field),Field)'),
          /*isPrivate=*/ true,
          /*isStatic=*/ false,
        ),
        args: [maxFee, this.asset, nonce],
      },
    ];
  }
}
