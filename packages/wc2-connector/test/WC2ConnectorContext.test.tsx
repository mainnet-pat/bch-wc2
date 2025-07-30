// @vitest-environment jsdom
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  WC2ConnectorProvider,
  WC2ConnectorContext,
} from "../src/WC2ConnectorContext";
import React, { useContext } from "react";

// Mock WC2Connector
const mockConnector = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: vi.fn(),
  address: vi.fn(),
  signTransaction: vi.fn(),
  signMessage: vi.fn(),
};

vi.mock("../src/WC2Connector", () => ({
  WC2Connector: vi.fn(() => mockConnector),
}));

// import { WC2Connector } from "../src/WC2Connector";

// Helper components unchanged...
const ActiveDisplay = () => {
  const { active } = useContext(WC2ConnectorContext);
  return <div data-testid="active">{active ? "true" : "false"}</div>;
};

const ConnectButton = () => {
  const { connect } = useContext(WC2ConnectorContext);
  return <button onClick={connect}>Connect</button>;
};

const DisconnectButton = () => {
  const { disconnect } = useContext(WC2ConnectorContext);
  return <button onClick={disconnect}>Disconnect</button>;
};

const AddressDisplay = () => {
  const { address } = useContext(WC2ConnectorContext);
  const [addr, setAddr] = React.useState<string | undefined>(undefined);
  return (
    <>
      <button onClick={async () => setAddr(await address())}>
        Get Address
      </button>
      <div data-testid="address">{addr || "none"}</div>
    </>
  );
};

const SignTransactionButton = () => {
  const { signTransaction } = useContext(WC2ConnectorContext);
  const [result, setResult] = React.useState<string | undefined>(undefined);
  const opts = { transaction: "test-tx", sourceOutputs: [] };
  return (
    <>
      <button
        onClick={async () =>
          setResult((await signTransaction(opts))?.signedTransaction)
        }
      >
        Sign Transaction
      </button>
      <div data-testid="sign-tx">{result || "none"}</div>
    </>
  );
};

const SignMessageButton = () => {
  const { signMessage } = useContext(WC2ConnectorContext);
  const [result, setResult] = React.useState<string | undefined>(undefined);
  const opts = { message: "test-message" };
  return (
    <>
      <button onClick={async () => setResult(await signMessage(opts))}>
        Sign Message
      </button>
      <div data-testid="sign-msg">{result || "none"}</div>
    </>
  );
};

describe("WC2ConnectorProvider", () => {
  const options = { projectId: "test-id" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnector.connect.mockResolvedValue(undefined);
    mockConnector.disconnect.mockResolvedValue(undefined);
    mockConnector.connected.mockResolvedValue(false);
    mockConnector.address.mockResolvedValue(undefined);
    mockConnector.signTransaction.mockResolvedValue({
      signedTransaction: "signed-tx",
    });
    mockConnector.signMessage.mockResolvedValue("signed-msg");
  });

  afterEach(() => {
    cleanup();
  });

  it("initializes connector and sets active to false when not connected", async () => {
    mockConnector.connected.mockResolvedValue(false);
    const { getByTestId } = render(
      <WC2ConnectorProvider options={options}>
        <ActiveDisplay />
      </WC2ConnectorProvider>
    );
    await waitFor(() => {
      expect(getByTestId("active").textContent).toBe("false");
    });
    expect(mockConnector.connected).toHaveBeenCalled();
  });

  it("initializes connector and sets active to true when already connected", async () => {
    mockConnector.connected.mockResolvedValue(true);

    const { getByTestId } = render(
      <WC2ConnectorProvider options={options}>
        <ActiveDisplay />
      </WC2ConnectorProvider>
    );

    await waitFor(() => {
      expect(getByTestId("active").textContent).toBe("true");
    });
    expect(mockConnector.connected).toHaveBeenCalled();
  });

  it("connect calls connector.connect and sets active to true", async () => {
    mockConnector.connect.mockResolvedValue(undefined);
    mockConnector.connected.mockResolvedValue(false); // Initially not connected

    const { getByText, getByTestId } = render(
      <WC2ConnectorProvider options={options}>
        <ConnectButton />
        <ActiveDisplay />
      </WC2ConnectorProvider>
    );

    fireEvent.click(getByText("Connect"));
    await waitFor(() => {
      expect(mockConnector.connect).toHaveBeenCalled();
      expect(getByTestId("active").textContent).toBe("true");
    });
  });

  it("disconnect calls connector.disconnect and sets active to false", async () => {
    mockConnector.disconnect.mockResolvedValue(undefined);
    mockConnector.connected.mockResolvedValue(true); // Initially connected

    const { getByText, getByTestId } = render(
      <WC2ConnectorProvider options={options}>
        <DisconnectButton />
        <ActiveDisplay />
      </WC2ConnectorProvider>
    );

    fireEvent.click(getByText("Disconnect"));
    await waitFor(() => {
      expect(mockConnector.disconnect).toHaveBeenCalled();
      expect(getByTestId("active").textContent).toBe("false");
    });
  });

  it("address calls connector.address and returns the result", async () => {
    mockConnector.address.mockResolvedValue("0x1234");

    const { getByText, getByTestId } = render(
      <WC2ConnectorProvider options={options}>
        <AddressDisplay />
      </WC2ConnectorProvider>
    );

    fireEvent.click(getByText("Get Address"));
    await waitFor(() => {
      expect(mockConnector.address).toHaveBeenCalled();
      expect(getByTestId("address").textContent).toBe("0x1234");
    });
  });

  it("signTransaction calls connector.signTransaction and returns the result", async () => {
    mockConnector.signTransaction.mockResolvedValue({
      signedTransaction: "signed-tx",
    });

    const { getByText, getByTestId } = render(
      <WC2ConnectorProvider options={options}>
        <SignTransactionButton />
      </WC2ConnectorProvider>
    );

    fireEvent.click(getByText("Sign Transaction"));
    await waitFor(() => {
      expect(mockConnector.signTransaction).toHaveBeenCalledWith({
        transaction: "test-tx",
        sourceOutputs: [],
      });
      expect(getByTestId("sign-tx").textContent).toBe("signed-tx");
    });
  });

  it("signMessage calls connector.signMessage and returns the result", async () => {
    mockConnector.signMessage.mockResolvedValue("signed-msg");

    const { getByText, getByTestId } = render(
      <WC2ConnectorProvider options={options}>
        <SignMessageButton />
      </WC2ConnectorProvider>
    );

    fireEvent.click(getByText("Sign Message"));
    await waitFor(() => {
      expect(mockConnector.signMessage).toHaveBeenCalledWith({
        message: "test-message",
      });
      expect(getByTestId("sign-msg").textContent).toBe("signed-msg");
    });
  });
});
