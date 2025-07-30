import { SignClient } from "@walletconnect/sign-client";
import {
  binToHex,
  encodeTransaction,
  hexToBin,
  sha256,
} from "@bitauth/libauth";
import {
  IConnector,
  WcSignTransactionRequest,
  WcSignTransactionResponse,
  WcSignMessageRequest,
} from "@bch-wc2/interfaces";
import EventEmitter from "events";
import { Web3Modal } from "@web3modal/standalone";

export interface WC2ConnectorOptions {
  projectId: string;
  metadata?: any;
  chainId?: string;
  networkProvider?: {
    sendRawTransaction: (hexTransaction: string) => Promise<string>;
  };
  displayUri?: (uri: string) => void;
  web3Modal?: Web3Modal;
  logger?: {
    log: (message: string, ...args: any[]) => void;
  };
}

export class WC2Connector implements IConnector {
  private signClient: InstanceType<typeof SignClient> | null = null;
  private sessionTopic: string | null = null;
  private emitter = new EventEmitter();
  private projectId: string;
  private metadata: any;
  private chainId: string;
  private networkProvider?: WC2ConnectorOptions["networkProvider"];
  private displayUri?: (uri: string) => void;
  private web3Modal?: Web3Modal;
  private logger?: WC2ConnectorOptions["logger"];
  private pairings: any[] = [];

  constructor(options: WC2ConnectorOptions) {
    this.projectId = options.projectId;
    this.metadata = options.metadata || {};
    this.chainId = options.chainId || "bch:bitcoincash";
    this.networkProvider = options.networkProvider;
    this.displayUri = options.displayUri;
    this.web3Modal = options.web3Modal;
    this.logger = options.logger;
  }

  private log(message: string, ...args: any[]): void {
    if (this.logger) {
      this.logger.log(message, ...args);
    }
  }

  async connect(): Promise<void> {
    if (this.signClient) {
      this.log("Already connected, reusing existing client");
      return;
    }

    this.signClient = await SignClient.init({
      projectId: this.projectId,
      metadata: this.metadata,
    });

    // Check for existing sessions
    const sessions = this.signClient.session.getAll();
    if (sessions.length > 0) {
      const session = sessions[0];
      this.sessionTopic = session.topic;
      // Restore accounts and chains
      const namespace = session.namespaces?.bch;
      if (namespace && namespace.accounts) {
        const accounts = namespace.accounts.map(
          (acc: string) => acc.split(":")[2]
        );
        const chains = namespace.chains || [this.chainId];
        this.emitter.emit("addressChanged", accounts[0]);
        this.emitter.emit("chainsChanged", chains);
        this.log(
          "Restored session with accounts:",
          accounts,
          "chains:",
          chains
        );
      }
      this.setupEventListeners();
      this.log("Reusing existing session:", this.sessionTopic);
      return;
    }

    // Check for existing pairings
    this.pairings = this.signClient.pairing.getAll({ active: true });
    if (this.pairings.length > 0) {
      await this._connect(this.pairings[0]);
      return;
    }

    // Create a new connection
    const { uri, approval } = await this.signClient.connect({
      requiredNamespaces: {
        bch: {
          methods: [
            "bch_getAddresses",
            "bch_signTransaction",
            "bch_signMessage",
          ],
          chains: [this.chainId],
          events: ["addressesChanged"],
        },
      },
    });

    if (uri) {
      console.log("Generated URI:", uri);
      if (this.web3Modal) {
        this.web3Modal.openModal({ uri, standaloneChains: [this.chainId] });
      } else if (this.displayUri) {
        this.displayUri(uri);
      } else {
        this.emitter.emit("pairingUri", uri);
      }
    } else {
      throw new Error("No URI provided by WalletConnect");
    }

    const session = await approval();
    this.sessionTopic = session.topic;
    // Emit initial session data
    const namespace = session.namespaces?.bch;
    if (namespace && namespace.accounts) {
      const accounts = namespace.accounts.map(
        (acc: string) => acc.split(":")[2]
      );
      const chains = namespace.chains || [this.chainId];
      this.emitter.emit("addressChanged", accounts[0]);
      this.emitter.emit("chainsChanged", chains);
    }
    this.setupEventListeners();
    if (this.web3Modal) {
      this.web3Modal.closeModal();
    }
  }

  private async _connect(pairing: any): Promise<void> {
    try {
      const { uri, approval } = await this.signClient!.connect({
        pairingTopic: pairing.topic,
        requiredNamespaces: {
          bch: {
            methods: [
              "bch_getAddresses",
              "bch_signTransaction",
              "bch_signMessage",
            ],
            chains: [this.chainId],
            events: ["addressesChanged"],
          },
        },
      });

      if (uri) {
        console.log("Generated URI:", uri);
        if (this.web3Modal) {
          this.web3Modal.openModal({ uri, standaloneChains: [this.chainId] });
        } else if (this.displayUri) {
          this.displayUri(uri);
        } else {
          this.emitter.emit("pairingUri", uri);
        }
      }

      const session = await approval();
      this.sessionTopic = session.topic;
      // Emit initial session data
      const namespace = session.namespaces?.bch;
      if (namespace && namespace.accounts) {
        const accounts = namespace.accounts.map(
          (acc: string) => acc.split(":")[2]
        );
        const chains = namespace.chains || [this.chainId];
        this.emitter.emit("addressChanged", accounts[0]);
        this.emitter.emit("chainsChanged", chains);
      }
      this.setupEventListeners();
      if (this.web3Modal) {
        this.web3Modal.closeModal();
      }
    } catch (error) {
      this.log("Error connecting with pairing:", error);
      throw error;
    }
  }

