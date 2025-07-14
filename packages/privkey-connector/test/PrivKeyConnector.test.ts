import { binToHex } from '@bitauth/libauth';
import { Contract, MockNetworkProvider, placeholderP2PKHUnlocker, placeholderPublicKey, placeholderSignature, randomUtxo, TransactionBuilder, Utxo } from 'cashscript';
import { generateWcSignTransactionRequest, SendRequest } from 'mainnet-js';
import { describe, expect, test } from 'vitest';
import { PrivKeyConnector, signWcTransaction } from '../src/index.js';
import P2pkhArtifact from './P2pkh.artifact.js';
import { aliceAddress, alicePkh, alicePriv, bobAddress, MockWallet } from './shared.js';

describe("WalletConnect", () => {
  test("Creating unsigned transactions and signing them", async () => {
    const provider = new MockNetworkProvider();
    provider.reset();

    provider.addUtxo(aliceAddress, randomUtxo());
    expect(await provider.getUtxos(bobAddress)).toHaveLength(0);

    const wallet = await MockWallet(provider, alicePriv);

    const sendResponse = await wallet.send(new SendRequest({
      value: 1000,
      cashaddr: bobAddress,
      unit: "sat",
    }), {
      buildUnsigned: true,
      queryBalance: false,
    });

    const wcTransactionObject = generateWcSignTransactionRequest(sendResponse, {
      userPrompt: "Please confirm the transaction",
    });

    const signedTransaction = signWcTransaction(wcTransactionObject, {
      privateKey: wallet.privateKey,
    });

    await provider.sendRawTransaction(binToHex(signedTransaction));

    expect(await provider.getUtxos(bobAddress)).toHaveLength(1);
  });

  test("PrivKeyConnector signing", async () => {
    const provider = new MockNetworkProvider();
    provider.reset();

    provider.addUtxo(aliceAddress, randomUtxo());
    expect(await provider.getUtxos(bobAddress)).toHaveLength(0);

    const wallet = await MockWallet(provider, alicePriv);

    const sendResponse = await wallet.send(new SendRequest({
      value: 1000,
      cashaddr: bobAddress,
      unit: "sat",
    }), {
      buildUnsigned: true,
      queryBalance: false,
    });

    const wcTransactionObject = generateWcSignTransactionRequest(sendResponse, {
      userPrompt: "Please confirm the transaction",
      broadcast: true,
    });

    {
      const privKeyConnector = new PrivKeyConnector({
        privateKey: wallet.privateKey
      });

      await expect(privKeyConnector.signTransaction(wcTransactionObject)).rejects.toThrow("NetworkProvider is required for broadcasting transactions");
    }

    const privKeyConnector = new PrivKeyConnector({
      privateKey: wallet.privateKey,
      networkProvider: provider,
    });

    const signedTransaction = await privKeyConnector.signTransaction(wcTransactionObject);

    expect(signedTransaction).toBeDefined();
    expect(signedTransaction?.signedTransaction).toBeDefined();

    await expect(provider.sendRawTransaction(signedTransaction!.signedTransaction)).rejects.toThrow();

    expect(await provider.getUtxos(bobAddress)).toHaveLength(1);
  });

  test("Cashscript transaction signing", async () => {
    const provider = new MockNetworkProvider();
    provider.reset();

    provider.addUtxo(aliceAddress, randomUtxo());
    expect(await provider.getUtxos(bobAddress)).toHaveLength(0);

    const wallet = await MockWallet(provider, alicePriv);

    const p2pkhContract = new Contract(P2pkhArtifact, [alicePkh], { provider });

    await wallet.send(new SendRequest({
      value: 10000,
      cashaddr: p2pkhContract.address,
      unit: "sat",
    }));

    expect(await p2pkhContract.getUtxos()).toHaveLength(1);

    const p2pkhInput = (await provider.getUtxos(aliceAddress))[0]!;

    const builder = new TransactionBuilder({ provider })
      .addInput(p2pkhInput, placeholderP2PKHUnlocker(aliceAddress))
      .addInput((await p2pkhContract.getUtxos())[0], p2pkhContract.unlock.spend(placeholderPublicKey(), placeholderSignature()))
      .addOutput({ to: bobAddress, amount: 9000n });

    const unsignedTransaction = builder.generateWcTransactionObject({
      userPrompt: "Please confirm the transaction",
      broadcast: false
    });

    const signedTransaction = signWcTransaction(unsignedTransaction, {
      privateKey: wallet.privateKey,
      pubkeyCompressed: wallet.publicKeyCompressed,
    });

    await provider.sendRawTransaction(binToHex(signedTransaction));

    expect(await p2pkhContract.getUtxos()).toHaveLength(0);
    const bobUtxo = (await provider.getUtxos(bobAddress))[0]!;
    expect(bobUtxo).toMatchObject<Partial<Utxo>>({
      satoshis: 9000n,
    });
  });
});
