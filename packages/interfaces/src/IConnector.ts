import { WcSignTransactionRequest, WcSignTransactionResponse, WcSignMessageRequest, WcSignMessageResponse } from "./interfaces";

export interface IConnector {
  address: () => Promise<string | undefined>;
  signTransaction: (options: WcSignTransactionRequest) => Promise<WcSignTransactionResponse | undefined>;
  signMessage: (options: WcSignMessageRequest) => Promise<WcSignMessageResponse | undefined>;
  connect: () => Promise<void>;
  connected: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  on(event: string, callback: Function): void;
  on(event: "addressChanged", callback: Function): void;
  on(event: "disconnect", callback: Function): void;
};
