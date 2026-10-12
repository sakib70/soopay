/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig, fallback } from 'wagmi'
import { mainnet, sepolia, baseSepolia, arbitrumSepolia, avalancheFuji } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

/**
 * Reliable public RPC endpoints for each bridge source chain.
 * Using multiple fallbacks so a single provider outage doesn't break the bridge flow.
 * None of these require an API key — they are free public endpoints.
 */
const SEPOLIA_RPCS = [
  'https://rpc.sepolia.org',           // Ethereum Foundation — official
  'https://ethereum-sepolia-rpc.publicnode.com', // PublicNode — no key needed
  'https://1rpc.io/sepolia',            // 1RPC — privacy-preserving
]

const BASE_SEPOLIA_RPCS = [
  'https://sepolia.base.org',          // Coinbase — official
  'https://base-sepolia-rpc.publicnode.com',
  'https://1rpc.io/base-sepolia',
]

const ARB_SEPOLIA_RPCS = [
  'https://sepolia-rollup.arbitrum.io/rpc', // Offchain Labs — official
  'https://arbitrum-sepolia-rpc.publicnode.com',
  'https://1rpc.io/arb-sepolia',
]

const AVAX_FUJI_RPCS = [
  'https://api.avax-test.network/ext/bc/C/rpc', // Avalanche Foundation — official
  'https://avalanche-fuji-c-chain-rpc.publicnode.com',
  'https://1rpc.io/avax/fuji-c',
]

export const config = createConfig({
  chains: [
    arcTestnet,      // primary — all sends, payroll, bridge destination
    sepolia,         // Ethereum Sepolia — bridge source
    baseSepolia,     // Base Sepolia — bridge source
    arbitrumSepolia, // Arbitrum Sepolia — bridge source
    avalancheFuji,   // Avalanche Fuji — bridge source
    mainnet,         // mainnet needed for ENS resolution only
  ],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]:      http('https://rpc.testnet.arc.network'),
    [sepolia.id]:         fallback(SEPOLIA_RPCS.map(url => http(url))),
    [baseSepolia.id]:     fallback(BASE_SEPOLIA_RPCS.map(url => http(url))),
    [arbitrumSepolia.id]: fallback(ARB_SEPOLIA_RPCS.map(url => http(url))),
    [avalancheFuji.id]:   fallback(AVAX_FUJI_RPCS.map(url => http(url))),
    [mainnet.id]:         http(), // ENS resolution only — default is fine
  },
})
