import { WC2Connector } from "../src/WC2Connector";
import { SignClient } from "@walletconnect/sign-client";
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

// Mock the entire @walletconnect/sign-client module
vi.mock("@walletconnect/sign-client", () => {
  const mockSignClient = {
    connect: vi.fn(),
    on: vi.fn(),
    request: vi.fn(),
    disconnect: vi.fn(),
    session: { getAll: vi.fn().mockReturnValue([]) },
  };
  return {
    SignClient: {
      init: vi.fn().mockResolvedValue(mockSignClient),
    },
  };
});

describe("WC2Connector", () => {
  let connector: WC2Connector;
  let mockSignClient: any;

  beforeEach(() => {
    mockSignClient = {
      connect: vi.fn().mockResolvedValue({
        uri: "wc:abc123",
        approval: vi.fn().mockResolvedValue({ topic: "session-topic" }),
      }),
      on: vi.fn(),
      request: vi.fn(),
      disconnect: vi.fn(),
      session: { getAll: vi.fn().mockReturnValue([]) },
    };

    (SignClient.init as any).mockResolvedValue(mockSignClient);

    connector = new WC2Connector(
      "f62aa2bb589104d059ca7b5bb64b18fb",
      {
        name: "Test dApp",
        description: "A test dApp",
        url: "https://test-dapp.com",
        icons: ["https://test-dapp.com/icon.png"],
      },
      "bch:mainnet"
    );
  });

  it("should initialize signClient and generate URI on connect", async () => {
    await connector.connect();
    expect(SignClient.init).toHaveBeenCalledWith({
      projectId: "f62aa2bb589104d059ca7b5bb64b18fb",
      metadata: expect.any(Object),
    });
    expect(mockSignClient.connect).toHaveBeenCalledWith({
      requiredNamespaces: {
        bch: {
          methods: [
            "bch_signTransaction",
            "bch_signMessage",
            "bch_getAddresses",
          ],
          chains: ["bch:mainnet"],
          events: ["addressesChanged"],
        },
      },
    });
    expect((connector as any).sessionTopic).toBe("session-topic");
  });

  it("should throw if already connected", async () => {
    (connector as any).signClient = mockSignClient;
    await expect(connector.connect()).rejects.toThrow("Already connected");
  });

  it("should report connected status", async () => {
    expect(await connector.connected()).toBe(false);
    (connector as any).sessionTopic = "session-topic";
    expect(await connector.connected()).toBe(true);
  });

  it("should sign transaction correctly with hex string", async () => {
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
      },
    ];

    const mockRequest: WcSignTransactionRequest = {
      transaction: "mockTransactionHex",
      sourceOutputs: mockSourceOutputs,
    };

    const mockSignedTransactionHex = "signedTransactionHex";
    mockSignClient.request.mockResolvedValue(mockSignedTransactionHex);

    const result = await connector.signTransaction(mockRequest);

    expect(mockSignClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "session-topic",
        chainId: "bch:mainnet",
        request: expect.objectContaining({
          method: "bch_signTransaction",
          params: expect.objectContaining({
            transaction: "mockTransactionHex",
            sourceOutputs: [
              expect.objectContaining({
                outpointTransactionHash: "deadbeef",
                outpointIndex: 0,
                sequenceNumber: 0,
                lockingBytecode: "76a914deadbeef88ac",
                valueSatoshis: BigInt(1000),
                token: undefined,
                contract: undefined,
              }),
            ],
            broadcast: undefined,
            userPrompt: undefined,
          }),
        }),
      })
    );

    expect(result).toEqual({
      signedTransaction: mockSignedTransactionHex,
      signedTransactionHash: expect.any(String),
    });
  });

  it("should get address correctly", async () => {
    (connector as any).signClient = mockSignClient;
    (connector as any).sessionTopic = "session-topic";

    const mockAddresses = ["address1", "address2"];
    mockSignClient.request.mockResolvedValue(mockAddresses);

    const address = await connector.address();

    expect(mockSignClient.request).toHaveBeenCalledWith({
      topic: "session-topic",
      chainId: "bch:mainnet",
      request: {
        method: "bch_getAddresses",
        params: {},
      },
    });

    expect(address).toBe("address1");
  });

  it("should sign message correctly", async () => {
    (connector as any).signClient = mockSignClient;
    (connector as any).sessionTopic = "session-topic";

    const mockMessageRequest: WcSignMessageRequest = {
      message: "test message",
    };

    const mockSignature = "mockSignature";
    mockSignClient.request.mockResolvedValue(mockSignature);

    const signature = await connector.signMessage(mockMessageRequest);

    expect(mockSignClient.request).toHaveBeenCalledWith({
      topic: "session-topic",
      chainId: "bch:mainnet",
      request: {
        method: "bch_signMessage",
        params: {
          message: "test message",
          userPrompt: undefined,
        },
      },
    });

    expect(signature).toBe(mockSignature);
  });

  it("should disconnect correctly", async () => {
    (connector as any).signClient = mockSignClient;
    (connector as any).sessionTopic = "session-topic";

    await connector.disconnect();

    expect(mockSignClient.disconnect).toHaveBeenCalledWith({
      topic: "session-topic",
      reason: { code: 1000, message: "User disconnected" },
    });
    expect((connector as any).sessionTopic).toBeNull();
    expect((connector as any).signClient).toBeNull();
  });

  it("should handle addressChanged event correctly", async () => {
    await connector.connect();

    const mockCallback = vi.fn();
    connector.on("addressChanged", mockCallback);

    const sessionUpdateCallback = mockSignClient.on.mock.calls.find(
      (call: any) => call[0] === "session_update"
    )[1];
    const updateEvent = {
      params: {
        namespaces: {
          bch: {
            accounts: ["bch:mainnet:address1"],
          },
        },
      },
    };
    sessionUpdateCallback(updateEvent);

    expect(mockCallback).toHaveBeenCalledWith("address1");
  });

  it("should emit disconnect event on session_delete", async () => {
    await connector.connect();

    const mockCallback = vi.fn();
    connector.on("disconnect", mockCallback);

    const sessionDeleteCallback = mockSignClient.on.mock.calls.find(
      (call: any) => call[0] === "session_delete"
    )[1];
    sessionDeleteCallback();

    expect(mockCallback).toHaveBeenCalled();
    expect((connector as any).sessionTopic).toBeNull();
  });

  it("should restore existing session if available", async () => {
    const mockExistingSession = { topic: "existing-session-topic" };
    mockSignClient.session.getAll.mockReturnValue([mockExistingSession]);

    await connector.connect();

    expect((connector as any).sessionTopic).toBe("existing-session-topic");
    expect(mockSignClient.connect).not.toHaveBeenCalled();
  });

  it("should emit pairingUri event with correct URI", async () => {
    const mockCallback = vi.fn();
    connector.on("pairingUri", mockCallback);

    await connector.connect();

    expect(mockCallback).toHaveBeenCalledWith("wc:abc123");
  });

  it("should use custom chainId in requests", async () => {
    connector = new WC2Connector("projectId", {}, "bch:bchtest");
    (connector as any).signClient = mockSignClient;
    (connector as any).sessionTopic = "session-topic";

    const mockAddresses = ["address1"];
    mockSignClient.request.mockResolvedValue(mockAddresses);

    await connector.address();

    expect(mockSignClient.request).toHaveBeenCalledWith({
      topic: "session-topic",
      chainId: "bch:bchtest",
      request: { method: "bch_getAddresses", params: {} },
    });
  });

  it("should handle user rejection in signTransaction", async () => {
    (connector as any).signClient = mockSignClient;
    (connector as any).sessionTopic = "session-topic";

    const mockRequest: WcSignTransactionRequest = {
      transaction: "mockTransactionHex",
      sourceOutputs: [],
    };
    mockSignClient.request.mockRejectedValue({
      code: 5000,
      message: "User rejected",
    });

    await expect(connector.signTransaction(mockRequest)).rejects.toThrow(
      "User rejected"
    );
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

  it("should serialize token and contract in sourceOutputs", async () => {
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
                outpointIndex: 0,
                sequenceNumber: 0,
                lockingBytecode: "76a914deadbeef88ac",
                valueSatoshis: BigInt(1000),
                token: {
                  category: "deadbeef",
                  amount: BigInt(100),
                },
                contract: {
                  abiFunction: { name: "func", inputs: [] },
                  redeemScript: "0102",
                  artifact: { contractName: "TestContract" },
                },
              }),
            ],
            transaction: "mockTransactionHex",
            broadcast: undefined,
            userPrompt: undefined,
          }),
        },
      })
    );
  });
});
