import { PrivKeyConnector } from '@bch-wc2/privkey-connector';
import { Contract, ElectrumNetworkProvider, placeholderP2PKHUnlocker, placeholderPublicKey, placeholderSignature, TransactionBuilder, Utxo } from 'cashscript';
import { RegTestWallet, SendRequest } from 'mainnet-js';
import { describe, expect, test } from 'vitest';
import { WrapBuilder } from '../src/Signer.js';
import P2pkhArtifact from './P2pkh.artifact.js';

const ALICE_ID="wif:regtest:cNfsPtqN2bMRS7vH5qd8tR8GMvgXyL5BjnGAKgZ8DYEiCrCCQcP6"

describe("WalletConnect", () => {
  test("Cashscript transaction signing", async () => {
    const alice = await RegTestWallet.fromId(ALICE_ID);
    const bob = await RegTestWallet.newRandom();

    const provider = new ElectrumNetworkProvider(undefined, {
      electrum: alice.provider.electrum,
      manualConnectionManagement: true,
    });

    const p2pkhContract = new Contract(P2pkhArtifact, [alice.publicKeyHash], { provider });

    await alice.send(new SendRequest({
      value: 10000,
      cashaddr: p2pkhContract.address,
      unit: "sat",
    }));

    expect(await p2pkhContract.getUtxos()).toHaveLength(1);

    const p2pkhInput = (await provider.getUtxos(alice.cashaddr))[0]!;

    const connector = new PrivKeyConnector({
      privateKey: alice.privateKey,
      pubkeyCompressed: alice.publicKeyCompressed,
      networkProvider: alice.provider,
    });

    const builder = new TransactionBuilder({ provider })
      .addInput(p2pkhInput, placeholderP2PKHUnlocker(alice.cashaddr))
      .addInputs(await p2pkhContract.getUtxos(), p2pkhContract.unlock.spend(placeholderPublicKey(), placeholderSignature()))
      .addOutput({ to: bob.cashaddr, amount: p2pkhInput.satoshis - 300n })

    await expect(builder.send()).rejects.toThrow();

    const result = await WrapBuilder(builder, connector).send({ broadcast: true, userPrompt: "Please sign the transaction" });
    expect(result.signedTransactionHash.length).toBeGreaterThan(0);

    expect(await p2pkhContract.getUtxos()).toHaveLength(0);
    const bobUtxo = (await provider.getUtxos(bob.cashaddr))[0]!;
    expect(bobUtxo).toMatchObject<Partial<Utxo>>({
      satoshis: p2pkhInput.satoshis - 300n,
    });
  });

  test("Cashscript transaction signing, raw tx result", async () => {
    const alice = await RegTestWallet.fromId(ALICE_ID);
    const bob = await RegTestWallet.newRandom();

    const provider = new ElectrumNetworkProvider(undefined, {
      electrum: alice.provider.electrum,
      manualConnectionManagement: true,
    });

    const p2pkhContract = new Contract(P2pkhArtifact, [alice.publicKeyHash], { provider });

    await alice.send(new SendRequest({
      value: 10000,
      cashaddr: p2pkhContract.address,
      unit: "sat",
    }));

    expect(await p2pkhContract.getUtxos()).toHaveLength(1);

    const p2pkhInput = (await provider.getUtxos(alice.cashaddr))[0]!;

    const connector = new PrivKeyConnector({
      privateKey: alice.privateKey,
      pubkeyCompressed: alice.publicKeyCompressed,
      networkProvider: alice.provider,
    });

    const builder = new TransactionBuilder({ provider })
      .addInput(p2pkhInput, placeholderP2PKHUnlocker(alice.cashaddr))
      .addInputs(await p2pkhContract.getUtxos(), p2pkhContract.unlock.spend(placeholderPublicKey(), placeholderSignature()))
      .addOutput({ to: bob.cashaddr, amount: p2pkhInput.satoshis - 300n })

    await expect(builder.send()).rejects.toThrow();

    const result = await WrapBuilder(builder, connector).send(true, { broadcast: true, userPrompt: "Please sign the transaction" });
    expect(result.length).toBeGreaterThan(0);

    expect(await p2pkhContract.getUtxos()).toHaveLength(0);
    const bobUtxo = (await provider.getUtxos(bob.cashaddr))[0]!;
    expect(bobUtxo).toMatchObject<Partial<Utxo>>({
      satoshis: p2pkhInput.satoshis - 300n,
    });
  });
});

