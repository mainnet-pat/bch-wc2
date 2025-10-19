import {
  IConnector,
  WcSignTransactionRequest,
  WcSignTransactionResponse,
  WcTransactionOptions,
} from "@bch-wc2/interfaces";
import {
  BaseWallet,
  OpReturnData,
  SendRequest,
  SendRequestArray,
  SendRequestOptionsI,
  SendRequestType,
  SendResponse,
  TokenBurnRequest,
  TokenGenesisRequest,
  TokenMintRequest,
  TokenSendRequest,
} from "mainnet-js";

export const generateWcSignTransactionRequest = (
  sendResponse: SendResponse,
  options?: WcTransactionOptions
): WcSignTransactionRequest => {
  if (!sendResponse.unsignedTransaction || !sendResponse.sourceOutputs) {
    throw new Error(
      "SendResponse does not contain an unsigned transaction or source outputs"
    );
  }

  return {
    ...options,
    transaction: sendResponse.unsignedTransaction,
    sourceOutputs: sendResponse.sourceOutputs,
  };
};

const handleTransaction = async <T>(
  wallet: T,
  connector: IConnector,
  walletMethod: (...args: any[]) => Promise<SendResponse>,
  args: any[],
  errorMsg: string = "Failed to sign transaction, user may have rejected the request"
): Promise<SendResponse & WcSignTransactionResponse> => {
  const params = args.slice(0, -1);
  const options = args.at(-1);

  const response = await walletMethod.apply(wallet, [
    ...params,
    { queryBalance: false, ...options, buildUnsigned: true },
  ]);

  const signRequest = generateWcSignTransactionRequest(response, {
    // ask to broadcast the transaction by default
    broadcast: true,
    ...options,
  });
  const signResponse = await connector.signTransaction(signRequest);

  if (!signResponse) {
    throw new Error(errorMsg);
  }

  return {
    ...response,
    ...signResponse,
  };
}

interface WcExtensions {
  send(
    requests:
      | SendRequest
      | TokenSendRequest
      | OpReturnData
      | Array<SendRequest | TokenSendRequest | OpReturnData>
      | SendRequestArray[],
    options?: SendRequestOptionsI & WcTransactionOptions
  ): Promise<SendResponse & WcSignTransactionResponse>;

  sendMax(
    cashaddr: string,
    options?: SendRequestOptionsI & WcTransactionOptions
  ): Promise<SendResponse & WcSignTransactionResponse>;

  tokenGenesis(
    genesisRequest: TokenGenesisRequest,
    sendRequests?: SendRequestType | SendRequestType[],
    options?: SendRequestOptionsI & WcTransactionOptions
  ): Promise<SendResponse & WcSignTransactionResponse>;

  tokenMint(
    tokenId: string,
    mintRequests: TokenMintRequest | Array<TokenMintRequest>,
    deductTokenAmount?: boolean,
    options?: SendRequestOptionsI & WcTransactionOptions
  ): Promise<SendResponse & WcSignTransactionResponse>;

  tokenBurn(
    burnRequest: TokenBurnRequest,
    message?: string,
    options?: SendRequestOptionsI & WcTransactionOptions
  ): Promise<SendResponse & WcSignTransactionResponse>;
}


/**
 * Wraps a BaseWallet instance with WalletConnect signing functionality.
 * Returns a proxy that intercepts wallet method calls (send, sendMax, tokenGenesis, tokenMint, tokenBurn)
 * and routes them through WalletConnect for transaction signing.
 *
 * @typeParam T - The wallet type, extending BaseWallet.
 * @param wallet - The wallet instance to wrap.
 * @param connector - The WalletConnect connector to use for signing.
 * @returns The wallet instance extended with WalletConnect-enabled methods.
 * @throws If the wallet or connector is invalid.
 */
export function WrapWallet<T extends BaseWallet>(wallet: T, connector: IConnector): T & WcExtensions {
  if (!wallet || !connector) {
    throw new Error("Invalid wallet or connector");
  }

  const proxy = new Proxy(wallet, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        if (["send", "sendMax", "tokenGenesis", "tokenMint", "tokenBurn"].includes(value.name)) {
          return async (...args: any[]) => {
            return handleTransaction(wallet, connector, value as any, args);
          }
        }
      }
      return value;
    },
  });

  return proxy as T & WcExtensions;
}
