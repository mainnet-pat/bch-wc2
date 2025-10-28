import { CoreTypes } from "@walletconnect/types";
import { Web3ModalConfig } from "@web3modal/standalone";

export const DefaultDesktopWallets: Web3ModalConfig['desktopWallets'] = [
  {
    id: "Cashonize",
    name: "Cashonize",
    links: {
      native: undefined as any,
      universal: "https://cashonize.com/#"
    },
  },
  {
    id: "Paytaca",
    name: "Paytaca",
    links: {
      native: "",
      universal: "chrome-extension://pakphhpnneopheifihmjcjnbdbhaaiaa/www/index.html#/apps/wallet-connect"
    }
  },
  {
    id: "Zapit",
    name: "Zapit",
    links: {
      native: "",
      universal: "chrome-extension://fccgmnglbhajioalokbcidhcaikhlcpm/index.html#/wallet-connect"
    }
  },
];

export const DefaultWalletImages: Record<string, string> = {
  "Cashonize": "https://cashonize.com/images/cashonize-icon.png",
  "Paytaca": "https://www.paytaca.com/favicon.png",
  "Zapit": "https://lh3.googleusercontent.com/DbMYirtFPzZhSky0djg575FGPAriqGUPokFcb8r0-3qdcgKfR8uLqwK0DCPn0XrrsijRNDUAKUVLXGqLWVcFBB8zDA=s120",
}

export interface Configuration {
  useChipnet?: boolean;
  projectId: string;
  metadata?: CoreTypes.Metadata;
  desktopWallets?: Web3ModalConfig['desktopWallets'],
  walletImages?: Record<string, string>,
  logger?: string | undefined,
  relayUrl?: string | undefined,
}
