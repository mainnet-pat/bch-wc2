import {
  IConnector,
  WcSignMessageRequest,
  WcSignTransactionRequest,
  WcSignTransactionResponse,
} from "@bch-wc2/interfaces";
import {
  binToHex,
  encodeCashAddress,
  encodeLockingBytecodeP2pkh,
  hexToBin,
  secp256k1,
  sha256,
} from "@bitauth/libauth";
import { signMessage, signWcTransaction } from "./signing.js";

export interface NetworkProvider {
  sendRawTransaction: (hexTransaction: string) => Promise<string>;
}

export class PrivKeyConnector implements IConnector {
  private _connected: boolean = true;
  private _address?: string;

  private privateKey: Uint8Array;
  private walletLockingBytecodeHex: string;
  private pubkeyCompressed: Uint8Array;
  private networkProvider?: NetworkProvider;

  constructor({
    privateKey,
    pubkeyCompressed,
    walletLockingBytecodeHex,
    networkProvider,
  }: {
    privateKey: Uint8Array;
    pubkeyCompressed?: Uint8Array;
    walletLockingBytecodeHex?: string;
    networkProvider?: NetworkProvider;
  }) {
    this.privateKey = privateKey;
    this.networkProvider = networkProvider;

    if (!this.privateKey || this.privateKey.length !== 32) {
      throw new Error("Invalid private key, must be a 32-byte Uint8Array");
    }

    if (!pubkeyCompressed) {
      this.pubkeyCompressed = secp256k1.derivePublicKeyCompressed(
        this.privateKey
      ) as Uint8Array;
    } else {
      this.pubkeyCompressed = pubkeyCompressed;
    }

    if (!walletLockingBytecodeHex) {
      this.walletLockingBytecodeHex = binToHex(
        encodeLockingBytecodeP2pkh(this.pubkeyCompressed) as Uint8Array
      );
    } else {
      this.walletLockingBytecodeHex = walletLockingBytecodeHex;
    }
  }

  async address(): Promise<string | undefined> {
    if (this._address) {
      return this._address;
    }

    if (!this.pubkeyCompressed) {
      this.pubkeyCompressed = secp256k1.derivePublicKeyCompressed(
        this.privateKey
      ) as Uint8Array;
    }

    const address = encodeCashAddress<true>({
      payload: hexToBin(this.walletLockingBytecodeHex),
      prefix: "bitcoincash",
      type: "p2pkh",
    }).address;

    return address;
  }

  async signTransaction(
    options: WcSignTransactionRequest
  ): Promise<WcSignTransactionResponse | undefined> {
    const result = signWcTransaction(options, {
      privateKey: this.privateKey,
      pubkeyCompressed: this.pubkeyCompressed,
      walletLockingBytecodeHex: this.walletLockingBytecodeHex,
    });

    if (options.broadcast) {
      if (!this.networkProvider) {
        throw new Error(
          "NetworkProvider is required for broadcasting transactions"
        );
      }
      await this.networkProvider.sendRawTransaction(binToHex(result));
    }

    return {
      signedTransaction: binToHex(result),
      signedTransactionHash: binToHex(
        sha256.hash(sha256.hash(result)).reverse()
      ),
    };
  }

  async signMessage(
    options: WcSignMessageRequest
  ): Promise<string | undefined> {
    return signMessage(options, this.privateKey);
  }

  async connect(): Promise<void> {
    this._connected = true;
  }

  async connected(): Promise<boolean> {
    return this._connected;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }

  on(
    event: "addressChanged" | "disconnect" | string,
    callback: Function
  ): void {}
}
