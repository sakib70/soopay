/**
 * Real blockchain balance reads for USDC and cirBTC on Arc Testnet.
 * cirBTC: 0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF — verified on-chain.
 */

import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { USDC_ADDRESS, CIRBTC_ADDRESS, ARC_TESTNET_CHAIN_ID } from '@/lib/constants'

export interface Balances {
  usdc: bigint | undefined
  usdcLoading: boolean
  usdcError: boolean
  cirBtc: bigint | undefined
  cirBtcLoading: boolean
  cirBtcError: boolean
  cirBtcDecimals: number | undefined
  refetch: () => void
}

export function useBalances(): Balances {
  const { address, isConnected } = useAccount()

  const {
    data: usdcRaw,
    isLoading: usdcLoading,
    isError: usdcError,
    refetch: refetchUsdc,
  } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isConnected && !!address, refetchInterval: 15_000 },
  })

  const {
    data: cirBtcRaw,
    isLoading: cirBtcLoading,
    isError: cirBtcError,
    refetch: refetchCirBtc,
  } = useReadContract({
    address: CIRBTC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: isConnected && !!address, refetchInterval: 15_000 },
  })

  // Read cirBTC decimals from contract — verified as 8, but read live for correctness
  const { data: cirBtcDecimalsRaw } = useReadContract({
    address: CIRBTC_ADDRESS,
    abi: erc20Abi,
    functionName: 'decimals',
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { staleTime: Infinity }, // decimals never change
  })

  const refetch = () => {
    void refetchUsdc()
    void refetchCirBtc()
  }

  return {
    usdc: usdcRaw,
    usdcLoading,
    usdcError,
    cirBtc: cirBtcRaw,
    cirBtcLoading,
    cirBtcError,
    // Use live value, fall back to verified constant 8
    cirBtcDecimals: cirBtcDecimalsRaw ?? 8,
    refetch,
  }
}
