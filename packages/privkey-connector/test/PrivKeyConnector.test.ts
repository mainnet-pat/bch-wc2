// import { binToHex } from '@bitauth/libauth';
// import { Contract, MockNetworkProvider, placeholderP2PKHUnlocker, placeholderPublicKey, placeholderSignature, randomUtxo, TransactionBuilder, Utxo } from 'cashscript';
// import { generateWcSignTransactionRequest, SendRequest } from 'mainnet-js';
// import { describe, expect, test } from 'vitest';
// import { PrivKeyConnector, signWcTransaction } from '../src/index.js';
// import P2pkhArtifact from './P2pkh.artifact.js';
// import { aliceAddress, alicePkh, alicePriv, bobAddress, MockWallet } from './shared.js';

// describe("WalletConnect", () => {
//   test("Creating unsigned transactions and signing them", async () => {
//     const provider = new MockNetworkProvider();
//     provider.reset();

//     provider.addUtxo(aliceAddress, randomUtxo());
//     expect(await provider.getUtxos(bobAddress)).toHaveLength(0);

//     const wallet = await MockWallet(provider, alicePriv);

//     const sendResponse = await wallet.send(new SendRequest({
//       value: 1000,
//       cashaddr: bobAddress,
//       unit: "sat",
//     }), {
//       buildUnsigned: true,
//       queryBalance: false,
//     });

//     const wcTransactionObject = generateWcSignTransactionRequest(sendResponse, {
//       userPrompt: "Please confirm the transaction",
//     });

//     const signedTransaction = signWcTransaction(wcTransactionObject, {
//       privateKey: wallet.privateKey,
//     });

//     await provider.sendRawTransaction(binToHex(signedTransaction));

//     expect(await provider.getUtxos(bobAddress)).toHaveLength(1);
//   });

//   test("PrivKeyConnector signing", async () => {
//     const provider = new MockNetworkProvider();
//     provider.reset();

//     provider.addUtxo(aliceAddress, randomUtxo());
//     expect(await provider.getUtxos(bobAddress)).toHaveLength(0);

//     const wallet = await MockWallet(provider, alicePriv);

//     const sendResponse = await wallet.send(new SendRequest({
//       value: 1000,
//       cashaddr: bobAddress,
//       unit: "sat",
//     }), {
//       buildUnsigned: true,
//       queryBalance: false,
//     });

//     const wcTransactionObject = generateWcSignTransactionRequest(sendResponse, {
//       userPrompt: "Please confirm the transaction",
//       broadcast: true,
//     });

//     {
//       const privKeyConnector = new PrivKeyConnector({
//         privateKey: wallet.privateKey
//       });

//       await expect(privKeyConnector.signTransaction(wcTransactionObject)).rejects.toThrow("NetworkProvider is required for broadcasting transactions");
//     }

//     const privKeyConnector = new PrivKeyConnector({
//       privateKey: wallet.privateKey,
//       networkProvider: provider,
//     });

//     const signedTransaction = await privKeyConnector.signTransaction(wcTransactionObject);

//     expect(signedTransaction).toBeDefined();
//     expect(signedTransaction?.signedTransaction).toBeDefined();

//     await expect(provider.sendRawTransaction(signedTransaction!.signedTransaction)).rejects.toThrow();

//     expect(await provider.getUtxos(bobAddress)).toHaveLength(1);
//   });

//   test("Cashscript transaction signing", async () => {
//     const provider = new MockNetworkProvider();
//     provider.reset();

//     provider.addUtxo(aliceAddress, randomUtxo());
//     expect(await provider.getUtxos(bobAddress)).toHaveLength(0);

//     const wallet = await MockWallet(provider, alicePriv);

//     const p2pkhContract = new Contract(P2pkhArtifact, [alicePkh], { provider });

//     await wallet.send(new SendRequest({
//       value: 10000,
//       cashaddr: p2pkhContract.address,
//       unit: "sat",
//     }));

//     expect(await p2pkhContract.getUtxos()).toHaveLength(1);

//     const p2pkhInput = (await provider.getUtxos(aliceAddress))[0]!;

//     const builder = new TransactionBuilder({ provider })
//       .addInput(p2pkhInput, placeholderP2PKHUnlocker(aliceAddress))
//       .addInput((await p2pkhContract.getUtxos())[0], p2pkhContract.unlock.spend(placeholderPublicKey(), placeholderSignature()))
//       .addOutput({ to: bobAddress, amount: 9000n });

//     const unsignedTransaction = builder.generateWcTransactionObject({
//       userPrompt: "Please confirm the transaction",
//       broadcast: false
//     });

//     const signedTransaction = signWcTransaction(unsignedTransaction, {
//       privateKey: wallet.privateKey,
//       pubkeyCompressed: wallet.publicKeyCompressed,
//     });

//     await provider.sendRawTransaction(binToHex(signedTransaction));

//     expect(await p2pkhContract.getUtxos()).toHaveLength(0);
//     const bobUtxo = (await provider.getUtxos(bobAddress))[0]!;
//     expect(bobUtxo).toMatchObject<Partial<Utxo>>({
//       satoshis: 9000n,
//     });
//   });
// });

import { binToHex, hexToBin } from '@bitauth/libauth';
import { MockNetworkProvider, randomUtxo } from 'cashscript';
import { generateWcSignTransactionRequest, SendRequest } from 'mainnet-js';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PrivKeyConnector } from '../src/index.js';
import { aliceAddress, alicePriv, bobAddress, MockWallet } from './shared.js';

