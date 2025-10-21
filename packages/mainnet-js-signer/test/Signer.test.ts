import { WcSignTransactionRequest } from "@bch-wc2/interfaces";
import {
  PrivKeyConnector,
  signWcTransaction,
} from "@bch-wc2/privkey-connector";
import { binToHex } from "@bitauth/libauth";
import { NetworkProvider, RegTestWallet } from "mainnet-js";
import { describe, expect, test } from 'vitest';
import { generateWcSignTransactionRequest, WrapWallet } from "../src/Signer";

const ALICE_ID="wif:regtest:cNfsPtqN2bMRS7vH5qd8tR8GMvgXyL5BjnGAKgZ8DYEiCrCCQcP6"

export const processWcSignTransactionRequest = async (
  wcTransactionRequest: WcSignTransactionRequest,
  signingInfo: {
    privateKey: Uint8Array;
    pubkeyCompressed?: Uint8Array;
    walletLockingBytecodeHex?: string;
  },
  networkProvider?: NetworkProvider
): Promise<string> => {
  const signedTransaction = signWcTransaction(
    wcTransactionRequest,
    signingInfo
  );
  const hexSignedTransaction = binToHex(signedTransaction);

  if (wcTransactionRequest.broadcast) {
    if (!networkProvider) {
      throw new Error(
        "NetworkProvider is required for broadcasting transactions"
      );
    }

    await networkProvider.sendRawTransaction(hexSignedTransaction);
  }

  return hexSignedTransaction;
};

describe("Wallet Connect Utility Functions", () => {
  test("should generate a valid WcSignTransactionRequest object and sign it", async () => {
    const wallet = await RegTestWallet.fromId(ALICE_ID);

    const bob = await RegTestWallet.newRandom();

    const sendResponse = await wallet.send(
      {
        cashaddr: bob.cashaddr,
        value: 5000,
        unit: "satoshi",
      },
      {
        buildUnsigned: true,
        queryBalance: false,
      }
    );

    const request = generateWcSignTransactionRequest(sendResponse, {
      broadcast: true,
      userPrompt: "Confirm transaction",
    });

    await expect(
      processWcSignTransactionRequest(
        request,
        {
          privateKey: wallet.privateKey,
          pubkeyCompressed: wallet.publicKeyCompressed,
        },
        undefined
      )
    ).rejects.toThrow(
      "NetworkProvider is required for broadcasting transactions"
    );

    await processWcSignTransactionRequest(
      request,
      {
        privateKey: wallet.privateKey,
        pubkeyCompressed: wallet.publicKeyCompressed,
      },
      wallet.provider
    );

    expect(await bob.getBalance("sat")).toBe(5000);
  });

  test("should sign a transaction with wrapper", async () => {
    const wallet = await RegTestWallet.fromId(ALICE_ID);
    const bob = await RegTestWallet.newRandom();

    const connector = new PrivKeyConnector({
      privateKey: wallet.privateKey,
      pubkeyCompressed: wallet.publicKeyCompressed,
      networkProvider: wallet.provider,
    });

    const wcSigner = WrapWallet(wallet, connector);

    const sendResponse = await wcSigner.send(
      {
        cashaddr: bob.cashaddr,
        value: 5000,
        unit: "satoshi",
      },
      {
        userPrompt: "Confirm transaction",
        broadcast: true,
      }
    );

    expect(sendResponse.signedTransaction).toBeDefined();

    expect(await bob.getBalance("sat")).toBe(5000);

    // check proxy forwards property sets
    wcSigner.name = "New Name";
    expect(wallet.name).toBe("New Name");

    wallet.name = "Alice";
    expect(wcSigner.name).toBe("Alice");
  });
});
