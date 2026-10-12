/**
 * useSafeChainSwitch — wraps wagmi's switchChain with wallet_addEthereumChain fallback.
 *
 * MetaMask and most injected wallets reject wallet_switchEthereumChain if the chain
 * isn't already added. This hook catches that error (code 4902 = "chain not added")
 * and falls back to wallet_addEthereumChain automatically, then retries the switch.
 *
 * Without this, some wallets open a generic "select network" modal that lists every
 * chain the app supports — which is confusing when you only want one specific chain.
 */
import { useCallback, useState } from 'react'
import { useConfig } from 'wagmi'
import { switchChain } from 'wagmi/actions'
import type { Chain } from 'viem'

export interface SafeSwitchState {
  isPending: boolean
  error: string | null
}

export function useSafeChainSwitch() {
  const config = useConfig()
  const [state, setState] = useState<SafeSwitchState>({ isPending: false, error: null })

  const safeSwitch = useCallback(async (targetChainId: number) => {
    setState({ isPending: true, error: null })
    try {
      // Primary: wagmi switchChain (handles wallet_switchEthereumChain)
      await switchChain(config, { chainId: targetChainId })
      setState({ isPending: false, error: null })
    } catch (err: unknown) {
      const errObj = err as { code?: number; message?: string }
      // 4902 = chain not added to wallet yet
      if (errObj.code === 4902 || errObj.message?.includes('Unrecognized chain')) {
        // Find the chain definition from wagmi config
        const chain = config.chains.find((c: Chain) => c.id === targetChainId)
        if (!chain) {
          setState({ isPending: false, error: `Chain ${targetChainId} not in app config` })
          return
        }
        try {
          // Ask wallet to add the chain first
          const provider = await config.connectors[0]?.getProvider?.() as
            | { request: (args: { method: string; params: unknown[] }) => Promise<unknown> }
            | undefined
          if (!provider?.request) {
            throw new Error('No provider available')
          }
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${chain.id.toString(16)}`,
              chainName: chain.name,
              nativeCurrency: chain.nativeCurrency,
              rpcUrls: [chain.rpcUrls.default.http[0]],
              blockExplorerUrls: chain.blockExplorers?.default?.url
                ? [chain.blockExplorers.default.url]
                : undefined,
            }],
          })
          // Retry the switch after adding
          await switchChain(config, { chainId: targetChainId })
          setState({ isPending: false, error: null })
        } catch (addErr: unknown) {
          const addErrObj = addErr as { message?: string; code?: number }
          if (addErrObj.code === 4001 || addErrObj.message?.includes('rejected')) {
            setState({ isPending: false, error: 'User rejected network add' })
          } else {
            setState({ isPending: false, error: addErrObj.message ?? 'Failed to add chain' })
          }
        }
      } else if (errObj.code === 4001 || errObj.message?.includes('rejected')) {
        setState({ isPending: false, error: 'User rejected network switch' })
      } else {
        setState({ isPending: false, error: errObj.message ?? 'Failed to switch network' })
      }
    }
  }, [config])

  return { safeSwitch, ...state }
}
