import React, { createContext, useState, useEffect, ReactNode } from "react";
import { WC2Connector, WC2ConnectorOptions } from "./WC2Connector";
import {
  WcSignMessageRequest,
  WcSignTransactionRequest,
  WcSignTransactionResponse,
} from "@bch-wc2/interfaces";

interface WC2ConnectorContextType {
  connector: WC2Connector | null;
  active: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  address: () => Promise<string | undefined>;
  signTransaction: (
    options: WcSignTransactionRequest
  ) => Promise<WcSignTransactionResponse | undefined>;
  signMessage: (options: WcSignMessageRequest) => Promise<string | undefined>;
}

export const WC2ConnectorContext = createContext<WC2ConnectorContextType>({
  connector: null,
  active: false,
  connect: async () => {},
  disconnect: async () => {},
  address: async () => undefined,
  signTransaction: async () => undefined,
  signMessage: async () => undefined,
});

interface WC2ConnectorProviderProps {
  children: ReactNode;
  options: WC2ConnectorOptions;
}

export const WC2ConnectorProvider: React.FC<WC2ConnectorProviderProps> = ({
  children,
  options,
}) => {
  const [connector, setConnector] = useState<WC2Connector | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const initConnector = async () => {
      const newConnector = new WC2Connector(options);
      setConnector(newConnector);

      // Check if already connected
      const isConnected = await newConnector.connected();
      if (isConnected) {
        setActive(true);
      }
    };
    initConnector();
  }, [options]);

  const connect = async () => {
    if (connector) {
      await connector.connect();
      setActive(true);
    }
  };

  const disconnect = async () => {
    if (connector) {
      await connector.disconnect();
      setActive(false);
    }
  };

  const address = async () =>
    connector ? await connector.address() : undefined;

  const signTransaction = async (opts: WcSignTransactionRequest) =>
    connector ? await connector.signTransaction(opts) : undefined;

  const signMessage = async (opts: WcSignMessageRequest) =>
    connector ? await connector.signMessage(opts) : undefined;

  return (
    <WC2ConnectorContext.Provider
      value={{
        connector,
        active,
        connect,
        disconnect,
        address,
        signTransaction,
        signMessage,
      }}
    >
      {children}
    </WC2ConnectorContext.Provider>
  );
};
