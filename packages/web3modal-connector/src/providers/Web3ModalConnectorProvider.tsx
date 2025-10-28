import { IConnector, WcSignTransactionRequest, WcSignTransactionResponse, WcSignMessageRequest, WcSignMessageResponse } from "@bch-wc2/interfaces";
import Client from "@walletconnect/sign-client";
import { getAppMetadata } from "@walletconnect/utils";
import { Web3Modal } from "@web3modal/standalone";
import { useState, useCallback, useMemo, useEffect } from "react";
import { Configuration, DefaultDesktopWallets, DefaultWalletImages } from "../config/config";
import { Web3ModalConnectorContext } from "../contexts/Web3ModalConnectorContext";
import { Web3ModalConnector } from "../Web3ModalConnector";

let globalClient: Client | undefined = undefined;
let web3Modal: Web3Modal | undefined = undefined;

export interface Props {
  children: React.ReactNode;
  config: Configuration;
}

/**
 * Provider
 */
export const Web3ModalConnectorContextProvider: React.FC<Props> = ({
  children,
  config,
}: Props) => {
  const [connector, setConnector] = useState<IConnector>();
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [address, setAddress] = useState<string | undefined>(undefined);

  const connect = useCallback(async () => {
    if (isConnected) {
      return;
    }

    const connector = await createConnector(config);
    if (!connector) {
      return;
    }

    await connector.connect();
    setConnector(connector);
    localStorage.setItem("Web3ModalConnector", "active");
    setAddress(await connector.address());
    setIsConnected(true);

    connector.on("disconnect", async () => {
      setIsConnected(false);
      setAddress(undefined);
      localStorage.removeItem("Web3ModalConnector");
      setConnector(undefined);
    });
  }, [setConnector, setIsConnected, isConnected]);

  const connected = useCallback(() => {
    return connector!.connected();
  }, [connector]);

  const disconnect = useCallback(async () => {
    await connector?.disconnect();
    localStorage.removeItem("Connector");
    setIsConnected(false);
    localStorage.removeItem("Web3ModalConnector");
    setAddress(undefined);
    setConnector(undefined);
  }, [connector, setIsConnected, setConnector]);

  const signTransaction = useCallback((options: WcSignTransactionRequest): Promise<WcSignTransactionResponse | undefined> => {
    return connector!.signTransaction(options);
  }, [connector]);

  const signMessage = useCallback((options: WcSignMessageRequest): Promise<WcSignMessageResponse | undefined> => {
    return connector!.signMessage(options);
  }, [connector]);

  const on = useCallback((event: string, callback: Function): void => {
    return connector!.on(event, callback);
  }, [connector]);

  const createConnector = async (config: Configuration): Promise<IConnector | undefined> => {
    try {
      web3Modal = new Web3Modal({
        projectId: config.projectId,
        walletConnectVersion: 2,
        desktopWallets: config.desktopWallets || DefaultDesktopWallets,
        walletImages: config.walletImages || DefaultWalletImages,
        enableExplorer: false,
        enableAccountView: true,
        mobileWallets: [],
        explorerRecommendedWalletIds: "NONE",
      });

      if (!globalClient) {
        globalClient = await Client.init({
          logger: config.logger,
          relayUrl: config.relayUrl,
          projectId: config.projectId,
          metadata: config.metadata || getAppMetadata(),
        });
      };

      const connector = new Web3ModalConnector({
        useChipnet: config.useChipnet,
        globalClient,
        web3Modal,
        relayerRegion: config.relayUrl,
        logger: config.logger
      });
      return connector;
    } catch (err) {
      console.error("Error creating connector:", err);
      return undefined;
    }
  };

  useEffect(() => {
    if (localStorage.getItem("Web3ModalConnector") === "active") {
      connect();
    }
  }, [connect]);

  const value = useMemo(
    () => ({
      connector,
      isConnected,
      connect,
      connected,
      disconnect,
      address,
      on,
      signMessage,
      signTransaction,
    }),
    [
      connector,
      isConnected,
      connect,
      connected,
      disconnect,
      address,
      on,
      signMessage,
      signTransaction,
    ]
  );

  return (
    <Web3ModalConnectorContext.Provider
      value={{
        ...value,
      }}
    >
      {children}
    </Web3ModalConnectorContext.Provider>
  );
}