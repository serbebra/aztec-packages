/* eslint-disable jsdoc/require-jsdoc */
import { type AztecAddress, type DebugLogger, type Wallet } from '@aztec/aztec.js';
import { type TokenContract } from '@aztec/noir-contracts.js/Token';

export class TokenSimulator {
  private balancesPrivate: Map<string, bigint> = new Map();
  private balancePublic: Map<string, bigint> = new Map();
  public totalSupply: bigint = 0n;

  private lookupProvider: Map<string, Wallet> = new Map();

  constructor(protected token: TokenContract, protected logger: DebugLogger, protected accounts: AztecAddress[]) {}

  public addAccount(account: AztecAddress) {
    this.accounts.push(account);
  }

  public setLookupProvider(account: AztecAddress, wallet: Wallet) {
    this.lookupProvider.set(account.toString(), wallet);
  }

  public mintPrivate(amount: bigint) {
    this.totalSupply += amount;
  }

  public mintPublic(to: AztecAddress, amount: bigint) {
    this.totalSupply += amount;
    const value = this.balancePublic.get(to.toString()) || 0n;
    this.balancePublic.set(to.toString(), value + amount);
  }

  public transferPublic(from: AztecAddress, to: AztecAddress, amount: bigint) {
    const fromBalance = this.balancePublic.get(from.toString()) || 0n;
    this.balancePublic.set(from.toString(), fromBalance - amount);
    expect(fromBalance).toBeGreaterThanOrEqual(amount);

    const toBalance = this.balancePublic.get(to.toString()) || 0n;
    this.balancePublic.set(to.toString(), toBalance + amount);
  }

  public transferPrivate(from: AztecAddress, to: AztecAddress, amount: bigint) {
    const fromBalance = this.balancesPrivate.get(from.toString()) || 0n;
    expect(fromBalance).toBeGreaterThanOrEqual(amount);
    this.balancesPrivate.set(from.toString(), fromBalance - amount);

    const toBalance = this.balancesPrivate.get(to.toString()) || 0n;
    this.balancesPrivate.set(to.toString(), toBalance + amount);
  }

  public shield(from: AztecAddress, amount: bigint) {
    const fromBalance = this.balancePublic.get(from.toString()) || 0n;
    expect(fromBalance).toBeGreaterThanOrEqual(amount);
    this.balancePublic.set(from.toString(), fromBalance - amount);
  }

  public redeemShield(to: AztecAddress, amount: bigint) {
    const toBalance = this.balancesPrivate.get(to.toString()) || 0n;
    this.balancesPrivate.set(to.toString(), toBalance + amount);
  }

  public unshield(from: AztecAddress, to: AztecAddress, amount: bigint) {
    const fromBalance = this.balancesPrivate.get(from.toString()) || 0n;
    const toBalance = this.balancePublic.get(to.toString()) || 0n;
    expect(fromBalance).toBeGreaterThanOrEqual(amount);
    this.balancesPrivate.set(from.toString(), fromBalance - amount);
    this.balancePublic.set(to.toString(), toBalance + amount);
  }

  public burnPrivate(from: AztecAddress, amount: bigint) {
    const fromBalance = this.balancesPrivate.get(from.toString()) || 0n;
    expect(fromBalance).toBeGreaterThanOrEqual(amount);
    this.balancesPrivate.set(from.toString(), fromBalance - amount);

    this.totalSupply -= amount;
  }

  public burnPublic(from: AztecAddress, amount: bigint) {
    const fromBalance = this.balancePublic.get(from.toString()) || 0n;
    expect(fromBalance).toBeGreaterThanOrEqual(amount);
    this.balancePublic.set(from.toString(), fromBalance - amount);

    this.totalSupply -= amount;
  }

  public balanceOfPublic(address: AztecAddress) {
    return this.balancePublic.get(address.toString()) || 0n;
  }

  public balanceOfPrivate(address: AztecAddress) {
    return this.balancesPrivate.get(address.toString()) || 0n;
  }

  public async check() {
    expect(await this.token.methods.total_supply().simulate()).toEqual(this.totalSupply);

    // Check public balances
    // @todo Should be done with batch simulations, any PXE can be used.
    for (const address of this.accounts) {
      const actualPublicBalance = await this.token.methods.balance_of_public(address).simulate();
      expect(actualPublicBalance).toEqual(this.balanceOfPublic(address));
    }

    // Check private balances
    // @todo Should be done with batch simulations, but must respect the
    // specified lookup provider to ensure proper data is returned.
    for (const address of this.accounts) {
      const wallet = this.lookupProvider.get(address.toString());
      const asset = wallet ? this.token.withWallet(wallet) : this.token;

      const actualPrivateBalance = await asset.methods.balance_of_private({ address }).simulate();
      expect(actualPrivateBalance).toEqual(this.balanceOfPrivate(address));
    }
  }
}
