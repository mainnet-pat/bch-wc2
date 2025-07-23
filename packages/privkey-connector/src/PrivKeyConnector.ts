import { IConnector, WcSignMessageRequest, WcSignTransactionRequest, WcSignTransactionResponse } from "@bch-wc2/interfaces";
import { binToHex, encodeCashAddress, encodeLockingBytecodeP2pkh, hexToBin, secp256k1, sha256 } from "@bitauth/libauth";
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
    privateKey: Uint8Array,
    pubkeyCompressed?: Uint8Array,
    walletLockingBytecodeHex?: string,
    networkProvider?: NetworkProvider,
  }) {
    console.log("PrivKeyConnector: Initializing");
    this.privateKey = privateKey;
    // Note: Logging private key for debugging only; avoid in production
    console.log("PrivKeyConnector: Private key set: " + binToHex(this.privateKey));
    this.networkProvider = networkProvider;

    if (!this.privateKey || this.privateKey.length !== 32) {
      throw new Error("Invalid private key, must be a 32-byte Uint8Array");
    }

    if (!pubkeyCompressed) {
      this.pubkeyCompressed = secp256k1.derivePublicKeyCompressed(this.privateKey) as Uint8Array;
      console.log("PrivKeyConnector: pubkeyCompressed derived: " + binToHex(this.pubkeyCompressed));
    } else {
      this.pubkeyCompressed = pubkeyCompressed;
      console.log("PrivKeyConnector: pubkeyCompressed provided: " + binToHex(pubkeyCompressed));
    }

    if (!walletLockingBytecodeHex) {
      this.walletLockingBytecodeHex = binToHex(encodeLockingBytecodeP2pkh(this.pubkeyCompressed) as Uint8Array);
      console.log("PrivKeyConnector: walletLockingBytecodeHex computed: " + this.walletLockingBytecodeHex);
    } else {
      this.walletLockingBytecodeHex = walletLockingBytecodeHex;
      console.log("PrivKeyConnector: walletLockingBytecodeHex provided: " + walletLockingBytecodeHex);
    }
  }

  async address(): Promise<string | undefined> {
    console.log("PrivKeyConnector: Computing address");
    if (this._address) {
      console.log("PrivKeyConnector: Returning cached address: " + this._address);
      return this._address;
    }

    if (!this.pubkeyCompressed) {
      this.pubkeyCompressed = secp256k1.derivePublicKeyCompressed(this.privateKey) as Uint8Array;
      console.log("PrivKeyConnector: pubkeyCompressed derived for address: " + binToHex(this.pubkeyCompressed));
    }

    const address = encodeCashAddress<true>({
      payload: hexToBin(this.walletLockingBytecodeHex),
      prefix: "bitcoincash",
      type: "p2pkh",
    }).address;
    console.log("PrivKeyConnector: Computed address: " + address);
    return address;
  }

  async signTransaction(options: WcSignTransactionRequest): Promise<WcSignTransactionResponse | undefined> {
    console.log("PrivKeyConnector: Signing transaction with options: " + JSON.stringify(options));
    const result = signWcTransaction(options, {
      privateKey: this.privateKey,
      pubkeyCompressed: this.pubkeyCompressed,
      walletLockingBytecodeHex: this.walletLockingBytecodeHex,
    });
    console.log("PrivKeyConnector: Signed transaction result: " + binToHex(result));

    if (options.broadcast) {
      if (!this.networkProvider) {
        throw new Error("NetworkProvider is required for broadcasting transactions");
      }
      console.log("PrivKeyConnector: Broadcasting transaction");
      const txHash = await this.networkProvider.sendRawTransaction(binToHex(result));
      console.log("PrivKeyConnector: Transaction broadcasted with hash: " + txHash);
    }

    const signedTransaction = binToHex(result);
    const signedTransactionHash = binToHex(sha256.hash(sha256.hash(result)).reverse());
    console.log("PrivKeyConnector: Returning signed transaction: " + signedTransaction + " with hash: " + signedTransactionHash);
    return {
      signedTransaction,
      signedTransactionHash,
    };
  }

  async signMessage(options: WcSignMessageRequest): Promise<string | undefined> {
    console.log("PrivKeyConnector: Signing message with options: " + JSON.stringify(options));
    const signedMessage = signMessage(options, this.privateKey);
    console.log("PrivKeyConnector: Signed message: " + signedMessage);
    return signedMessage;
  }

  async connect(): Promise<void> {
    console.log("PrivKeyConnector: Connecting");
    this._connected = true;
  }

  async connected(): Promise<boolean> {
    console.log("PrivKeyConnector: Checking connection status: " + this._connected);
    return this._connected;
  }

  async disconnect(): Promise<void> {
    console.log("PrivKeyConnector: Disconnecting");
    this._connected = false;
  }

  on(event: "addressChanged" | "disconnect" | string, callback: Function): void {
    console.log("PrivKeyConnector: Adding event listener for event: " + event);
  }
}