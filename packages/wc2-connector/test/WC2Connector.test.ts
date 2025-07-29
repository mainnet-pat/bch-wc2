import { WC2Connector } from "../src/WC2Connector";
import { SignClient } from "@walletconnect/sign-client";
import { Web3Modal } from "@web3modal/standalone";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  binToHex,
  encodeTransaction,
  hexToBin,
  sha256,
} from "@bitauth/libauth";
import {
  WcSignTransactionRequest,
  WcSignMessageRequest,
  WcSourceOutput,
} from "@bch-wc2/interfaces";

// Mock @walletconnect/sign-client
vi.mock("@walletconnect/sign-client", () => {
  const mockSignClient = {
    connect: vi.fn(),
    on: vi.fn(),
    request: vi.fn(),
    disconnect: vi.fn(),
    pairing: { getAll: vi.fn().mockReturnValue([]) },
    session: { getAll: vi.fn().mockReturnValue([]) },
  };
  return {
    SignClient: {
      init: vi.fn().mockResolvedValue(mockSignClient),
    },
  };
});

// Mock Web3Modal
vi.mock("@web3modal/standalone", () => {
  return {
    Web3Modal: class {
      openModal = vi.fn();
      closeModal = vi.fn();
    },
  };
});

describe("WC2Connector", () => {
  let connector: WC2Connector;
  let mockSignClient: any;
  let mockNetworkProvider: { sendRawTransaction: ReturnType<typeof vi.fn> };
  let mockWeb3Modal: any;
  let mockLogger: { log: ReturnType<typeof vi.fn> };
  const eventListeners = new Map<string, Function[]>();

  beforeEach(() => {
    vi.resetAllMocks();
    mockSignClient = {
      connect: vi.fn().mockResolvedValue({
        uri: "wc:abc123",
        approval: vi.fn().mockResolvedValue({ topic: "session-topic" }),
      }),
      on: vi.fn((event, callback) => {
        if (!eventListeners.has(event)) {
          eventListeners.set(event, []);
        }
        eventListeners.get(event)!.push(callback);
      }),
      request: vi.fn(),
      disconnect: vi.fn(),
      pairing: { getAll: vi.fn().mockReturnValue([]) },
      session: { getAll: vi.fn().mockReturnValue([]) },
      triggerEvent: (event: string, ...args: any[]) => {
        const listeners = eventListeners.get(event) || [];
        listeners.forEach((listener) => listener(...args));
      },
    };

    mockNetworkProvider = {
      sendRawTransaction: vi.fn().mockResolvedValue("txid123"),
    };

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
          universal:
            "chrome-extension://pakphhpnneopheifihmjcjnbdbhaaiaa/www/index.html#/apps/wallet-connect",
        },
      },
      {
        id: "Zapit",
        name: "Zapit",
        links: {
          native: "",
          universal:
            "chrome-extension://fccgmnglbhajioalokbcidhcaikhlcpm/index.html#/wallet-connect",
        },
      },
    ];

    mockWeb3Modal = new Web3Modal({
      projectId: undefined as any,
      walletConnectVersion: 2,
      desktopWallets: desktopWallets,
      walletImages: {
        Cashonize: "https://cashonize.com/images/cashonize-icon.png",
        Paytaca: "https://www.paytaca.com/favicon.png",
        Zapit:
          "https://lh3.googleusercontent.com/DbMYirtFPzZhSky0djg575FGPAriqGUPokFcb8r0-3qdcgKfR8uLqwK0DCPn0XrrsijRNDUAKUVLXGqLWVcFBB8zDA=s120",
      },
      enableExplorer: false,
      enableAccountView: true,
      mobileWallets: [],
      explorerRecommendedWalletIds: "NONE",
    });

    mockLogger = {
      log: vi.fn(),
    };

    (SignClient.init as any).mockResolvedValue(mockSignClient);

    connector = new WC2Connector({
      projectId: "f62aa2bb589104d059ca7b5bb64b18fb",
      metadata: {
        name: "Test dApp",
        description: "A test dApp",
        url: "https://test-dapp.com",
        icons: ["https://test-dapp.com/icon.png"],
      },
      chainId: "bch:mainnet",
      networkProvider: mockNetworkProvider,
      web3Modal: mockWeb3Modal,
      logger: mockLogger,
    });
  });

  // Connection Tests
  it("should initialize signClient and use Web3Modal if provided", async () => {
    await connector.connect();
    expect(SignClient.init).toHaveBeenCalledWith({
      projectId: "f62aa2bb589104d059ca7b5bb64b18fb",
      metadata: expect.any(Object),
    });
    expect(mockSignClient.connect).toHaveBeenCalledWith({
      requiredNamespaces: {
        bch: {
          methods: [
            "bch_getAddresses",
            "bch_signTransaction",
            "bch_signMessage",
          ],
          chains: ["bch:mainnet"],
          events: ["addressesChanged"],
        },
      },
    });
    expect(mockWeb3Modal.openModal).toHaveBeenCalledWith({
      uri: "wc:abc123",
      standaloneChains: ["bch:mainnet"],
    });
    expect(mockWeb3Modal.closeModal).toHaveBeenCalled();
    expect((connector as any).sessionTopic).toBe("session-topic");
  });

  it("should reuse existing session if available", async () => {
    const mockSession = { topic: "existing-session-topic" };
    mockSignClient.session.getAll.mockReturnValue([mockSession]);
    await connector.connect();
    expect((connector as any).sessionTopic).toBe("existing-session-topic");
    expect(mockSignClient.connect).not.toHaveBeenCalled();
  });

  it("should reuse existing pairing if available", async () => {
    const mockPairing = { topic: "existing-pairing-topic" };
    mockSignClient.pairing.getAll.mockReturnValue([mockPairing]);
    await connector.connect();
    expect(mockSignClient.connect).toHaveBeenCalledWith({
      pairingTopic: "existing-pairing-topic",
      requiredNamespaces: {
        bch: {
          methods: [
            "bch_getAddresses",
            "bch_signTransaction",
            "bch_signMessage",
          ],
          chains: ["bch:mainnet"],
          events: ["addressesChanged"],
        },
      },
    });
    expect((connector as any).sessionTopic).toBe("session-topic");
  });

  it("should call displayUri if provided instead of Web3Modal", async () => {
    const mockDisplayUri = vi.fn();
    connector = new WC2Connector({
      projectId: "test",
      displayUri: mockDisplayUri,
      logger: mockLogger,
    });
    await connector.connect();
    expect(mockDisplayUri).toHaveBeenCalledWith("wc:abc123");
  });

  it("should emit pairingUri event if no Web3Modal or displayUri is provided", async () => {
    connector = new WC2Connector({ projectId: "test", logger: mockLogger });
    const mockCallback = vi.fn();
    connector.on("pairingUri", mockCallback);
    await connector.connect();
    expect(mockCallback).toHaveBeenCalledWith("wc:abc123");
  });

  it("should throw if no URI is provided by WalletConnect", async () => {
    mockSignClient.connect.mockResolvedValue({
      uri: undefined,
      approval: vi.fn(),
    });
    await expect(connector.connect()).rejects.toThrow(
      "No URI provided by WalletConnect"
    );
  });

  it("should log and return if already connected", async () => {
    (connector as any).signClient = mockSignClient;
    await connector.connect();
    expect(mockLogger.log).toHaveBeenCalledWith(
      "Already connected, reusing existing client"
    );
    expect(SignClient.init).not.toHaveBeenCalled();
  });

  // Connected Status Test
  it("should report connected status", async () => {
    expect(await connector.connected()).toBe(false);
    (connector as any).sessionTopic = "session-topic";
    expect(await connector.connected()).toBe(true);
  });

  // Logger Tests
  it("should log CONDIT messages if logger is provided", async () => {
    await connector.connect();
    const mockUpdate = {
      params: { namespaces: { bch: { accounts: ["bch:mainnet:address1"] } } },
    };
    mockSignClient.triggerEvent("session_update", mockUpdate);
    expect(mockLogger.log).toHaveBeenCalledWith("Session updated:", mockUpdate);
  });

  // Address Tests
  it("should get address correctly", async () => {
    (connector as any).signClient = mockSignClient;
    (connector as any).sessionTopic = "session-topic";
    const mockAddresses = ["address1", "address2"];
    mockSignClient.request.mockResolvedValue(mockAddresses);
    const address = await connector.address();
    expect(mockSignClient.request).toHaveBeenCalledWith({
      topic: "session-topic",
      chainId: "bch:mainnet",
      request: { method: "bch_getAddresses", params: {} },
    });
    expect(address).toBe("address1");
  });

  it("should return undefined if no session exists for address", async () => {
    const address = await connector.address();
    expect(address).toBeUndefined();
    expect(mockLogger.log).toHaveBeenCalledWith(
      "No active session for address request"
    );
  });

  it("should return undefined on address request error", async () => {
    (connector as any).signClient = mockSignClient;
    (connector as any).sessionTopic = "session-topic";
    mockSignClient.request.mockRejectedValue(new Error("Request failed"));
    const address = await connector.address();
    expect(address).toBeUndefined();
    expect(mockLogger.log).toHaveBeenCalledWith(
      "Error getting address:",
      expect.any(Error)
    );
  });

  // Sign Transaction Tests
  it("should sign transaction with hex string and broadcast if requested", async () => {
    (connector as any).signClient = mockSignClient;
    (connector as any).sessionTopic = "session-topic";
    const mockRequest: WcSignTransactionRequest = {
      transaction: "mockTransactionHex",
      sourceOutputs: [],
      broadcast: true,
    };
    const mockSignedTransactionHex = "signedTransactionHex";
    mockSignClient.request.mockResolvedValue(mockSignedTransactionHex);
    const result = await connector.signTransaction(mockRequest);
    expect(mockSignClient.request).toHaveBeenCalledWith({
      topic: "session-topic",
      chainId: "bch:mainnet",
      request: {
        method: "bch_signTransaction",
        params: {
          transaction: "mockTransactionHex",
          sourceOutputs: [],
          broadcast: true,
          userPrompt: undefined,
        },
      },
    });
    expect(mockNetworkProvider.sendRawTransaction).toHaveBeenCalledWith(
      mockSignedTransactionHex
    );
    expect(result).toEqual({
      signedTransaction: mockSignedTransactionHex,
      signedTransactionHash: expect.any(String),
    });
  });

  it("should serialize transaction object correctly", async () => {
    (connector as any).signClient = mockSignClient;
    (connector as any).sessionTopic = "session-topic";
    const mockTransaction = {
      version: 2,
      inputs: [],
      outputs: [],
      locktime: 0,
    };
    const mockRequest: WcSignTransactionRequest = {
      transaction: mockTransaction,
      sourceOutputs: [],
    };
    const expectedHex = binToHex(encodeTransaction(mockTransaction));
    const mockSignedTransactionHex = "signedTransactionHex";
    mockSignClient.request.mockResolvedValue(mockSignedTransactionHex);
    await connector.signTransaction(mockRequest);
    expect(mockSignClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        request: {
          method: "bch_signTransaction",
          params: expect.objectContaining({ transaction: expectedHex }),
        },
      })
    );
  });

  it("should serialize sourceOutputs with token and contract", async () => {
    (connector as any).signClient = mockSignClient;
    (connector as any).sessionTopic = "session-topic";
    const mockSourceOutputs: WcSourceOutput[] = [
      {
        outpointTransactionHash: hexToBin("deadbeef"),
        outpointIndex: 0,
        sequenceNumber: 0,
        unlockingBytecode: new Uint8Array(),
        lockingBytecode: hexToBin("76a914deadbeef88ac"),
        valueSatoshis: BigInt(1000),
        token: { category: hexToBin("deadbeef"), amount: BigInt(100) },
        contract: {
          abiFunction: { name: "func", inputs: [] },
          redeemScript: new Uint8Array([0x01, 0x02]),
          artifact: { contractName: "TestContract" },
        },
      },
    ];
    const mockRequest: WcSignTransactionRequest = {
      transaction: "mockTransactionHex",
      sourceOutputs: mockSourceOutputs,
    };
    const mockSignedTransactionHex = "signedTransactionHex";
    mockSignClient.request.mockResolvedValue(mockSignedTransactionHex);
    await connector.signTransaction(mockRequest);
    expect(mockSignClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        request: {
          method: "bch_signTransaction",
          params: expect.objectContaining({
            sourceOutputs: [
              expect.objectContaining({
                outpointTransactionHash: "deadbeef",
                lockingBytecode: "76a914deadbeef88ac",
                token: { category: "deadbeef", amount: BigInt(100) },
                contract: {
                  abiFunction: { name: "func", inputs: [] },
                  redeemScript: "0102",
                  artifact: { contractName: "TestContract" },
                },
              }),
            ],
          }),
        },
      })
    );
  });

  it("should return undefined if no session exists when signing transaction", async () => {
    const mockRequest: WcSignTransactionRequest = {
      transaction: "mockTransactionHex",
      sourceOutputs: [],
    };
    const result = await connector.signTransaction(mockRequest);
    expect(result).toBeUndefined();
    expect(mockLogger.log).toHaveBeenCalledWith(
      "No active session for signTransaction"
    );
  });

  // Sign Message Test
  it("should sign message correctly", async () => {
    (connector as any).signClient = mockSignClient;
    (connector as any).sessionTopic = "session-topic";
    const mockMessageRequest: WcSignMessageRequest = {
      message: "test message",
      userPrompt: "Please sign this",
    };
    const mockSignature = "mockSignature";
    mockSignClient.request.mockResolvedValue(mockSignature);
    const signature = await connector.signMessage(mockMessageRequest);
    expect(mockSignClient.request).toHaveBeenCalledWith({
      topic: "session-topic",
      chainId: "bch:mainnet",
      request: {
        method: "bch_signMessage",
        params: { message: "test message", userPrompt: "Please sign this" },
      },
    });
    expect(signature).toBe(mockSignature);
  });

  it("should return undefined if no session exists when signing message", async () => {
    const mockMessageRequest: WcSignMessageRequest = {
      message: "test message",
    };
    const signature = await connector.signMessage(mockMessageRequest);
    expect(signature).toBeUndefined();
    expect(mockLogger.log).toHaveBeenCalledWith(
      "No active session for signMessage"
    );
  });

  // Disconnect Test
  it("should disconnect and reset state correctly", async () => {
    (connector as any).signClient = mockSignClient;
    (connector as any).sessionTopic = "session-topic";
    await connector.disconnect();
    expect(mockSignClient.disconnect).toHaveBeenCalledWith({
      topic: "session-topic",
      reason: { code: 1000, message: "User disconnected" },
    });
    expect((connector as any).sessionTopic).toBeNull();
    expect((connector as any).signClient).toBeNull();
    expect(mockLogger.log).toHaveBeenCalledWith("State reset");
  });

  it("should do nothing if not connected on disconnect", async () => {
    await connector.disconnect();
    expect(mockSignClient.disconnect).not.toHaveBeenCalled();
  });

  // Event Handling Tests
  it("should handle addressChanged event from session_update", async () => {
    await connector.connect();
    const mockCallback = vi.fn();
    connector.on("addressChanged", mockCallback);
    const sessionUpdateCallback = mockSignClient.on.mock.calls.find(
      (call: any) => call[0] === "session_update"
    )[1];
    sessionUpdateCallback({
      params: { namespaces: { bch: { accounts: ["bch:mainnet:address1"] } } },
    });
    expect(mockCallback).toHaveBeenCalledWith("address1");
  });

  it("should handle addressChanged event from session_event", async () => {
    await connector.connect();
    const mockCallback = vi.fn();
    connector.on("addressChanged", mockCallback);
    const sessionEventCallback = mockSignClient.on.mock.calls.find(
      (call: any) => call[0] === "session_event"
    )[1];
    sessionEventCallback({
      params: { event: { name: "addressChanged", data: "address1" } },
    });
    expect(mockCallback).toHaveBeenCalledWith("address1");
  });

  it("should emit disconnect event and reset state on session_delete", async () => {
    await connector.connect();
    const mockCallback = vi.fn();
    connector.on("disconnect", mockCallback);
    mockSignClient.triggerEvent("session_delete");
    expect(mockCallback).toHaveBeenCalled();
    expect((connector as any).sessionTopic).toBeNull();
    expect((connector as any).signClient).toBeNull();
    expect(mockLogger.log).toHaveBeenCalledWith("State reset");
  });

  it("should if session ping events", async () => {
    await connector.connect();
    const sessionPingCallback = mockSignClient.on.mock.calls.find(
      (call: any) => call[0] === "session_ping"
    )[1];
    sessionPingCallback({ id: 1 });
    expect(mockLogger.log).toHaveBeenCalledWith("Session ping received:", {
      id: 1,
    });
  });
});