  private setupEventListeners(): void {
    if (!this.signClient) return;

    this.signClient.on("session_delete", () => {
      this.log("Session deleted");
      this.emitter.emit("disconnect");
      this.reset();
    });

    this.signClient.on("session_update", (update) => {
      this.log("Session updated:", update);
      if (update.params.namespaces?.bch?.accounts) {
        const newAddresses = update.params.namespaces.bch.accounts.map(
          (account: string) => account.split(":")[2]
        );
        this.emitter.emit("addressChanged", newAddresses[0]);
      }
    });

    this.signClient.on("session_event", (event) => {
      this.log("Session event:", event);
      if (event.params.event.name === "addressChanged") {
        this.emitter.emit("addressChanged", event.params.event.data);
      }
    });

    this.signClient.on("session_ping", (args) => {
      this.log("Session ping received:", args);
    });
  }

  async connected(): Promise<boolean> {
    return !!this.sessionTopic;
  }

  async disconnect(): Promise<void> {
    if (!this.signClient || !this.sessionTopic) {
      return;
    }

    try {
      await this.signClient.disconnect({
        topic: this.sessionTopic,
        reason: { code: 1000, message: "User disconnected" },
      });
      this.log("Disconnected successfully");
    } catch (error) {
      this.log("Error disconnecting:", error);
    } finally {
      this.reset();
    }
  }

  async address(): Promise<string | undefined> {
    try {
      if (!this.signClient || !this.sessionTopic) {
        this.log("No active session for address request");
        return undefined;
      }

      const request = {
        topic: this.sessionTopic,
        chainId: this.chainId,
        request: {
          method: "bch_getAddresses",
          params: {},
        },
      };

      const response = await this.signClient.request(request);
      const addresses = response as string[];
      console.log("Addresses received:", addresses);
      return addresses[0];
    } catch (error) {
      this.log("Error getting address:", error);
      return undefined;
    }
  }

  async signTransaction(
    options: WcSignTransactionRequest
  ): Promise<WcSignTransactionResponse | undefined> {
    try {
      if (!this.signClient || !this.sessionTopic) {
        this.log("No active session for signTransaction");
        return undefined;
      }

      const transactionHex =
        typeof options.transaction === "string"
          ? options.transaction
          : binToHex(encodeTransaction(options.transaction));

      const serializedSourceOutputs = options.sourceOutputs.map((so) => ({
        outpointTransactionHash: binToHex(so.outpointTransactionHash),
        outpointIndex: so.outpointIndex,
        sequenceNumber: so.sequenceNumber,
        lockingBytecode: binToHex(so.lockingBytecode),
        valueSatoshis: so.valueSatoshis,
        token: so.token
          ? { category: binToHex(so.token.category), amount: so.token.amount }
          : undefined,
        contract: so.contract
          ? {
              abiFunction: so.contract.abiFunction,
              redeemScript: binToHex(so.contract.redeemScript),
              artifact: so.contract.artifact,
            }
          : undefined,
      }));

      const request = {
        topic: this.sessionTopic,
        chainId: this.chainId,
        request: {
          method: "bch_signTransaction",
          params: {
            transaction: transactionHex,
            sourceOutputs: serializedSourceOutputs,
            broadcast: options.broadcast,
            userPrompt: options.userPrompt,
          },
        },
      };

      const response = await this.signClient.request(request);
      const signedTransactionHex = response as string;

      const signedTransactionBin = hexToBin(signedTransactionHex);
      const signedTransactionHash = binToHex(
        sha256.hash(sha256.hash(signedTransactionBin)).reverse()
      );

      if (options.broadcast && this.networkProvider) {
        await this.networkProvider.sendRawTransaction(signedTransactionHex);
      }

      return {
        signedTransaction: signedTransactionHex,
        signedTransactionHash,
      };
    } catch (error) {
      this.log("Error signing transaction:", error);
      return undefined;
    }
  }

  async signMessage(
    options: WcSignMessageRequest
  ): Promise<string | undefined> {
    try {
      if (!this.signClient || !this.sessionTopic) {
        this.log("No active session for signMessage");
        return undefined;
      }

      const request = {
        topic: this.sessionTopic,
        chainId: this.chainId,
        request: {
          method: "bch_signMessage",
          params: {
            message: options.message,
            userPrompt: options.userPrompt,
          },
        },
      };

      const response = await this.signClient.request(request);
      return response as string;
    } catch (error) {
      this.log("Error signing message:", error);
      return undefined;
    }
  }

  private reset(): void {
    this.sessionTopic = null;
    this.signClient = null;
    this.emitter.removeAllListeners();
    this.log("State reset");
  }

  on(event: string, callback: Function): void {
    this.emitter.on(event, callback as (...args: any[]) => void);
  }
}
