import { IConnector, WcSignTransactionRequest, WcSignTransactionResponse, WcSignMessageRequest, WcSignMessageResponse } from "@bch-wc2/interfaces";
import { stringify } from "@bitauth/libauth";
import Client from "@walletconnect/sign-client";
import { PairingTypes, SessionTypes } from "@walletconnect/types";
import { getSdkError } from "@walletconnect/utils";
import EventEmitter from "events";
import { Web3Modal } from "@web3modal/standalone";

export class Web3ModalConnector implements IConnector {
  useChipnet: boolean = false;
  client: Client;
  web3Modal: Web3Modal;
  pairings: PairingTypes.Struct[] = [];
  session?: SessionTypes.Struct = undefined;
  prevRelayerValue: string = "";
  accounts: string[] = [];
  chains: string[] = [];
  relayerRegion?: string;
  logger?: string;
  events: EventEmitter = new EventEmitter();

  constructor({
    useChipnet = false,
    globalClient,
    web3Modal,
    relayerRegion,
    logger,
  }: {
    useChipnet?: boolean,
    globalClient: Client,
    web3Modal: Web3Modal,
    relayerRegion?: string,
    logger?: string,
  }) {
    this.client = globalClient;
    this.web3Modal = web3Modal;
    this.useChipnet = useChipnet;
    this.relayerRegion = relayerRegion;
    this.logger = logger;
  };

  async reset() {
    this.session = undefined;
    this.accounts = [];
    this.chains = [];
    this.client?.removeAllListeners(undefined as any);

    for (const item in this.client?.core?.storage?.getKeys() || {}) {
      await this.client?.core?.storage?.removeItem(item);
    }

    for (const item in localStorage) {
      if (item.startsWith("wc@2")) {
        localStorage.removeItem(item);
      }
    }
  };

  async onSessionConnected(_session: SessionTypes.Struct) {
    const allNamespaceAccounts = Object.values(_session.namespaces)
      .map((namespace) => namespace.accounts)
      .flat();

    this.session = _session;
    this.chains = this.useChipnet ? ["bch:bchtest"] : ["bch:bitcoincash"];
    this.accounts = allNamespaceAccounts;
  }

  async _subscribeToEvents(_client: Client) {
    if (typeof _client === "undefined") {
      throw new Error("WalletConnect is not initialized");
    }

    _client.on("session_ping", (args) => {
      this.logger && console.log("EVENT", "session_ping", args);
    });

    _client.on("session_event", (args) => {
      this.logger && console.log("EVENT", "session_event", args);
      const params = args.params;
      if (params.chainId !== this.chains[0]) {
        return;
      }

      this.events.emit(params.event.name, params.event.data);
    });

    _client.on("session_update", ({ topic, params }) => {
      this.logger && console.log("EVENT", "session_update", { topic, params });
      const { namespaces } = params;
      const _session = _client.session.get(topic);
      const updatedSession = { ..._session, namespaces };
      this.onSessionConnected(updatedSession);
    });

    _client.on("session_delete", (args) => {
      this.logger && console.log("EVENT", "session_delete");
      this.events.emit("disconnect", args);
      _client.pairing.keys.forEach(key => {
        _client.pairing.delete(key, getSdkError("USER_DISCONNECTED"));
      });
      this.reset();
    });
  };

  async _checkPersistedState(_client: Client) {
    if (typeof _client === "undefined") {
      throw new Error("WalletConnect is not initialized");
    }
    // populates existing pairings to state
    this.pairings = _client.pairing.getAll({ active: true });
    this.logger && console.log(
      "RESTORED PAIRINGS: ",
      _client.pairing.getAll({ active: true })
    );

    if (typeof this.session !== "undefined") return;
    // populates (the last) existing session to state
    if (_client.session.length) {
      const lastKeyIndex = _client.session.keys.length - 1;
      const _session = _client.session.get(
        _client.session.keys[lastKeyIndex]
      );
      this.logger && console.log("RESTORED SESSION:", _session);
      await this.onSessionConnected(_session);
      (window as any).wcClient = _client;
      (window as any).wcSession = _session;
      this.session = _session;
      return _session;
    }
  };

