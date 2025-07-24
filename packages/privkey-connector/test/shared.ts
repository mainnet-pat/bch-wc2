import { ContractInfo, WcSignTransactionRequest } from "@bch-wc2/interfaces";
import {
  Input,
  Output,
  TransactionCommon,
  binToHex,
  encodeCashAddress,
  encodePrivateKeyWif,
  hash160,
  hexToBin,
  secp256k1,
} from "@bitauth/libauth";
import { MockNetworkProvider, SignatureTemplate } from "cashscript";
import { TestNetWallet, TokenI, UtxoI } from "mainnet-js";
import { NetworkProvider } from "../src/PrivKeyConnector.js";
import { signWcTransaction } from "../src/signing.js";

export const alicePriv = hexToBin("1".repeat(64));
export const aliceSigTemplate = new SignatureTemplate(alicePriv);
export const alicePub = secp256k1.derivePublicKeyCompressed(
  alicePriv
) as Uint8Array;
export const alicePkh = hash160(alicePub);
export const aliceAddress = encodeCashAddress({
  prefix: "bchtest",
  type: "p2pkh",
  payload: alicePkh,
  throwErrors: true,
}).address;

export const bobPriv = hexToBin("2".repeat(64));
export const bobSigTemplate = new SignatureTemplate(bobPriv);
export const bobPub = secp256k1.derivePublicKeyCompressed(
  bobPriv
) as Uint8Array;
export const bobPkh = hash160(bobPub);
export const bobAddress = encodeCashAddress({
  prefix: "bchtest",
  type: "p2pkh",
  payload: bobPkh,
  throwErrors: true,
}).address;

export const MockWallet = async (
  provider: MockNetworkProvider,
  privateKey?: Uint8Array
): Promise<TestNetWallet> => {
  const wif = encodePrivateKeyWif(privateKey ?? alicePriv, "testnet");
  const wallet = await TestNetWallet.fromWIF(wif);
  wallet.getAddressUtxos = async (address?: string): Promise<UtxoI[]> => {
    const utxos = await provider.getUtxos(address ?? wallet.cashaddr);
    return utxos.map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      satoshis: Number(utxo.satoshis),
      token: utxo.token
        ? ({
            amount: utxo.token.amount,
            tokenId: utxo.token.category,
            capability: utxo.token.nft?.capability,
            commitment: utxo.token.nft?.commitment,
          } as TokenI)
        : undefined,
    }));
  };

  wallet.submitTransaction = async (
    transaction: Uint8Array,
    awaitPropagation?: boolean | undefined
  ): Promise<string> => {
    const txid = await provider.sendRawTransaction(binToHex(transaction));
    return txid;
  };

  return wallet;
};

export interface SendResponse {
  unsignedTransaction?: string | TransactionCommon;
  sourceOutputs?: (Input & Output & ContractInfo)[];
}

export interface WcTransactionOptions {
  broadcast?: boolean;
  userPrompt?: string;
}

export const processWcTransactionObject = async (
  wcTransactionObject: WcSignTransactionRequest,
  signingInfo: {
    privateKey: Uint8Array;
    pubkeyCompressed?: Uint8Array;
    walletLockingBytecodeHex?: string;
  },
  networkProvider?: NetworkProvider
): Promise<string> => {
  const signedTransaction = signWcTransaction(wcTransactionObject, signingInfo);
  const hexSignedTransaction = binToHex(signedTransaction);

  if (wcTransactionObject.broadcast) {
    if (!networkProvider) {
      throw new Error(
        "NetworkProvider is required for broadcasting transactions"
      );
    }

    await networkProvider.sendRawTransaction(hexSignedTransaction);
  }

  return hexSignedTransaction;
};
