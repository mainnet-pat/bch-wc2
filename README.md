# BCH WalletConnectV2 interfaces and utilities

This monorepo contrains the interfaces for the spec described here https://github.com/mainnet-pat/wc2-bch-bcr, see also the post on BCR https://bitcoincashresearch.org/t/wallet-connect-v2-support-for-bitcoincash/1100

## @bch-wc2/interfaces

This repo contains no code other than interfaces for WC2 BCH connector.

## @bch-wc2/privkey-connector

This is a simple implementation of `IConnector` interface which makes use of provided private key to handle transaction signing and message signing requests. It is a very useful tool for local development and testing. See tests for usage patterns with `mainnet-js` and `cashscript`.

## @bch-wc2/mainnet-js-signer

`WrapWallet` allows to wrap a mainnet-js wallet and use a provided `IConnector` to delegate the signing to.

## @bch-wc2/wc2-connector

To be done.

Actual implementation of `IConnector` interface for WalletConnectV2 signing client which communicates with WC2 enabled wallets.
