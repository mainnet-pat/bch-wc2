import { WC2Connector } from '../src/WC2Connector';
import { SignClient } from '@walletconnect/sign-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { binToHex, encodeTransaction, hexToBin, sha256 } from '@bitauth/libauth';
import { WcSignTransactionRequest, WcSignMessageRequest, WcSourceOutput } from '@bch-wc2/interfaces';

// Mock the entire @walletconnect/sign-client module
vi.mock('@walletconnect/sign-client', () => {
  const mockSignClient = {
    connect: vi.fn(),
    on: vi.fn(),
    request: vi.fn(),
    disconnect: vi.fn(),
  };
  return {
    SignClient: {
      init: vi.fn().mockResolvedValue(mockSignClient),
    },
  };
});

describe('WC2Connector', () => {
  let connector: WC2Connector;
  let mockSignClient: any;

  // Setup before each test
  beforeEach(() => {
    // Reset mockSignClient for each test
    mockSignClient = {
      connect: vi.fn().mockResolvedValue({
        uri: 'wc:abc123',
        approval: vi.fn().mockResolvedValue({ topic: 'session-topic' }),
      }),
      on: vi.fn(),
      request: vi.fn(),
      disconnect: vi.fn(),
    };

    // Ensure SignClient.init returns the mockSignClient
    (SignClient.init as any).mockResolvedValue(mockSignClient);

    connector = new WC2Connector('f62aa2bb589104d059ca7b5bb64b18fb', {
      name: 'Test dApp',
      description: 'A test dApp',
      url: 'https://test-dapp.com',
      icons: ['https://test-dapp.com/icon.png'],
    });
  });

  // Test connect method
  it('should initialize signClient and generate URI on connect', async () => {
    await connector.connect();

    expect(SignClient.init).toHaveBeenCalledWith({
      projectId: 'f62aa2bb589104d059ca7b5bb64b18fb',
      metadata: expect.any(Object),
    });
    expect(mockSignClient.connect).toHaveBeenCalledWith({
      requiredNamespaces: {
        bch: {
          methods: ['bch_signTransaction', 'bch_signMessage', 'bch_getAddresses'],
          chains: ['bch:mainnet'],
          events: ['addressesChanged'],
        },
      },
    });
    expect((connector as any).sessionTopic).toBe('session-topic');
  });

  // Test connect error when already connected
  it('should throw if already connected', async () => {
    (connector as any).signClient = mockSignClient;
    await expect(connector.connect()).rejects.toThrow('Already connected');
  });

  // Test connected status
  it('should report connected status', async () => {
    expect(await connector.connected()).toBe(false);
    (connector as any).sessionTopic = 'session-topic';
    expect(await connector.connected()).toBe(true);
  });

  // Test signTransaction method
  it('should sign transaction correctly', async () => {
    (connector as any).signClient = mockSignClient;
    (connector as any).sessionTopic = 'session-topic';

    const mockSourceOutputs = [{
      outpointTransactionHash: hexToBin('deadbeef'),
      outpointIndex: 0,
      sequenceNumber: 0,
      lockingBytecode: hexToBin('76a914deadbeef88ac'),
      valueSatoshis: BigInt(1000),
    }] as WcSourceOutput[];

    const mockRequest: WcSignTransactionRequest = {
      transaction: 'mockTransactionHex',
      sourceOutputs: mockSourceOutputs,
    };
    const mockSignedTransactionHex = 'signedTransactionHex';
    mockSignClient.request.mockResolvedValue(mockSignedTransactionHex);

    const result = await connector.signTransaction(mockRequest);

    expect(mockSignClient.request).toHaveBeenCalledWith({
      topic: 'session-topic',
      chainId: 'bch:mainnet',
      request: {
        method: 'bch_signTransaction',
        params: {
          transaction: 'mockTransactionHex',
          sourceOutputs: [{
            outpointTransactionHash: 'deadbeef',
            outpointIndex: 0,
            sequenceNumber: 0,
            lockingBytecode: '76a914deadbeef88ac',
            valueSatoshis: '1000n',
            token: undefined,
            contract: undefined,
          }],
          broadcast: undefined,
          userPrompt: undefined,
        },
      },
    });

    expect(result).toEqual({
      signedTransaction: mockSignedTransactionHex,
      signedTransactionHash: expect.any(String),
    });
  });

  // Test address method
  it('should get address correctly', async () => {
    (connector as any).signClient = mockSignClient;
    (connector as any).sessionTopic = 'session-topic';

    const mockAddresses = ['address1', 'address2'];
    mockSignClient.request.mockResolvedValue(mockAddresses);

    const address = await connector.address();

    expect(mockSignClient.request).toHaveBeenCalledWith({
      topic: 'session-topic',
      chainId: 'bch:mainnet',
      request: {
        method: 'bch_getAddresses',
        params: {},
      },
    });

    expect(address).toBe('address1');
  });

  // Test signMessage method
  it('should sign message correctly', async () => {
    (connector as any).signClient = mockSignClient;
    (connector as any).sessionTopic = 'session-topic';

    const mockMessageRequest: WcSignMessageRequest = {
      message: 'test message',
    };
    const mockSignature = 'mockSignature';
    mockSignClient.request.mockResolvedValue(mockSignature);

    const signature = await connector.signMessage(mockMessageRequest);

    expect(mockSignClient.request).toHaveBeenCalledWith({
      topic: 'session-topic',
      chainId: 'bch:mainnet',
      request: {
        method: 'bch_signMessage',
        params: {
          message: 'test message',
          userPrompt: undefined,
        },
      },
    });

    expect(signature).toBe(mockSignature);
  });

  // Test disconnect method
  it('should disconnect correctly', async () => {
    (connector as any).signClient = mockSignClient;
    (connector as any).sessionTopic = 'session-topic';

    await connector.disconnect();

    expect(mockSignClient.disconnect).toHaveBeenCalledWith({
      topic: 'session-topic',
      reason: { code: 1000, message: 'User disconnected' },
    });
    expect((connector as any).sessionTopic).toBeNull();
    expect((connector as any).signClient).toBeNull();
  });

  // Test event handling
  it('should handle events correctly', async () => {
    await connector.connect();

    const mockCallback = vi.fn();
    connector.on('addressChanged', mockCallback);

    // Simulate session_update event
    const sessionUpdateCallback = mockSignClient.on.mock.calls.find(
      (call: any) => call[0] === 'session_update'
    )[1];
    sessionUpdateCallback({
      params: {
        namespaces: {
          bch: {
            accounts: ['bch:mainnet:address1'],
          },
        },
      },
    });

    expect(mockCallback).toHaveBeenCalledWith('address1');
  });

  // Test disconnect event
  it('should emit disconnect event on session_delete', async () => {
    await connector.connect();

    const mockCallback = vi.fn();
    connector.on('disconnect', mockCallback);

    // Simulate session_delete event
    const sessionDeleteCallback = mockSignClient.on.mock.calls.find(
      (call: any) => call[0] === 'session_delete'
    )[1];
    sessionDeleteCallback();

    expect(mockCallback).toHaveBeenCalled();
    expect((connector as any).sessionTopic).toBeNull();
  });
});