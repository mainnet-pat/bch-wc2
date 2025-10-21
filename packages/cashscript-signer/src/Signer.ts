import {
  IConnector,
  WcSignTransactionResponse,
  WcTransactionOptions,
} from "@bch-wc2/interfaces";
import { decodeTransactionUnsafe, hexToBin } from "@bitauth/libauth";
import { PrimitiveType } from "@cashscript/utils";
import { isContractUnlocker, isPlaceholderUnlocker, SignatureTemplate, TransactionBuilder, TransactionDetails } from "cashscript";

interface WcExtensions {
  send(options?: WcTransactionOptions): Promise<TransactionDetails & WcSignTransactionResponse>;
  send(raw: true, options?: WcTransactionOptions): Promise<string>;
}

const handleSend = async (
  builder: TransactionBuilder,
  connector: IConnector,
  args: any[],
  errorMsg: string = "Failed to sign transaction, user may have rejected the request"
): Promise<string | TransactionDetails & WcSignTransactionResponse> => {
  let raw = false;
  let options: WcTransactionOptions | undefined;

  if (typeof args[0] === "boolean") {
    raw = args[0];
    options = args[1];
  } else {
    options = args[0];
  }

  // debug locally when signing with private key connector
  if ("privateKey" in connector) {
    const signatureTemplate = new SignatureTemplate(connector.privateKey as Uint8Array);
    for (const input of builder.inputs) {
      if (isContractUnlocker(input.unlocker)) {
        // replace signature function params
        for (const [index, inputParam] of input.unlocker.abiFunction.inputs.entries()) {
          if (inputParam.type === PrimitiveType.SIG) {
            input.unlocker.params[index] = signatureTemplate;
          } else if (inputParam.type === PrimitiveType.PUBKEY) {
            input.unlocker.params[index] = signatureTemplate.getPublicKey();
          }
        }
      } else if (isPlaceholderUnlocker(input.unlocker)) {
        // replace placeholder p2pkh signatures
        input.unlocker = signatureTemplate.unlockP2PKH();
      }
    }
    builder.debug();
  }

  const signRequest = builder.generateWcTransactionObject(options);

  const signResponse = await connector.signTransaction(signRequest);
  if (!signResponse) {
    throw new Error(errorMsg);
  }

  if (options?.broadcast === true) {
    await builder.provider.sendRawTransaction(signResponse.signedTransaction);
  }

  if (raw === true) {
    return signResponse.signedTransaction;
  }

  const libauthTransaction = decodeTransactionUnsafe(hexToBin(signResponse.signedTransaction));

  return {
    txid: signResponse.signedTransactionHash,
    hex: signResponse.signedTransaction,
    ...libauthTransaction,
    ...signResponse,
  }
}

/**
 * Handles the process of signing and optionally broadcasting a transaction using a provided connector.
 *
 * - If the connector contains a private key, it will locally sign the transaction for debugging purposes.
 * - Generates a WalletConnect transaction object and requests the connector to sign it.
 * - Optionally broadcasts the signed transaction if specified in options.
 * - Returns either the raw signed transaction hex or a detailed transaction object, depending on the `raw` flag.
 *
 * @param builder - The `TransactionBuilder` instance used to construct the transaction.
 * @param connector - The `IConnector` instance used to sign the transaction.
 * @param args - Arguments array. The first argument can be a boolean indicating whether to return raw hex, followed by transaction options.
 * @param errorMsg - Optional custom error message if signing fails.
 * @returns A promise that resolves to either the raw signed transaction hex string or a detailed transaction object.
 * @throws If the signing request is rejected or fails.
 */
export function WrapBuilder(builder: TransactionBuilder, connector: IConnector): TransactionBuilder & WcExtensions {
  if (!builder || !connector) {
    throw new Error("Invalid wallet or connector");
  }

  const proxy = new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        if (["send"].includes(value.name)) {
          return async (...args: any[]) => {
            return handleSend(builder, connector, args);
          }
        }
      }
      return value;
    },
  });

  return proxy as TransactionBuilder & WcExtensions;
}
