import React, { useContext, useState, useEffect } from "react";
import {
  WC2ConnectorProvider,
  WC2ConnectorContext,
} from "../../../packages/wc2-connector/src/WC2ConnectorContext";
import { Web3Modal } from "@web3modal/standalone";

const desktopWallets = [
  {
    id: "Cashonize",
    name: "Cashonize",
    links: {
      native: undefined as any,
      universal: "https://cashonize.com/#/wc",
    },
  },
  {
    id: "Paytaca",
    name: "Paytaca",
    links: {
      native: "",
      universal: "https://www.paytaca.com/wallet-connect",
    },
  },
];

const web3Modal = new Web3Modal({
  projectId: "f62aa2bb589104d059ca7b5bb64b18fb", // Replace with your WalletConnect project ID
  walletConnectVersion: 2,
  desktopWallets: desktopWallets,
  walletImages: {
    Cashonize: "https://cashonize.com/images/cashonize-icon.png",
    Paytaca: "https://www.paytaca.com/favicon.png",
  },
  enableExplorer: false,
  enableAccountView: true,
  mobileWallets: [],
  explorerRecommendedWalletIds: "NONE",
});

const options = {
  projectId: "f62aa2bb589104d059ca7b5bb64b18fb",
  web3Modal: web3Modal,
  metadata: {
    name: "Your App Name",
    description: "Your App Description",
    url: "https://yourapp.com",
    icons: ["https://yourapp.com/icon.png"],
  },
};

const WalletConnectorExample: React.FC = () => {
  const { active, connect, disconnect, address } =
    useContext(WC2ConnectorContext);
  const [walletAddress, setWalletAddress] = useState<string | undefined>(
    undefined
  );

  useEffect(() => {
    if (active) {
      const fetchAddress = async () => {
        const addr = await address();
        setWalletAddress(addr);
      };
      fetchAddress();
    } else {
      setWalletAddress(undefined);
    }
  }, [active, address]);

  return (
    <div style={{ padding: "20px" }}>
      <h1>Wallet Connector Example</h1>
      <p>
        Connection Status:{" "}
        <strong>{active ? "Connected" : "Disconnected"}</strong>
      </p>
      <p>
        Wallet Address: <strong>{walletAddress || "Not connected"}</strong>
      </p>
      <button
        onClick={connect}
        disabled={active}
        style={{ marginRight: "10px" }}
      >
        Connect Wallet
      </button>
      <button onClick={disconnect} disabled={!active}>
        Disconnect Wallet
      </button>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <WC2ConnectorProvider options={options}>
      <WalletConnectorExample />
    </WC2ConnectorProvider>
  );
};

export default App;
