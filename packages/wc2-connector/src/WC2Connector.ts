import { SignClient } from '@walletconnect/sign-client';
import { binToHex, encodeTransaction, hexToBin, sha256 } from '@bitauth/libauth';
import { WcSignTransactionRequest, WcSignTransactionResponse, WcSignMessageRequest, IConnector } from '@bch-wc2/interfaces';

export class WC2Connector implements IConnector {
  private signClient: InstanceType<typeof SignClient> | null = null;
  private sessionTopic: string | null = null;
  private listeners: { [event: string]: Function[] } = {};

  constructor(private projectId: string, private metadata: any) {}

  async connect(): Promise<void> {
    if (this.signClient) {
      throw new Error('Already connected');
    }

    // Initialize the WalletConnect SignClient
    this.signClient = await SignClient.init({
      projectId: this.projectId,
      metadata: this.metadata,
    });

    // Request connection and get pairing URI
    const { uri, approval } = await this.signClient.connect({
      requiredNamespaces: {
        bch: {
          methods: ['bch_signTransaction', 'bch_signMessage', 'bch_getAddresses'],
          chains: ['bch:mainnet'],
          events: ['addressesChanged'],
        },
      },
    });

    // Log the URI (for now, to display for pairing, e.g., in a QR code)
    console.log('Pairing URI:', uri);

    // Wait for wallet to approve the session
    const session = await approval();
    this.sessionTopic = session.topic;

    // Listen for session deletion (e.g., disconnection)
    this.signClient.on('session_delete', () => {
      this.sessionTopic = null;
      this.emit('disconnect');
    });

    // Listen for session updates (e.g., address changes)
    this.signClient.on('session_update', (update) => {
      if (update.params.namespaces?.bch?.accounts) {
        const newAddresses = update.params.namespaces.bch.accounts.map((account: string) => account.split(':')[2]);
        this.emit('addressChanged', newAddresses[0]);
      }
    });
  }

  async signTransaction(options: WcSignTransactionRequest): Promise<WcSignTransactionResponse | undefined> {
    if (!this.signClient || !this.sessionTopic) {
      throw new Error('No active session. Please connect first.');
    }

    // Serialize transaction (convert to hex if it's a Transaction object)
    const transactionHex = typeof options.transaction === 'string' 
      ? options.transaction 
      : binToHex(encodeTransaction(options.transaction));
      
    // Serialize sourceOutputs for WalletConnect
    const serializedSourceOutputs = options.sourceOutputs.map(so => ({
      outpointTransactionHash: binToHex(so.outpointTransactionHash),
      outpointIndex: so.outpointIndex,
      sequenceNumber: so.sequenceNumber,
      lockingBytecode: binToHex(so.lockingBytecode),
      valueSatoshis: so.valueSatoshis,
      token: so.token,
      contract: so.contract ? {
        abiFunction: so.contract.abiFunction,
        redeemScript: binToHex(so.contract.redeemScript),
        artifact: so.contract.artifact,
      } : undefined,
    }));

    // Prepare the WalletConnect request
    const request = {
      topic: this.sessionTopic,
      chainId: 'bch:mainnet',
      request: {
        method: 'bch_signTransaction',
        params: {
          transaction: transactionHex,
          sourceOutputs: serializedSourceOutputs,
          broadcast: options.broadcast,
          userPrompt: options.userPrompt,
        },
      },
    };

    // Send the request and await the response
    const response = await this.signClient.request(request);
    const signedTransactionHex = response as string; // Assuming wallet returns hex string

    // Compute the transaction hash
    const signedTransactionBin = hexToBin(signedTransactionHex);
    const signedTransactionHash = binToHex(sha256.hash(sha256.hash(signedTransactionBin)).reverse());

    return {
      signedTransaction: signedTransactionHex,
      signedTransactionHash,
    };
  }

  async address(): Promise<string | undefined> {
    if (!this.signClient || !this.sessionTopic) {
      throw new Error('No active session. Please connect first.');
    }

    const request = {
      topic: this.sessionTopic,
      chainId: 'bch:mainnet',
      request: {
        method: 'bch_getAddresses',
        params: {},
      },
    };

    const response = await this.signClient.request(request);
    const addresses = response as string[];
    return addresses[0]; // Return the first address
  }

  async signMessage(options: WcSignMessageRequest): Promise<string | undefined> {
    if (!this.signClient || !this.sessionTopic) {
      throw new Error('No active session. Please connect first.');
    }

    const request = {
      topic: this.sessionTopic,
      chainId: 'bch:mainnet',
      request: {
        method: 'bch_signMessage',
        params: {
          message: options.message,
          userPrompt: options.userPrompt,
        },
      },
    };

    const response = await this.signClient.request(request);
    return response as string; // Assuming wallet returns signature as string
  }

  async disconnect(): Promise<void> {
    if (!this.signClient || !this.sessionTopic) {
      return;
    }

    await this.signClient.disconnect({
      topic: this.sessionTopic,
      reason: { code: 1000, message: 'User disconnected' },
    });
    this.sessionTopic = null;
    this.signClient = null;
  }

  async connected(): Promise<boolean> {
    return !!this.sessionTopic;
  }

  private emit(event: string, ...args: any[]): void {
    const callbacks = this.listeners[event];
    if (callbacks) {
      callbacks.forEach((cb) => cb(...args));
    }
  }

  on(event: string, callback: Function): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }
}