  async address(): Promise<string | undefined> {
    try {
      const connectedAddress = this.session?.namespaces?.bch?.accounts?.[0]?.slice(4);
      if (connectedAddress) {
        return connectedAddress;
      }

      const result = await this.client!.request<string[]>({
        chainId: this.chains[0],
        topic: this.session!.topic,
        request: {
          method: "bch_getAddresses",
          params: {},
        },
      });

      return result[0];
    } catch (error: any) {
      return undefined;
    }
  };

  async signTransaction(options: WcSignTransactionRequest): Promise<WcSignTransactionResponse | undefined> {
    try {
      const result = await this.client!.request<{ signedTransaction: string, signedTransactionHash: string}>({
        chainId: this.chains[0],
        topic: this.session!.topic,
        request: {
          method: "bch_signTransaction",
          params: JSON.parse(stringify(options)),
        },
      });

      return result;
    } catch (error: any) {
      return undefined;
    }
  };

  async signMessage(options: WcSignMessageRequest): Promise<WcSignMessageResponse | undefined> {
    try {
      const result = await this.client!.request<string>({
        chainId: this.chains[0],
        topic: this.session!.topic,
        request: {
          method: "bch_signMessage",
          params: options,
        },
      });

      return result;
    } catch (error: any) {
      return undefined;
    }
  };

  async connect(): Promise<void> {
    await this._subscribeToEvents(this.client);
    await this._checkPersistedState(this.client);

    if (!this.session) {
      const pairings = this.client.pairing.getAll({ active: true });
      this.pairings = pairings;

      await this._connect(pairings[0]);
    }
  };

  async _connect(pairing: any) {
    if (typeof this.client === "undefined") {
      throw new Error("WalletConnect is not initialized");
    }
    this.logger && console.log("connect, pairing topic is:", pairing?.topic);
    try {
      const requiredNamespaces = {
        "bch": {
            "methods": [
                "bch_getAddresses",
                "bch_signTransaction",
                "bch_signMessage"
            ],
            "chains": [
                this.useChipnet ? "bch:bchtest" : "bch:bitcoincash"
            ],
            "events": [
                "addressesChanged"
            ]
        }
      };
      this.logger && console.log(
        "requiredNamespaces config for connect:",
        requiredNamespaces
      );

      const { uri, approval } = await this.client.connect({
        pairingTopic: pairing?.topic,
        requiredNamespaces,
      });

      // Open QRCode modal if a URI was returned (i.e. we're not connecting an existing pairing).
      if (uri) {
        // Create a flat array of all requested chains across namespaces.
        const standaloneChains = Object.values(requiredNamespaces)
          .map((namespace) => namespace.chains)
          .flat() as string[];

        this.web3Modal.openModal({ uri, standaloneChains });
      }

      const session = await approval();
      this.logger && console.log("Established session:", session);
      await this.onSessionConnected(session);
      // Update known pairings after session is connected.
      this.pairings = this.client.pairing.getAll({ active: true });
    } catch (e) {
      console.error(e);
      // ignore rejection
    } finally {
      // close modal in case it was open
      this.web3Modal.closeModal();
    }
  }

  async connected(): Promise<boolean> {
    return this.client !== undefined && this.session !== undefined;
  };
  async disconnect(): Promise<void> {
    if (typeof this.client === "undefined") {
      throw new Error("WalletConnect is not initialized");
    }
    if (typeof this.session === "undefined") {
      throw new Error("Session is not connected");
    }

    try {
      await this.client.disconnect({
        topic: this.session.topic,
        reason: getSdkError("USER_DISCONNECTED"),
      });
      this.client.pairing.keys.forEach(key => {
        this.client!.pairing.delete(key, getSdkError("USER_DISCONNECTED"));
      });
    } catch (error) {
      this.logger && console.error("SignClient.disconnect failed:", error);
    } finally {
      // Reset app state after disconnect.
      this.reset();
    }
  };
  on(event: string, callback: Function): void {
    this.events.on(event, callback as any);
  }
}
