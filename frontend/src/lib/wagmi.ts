import { http, createConfig } from 'wagmi'
import { mainnet, polygon } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

export const config = createConfig({
  chains: [mainnet, polygon],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
  },
  connectors: [
    injected({ shimDisconnect: true }), // MetaMask & inne injected wallets
    walletConnect({
      projectId: 'd777043f6605c5fc6ae1005d630aaba5',
      showQrModal: true
    }),
  ],
})