import {
  createContext,
  useContext,
} from "react";
import { IConnector, WcSignMessageRequest, WcSignMessageResponse, WcSignTransactionRequest, WcSignTransactionResponse } from "@bch-wc2/interfaces";

/**
 * Types
 */
export interface IContext {
  connector: IConnector | undefined;
  isConnected: boolean;
  address: string | undefined;
  signTransaction: (options: WcSignTransactionRequest) => Promise<WcSignTransactionResponse | undefined>;
  signMessage: (options: WcSignMessageRequest) => Promise<WcSignMessageResponse | undefined>;
  connect: () => Promise<void>;
  connected: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  on(event: string, callback: Function): void;
  on(event: "addressChanged", callback: Function): void;
  on(event: "disconnect", callback: Function): void;
}

/**
 * Context
 */
export const Web3ModalConnectorContext = createContext<IContext>({} as IContext);

export function useWeb3ModalConnectorContext() {
  const context = useContext(Web3ModalConnectorContext);
  if (context === undefined) {
    throw new Error("unable to initialize, please check your configuration");
  }
  return context;
}