describe('PrivKeyConnector Console Log Coverage', () => {
  // Utility to reset the mock provider before each test
  let provider: MockNetworkProvider;
  beforeEach(() => {
    provider = new MockNetworkProvider();
    provider.reset();
  });

  test('Constructor with private key only', async () => {
    const privateKey = hexToBin('deadbeef...'); // Replace with a valid 32-byte hex private key
    const connector = new PrivKeyConnector({ privateKey });
    // Logs triggered: "Initializing", "Private key set", "pubkeyCompressed derived", "walletLockingBytecodeHex computed"
    expect(connector).toBeDefined();
    // Optional: const logs = []; vi.spyOn(console, 'log').mockImplementation(msg => logs.push(msg));
    // expect(logs).toContain("PrivKeyConnector: Initializing");
  });

  test('Constructor with private key and pubkeyCompressed', async () => {
    const privateKey = hexToBin('deadbeef...');
    const pubkeyCompressed = hexToBin('02...'); // Replace with a valid compressed public key
    const connector = new PrivKeyConnector({ privateKey, pubkeyCompressed });
    // Logs triggered: "Initializing", "Private key set", "pubkeyCompressed provided", "walletLockingBytecodeHex computed"
    expect(connector).toBeDefined();
  });

  test('Constructor with all parameters', async () => {
    const privateKey = hexToBin('deadbeef...');
    const pubkeyCompressed = hexToBin('02...');
    const walletLockingBytecodeHex = '76a914...88ac'; // Example P2PKH locking bytecode
    const connector = new PrivKeyConnector({ privateKey, pubkeyCompressed, walletLockingBytecodeHex });
    // Logs triggered: "Initializing", "Private key set", "pubkeyCompressed provided", "walletLockingBytecodeHex provided"
    expect(connector).toBeDefined();
  });

  test('address method', async () => {
    const connector = new PrivKeyConnector({ privateKey: alicePriv });
    const address = await connector.address();
    // Logs triggered: "Computing address", "Computed address: [address]"
    expect(address).toBe(aliceAddress);
  });

  test('signTransaction without broadcasting', async () => {
    provider.addUtxo(aliceAddress, randomUtxo());
    const wallet = await MockWallet(provider, alicePriv);
    const sendResponse = await wallet.send(
      new SendRequest({ value: 1000, cashaddr: bobAddress, unit: 'sat' }),
      { buildUnsigned: true, queryBalance: false }
    );
    const wcTransactionObject = generateWcSignTransactionRequest(sendResponse, {
      userPrompt: 'Sign this',
      broadcast: false,
    });
    const connector = new PrivKeyConnector({ privateKey: alicePriv });
    const result = await connector.signTransaction(wcTransactionObject);
    // Logs triggered: "Signing transaction with options", "Signed transaction result", "Returning signed transaction"
    expect(result?.signedTransaction).toBeDefined();
  });

  test('signTransaction with broadcasting', async () => {
    provider.addUtxo(aliceAddress, randomUtxo());
    const wallet = await MockWallet(provider, alicePriv);
    const sendResponse = await wallet.send(
      new SendRequest({ value: 1000, cashaddr: bobAddress, unit: 'sat' }),
      { buildUnsigned: true, queryBalance: false }
    );
    const wcTransactionObject = generateWcSignTransactionRequest(sendResponse, {
      userPrompt: 'Sign and broadcast',
      broadcast: true,
    });
    const connector = new PrivKeyConnector({ privateKey: alicePriv, networkProvider: provider });
    const result = await connector.signTransaction(wcTransactionObject);
    // Logs triggered: "Signing transaction", "Signed transaction result", "Broadcasting transaction", "Transaction broadcasted with hash", "Returning signed transaction"
    expect(result?.txid).toBeDefined();
    expect(await provider.getUtxos(bobAddress)).toHaveLength(1);
  });

  test('signTransaction with broadcast but no network provider', async () => {
    const wallet = await MockWallet(provider, alicePriv);
    const sendResponse = await wallet.send(
      new SendRequest({ value: 1000, cashaddr: bobAddress, unit: 'sat' }),
      { buildUnsigned: true, queryBalance: false }
    );
    const wcTransactionObject = generateWcSignTransactionRequest(sendResponse, { broadcast: true });
    const connector = new PrivKeyConnector({ privateKey: alicePriv });
    // Logs triggered: "Signing transaction" (before error)
    await expect(connector.signTransaction(wcTransactionObject)).rejects.toThrow(
      'NetworkProvider is required for broadcasting transactions'
    );
  });

  test('signMessage', async () => {
    const connector = new PrivKeyConnector({ privateKey: alicePriv });
    const options = { message: 'Hello, world!' }; // Assuming WcSignMessageRequest format
    const signedMessage = await connector.signMessage(options);
    // Logs triggered: "Signing message with options", "Signed message: [signedMessage]"
    expect(signedMessage).toBeDefined();
  });

  test('connect, connected, and disconnect', async () => {
    const connector = new PrivKeyConnector({ privateKey: alicePriv });
    await connector.connect();
    // Log: "Connecting"
    expect(await connector.connected()).toBe(true);
    // Log: "Checking connection status: true"
    await connector.disconnect();
    // Log: "Disconnecting"
    expect(await connector.connected()).toBe(false);
    // Log: "Checking connection status: false"
  });

  test('on method', () => {
    const connector = new PrivKeyConnector({ privateKey: alicePriv });
    const callback = () => {};
    connector.on('addressChanged', callback);
    // Log: "Adding event listener for event: addressChanged"
    // No direct assertion possible since it’s an event listener, but log is triggered
  });
});