# Soopay

> Local-currency-first payments and payroll on Arc Network — Built with Arc Studio

## What This App Does

Soopay lets users send USDC and cirBTC on Arc Testnet using familiar local currencies (BDT, INR, PKR, NGN, IDR, VND, THB, PHP, EUR, USD) for input. FX rates are fetched live server-side. No fiat is transferred on-chain.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, react-router-dom v7
- Web3: wagmi v2, viem v2, ConnectKit
- Chain: Arc Testnet (Chain ID: 5042002)
- Tokens: USDC (0x3600000000000000000000000000000000000000, 6 decimals)
- cirBTC: 0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF (Arc Testnet)
- FX Server: Bun server at server/fx.ts on port 3001 (exchangerate-api.com + CoinGecko)
- Vite proxy: /api → http://localhost:3001

## Deployed Contracts

| Contract | Network | Address | Explorer |
|---|---|---|---|
| SoopayPayroll | Arc Testnet | 0xcf48794299977efa8236f571d222adff3850ea4b | https://explorer.testnet.arc.io/address/0xcf48794299977efa8236f571d222adff3850ea4b |

### SoopayPayroll

- **Address**: `0xcf48794299977efa8236f571d222adff3850ea4b`
- **Network**: Arc Testnet (Chain ID: 5042002)
- **Constructor args**: owner=0x5B12Ce46C7194aD57d143bC22847224047b1Ef42, usdc=0x3600000000000000000000000000000000000000, cirBtc=0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF
- **Key function**: `batchPay(address token, address[] recipients, uint256[] amounts)`
- **Allowed tokens**: USDC + cirBTC (whitelisted in constructor)
- **Max batch**: 100 recipients per call
- **Isolation**: per-recipient try/catch — one blocked address never cancels the rest

## Key Files

- `src/App.tsx` — Router + layout shell
- `src/pages/Dashboard.tsx` — Portfolio dashboard
- `src/pages/Send.tsx` — USDC + cirBTC send
- `src/pages/Bridge.tsx` — USDC bridge via CCTP (outbound from Arc)
- `src/pages/Payroll.tsx` — Payroll overview + employee FX quotes
- `src/pages/Employees.tsx` — Full employee management (add/edit/delete, paymentAsset)
- `src/pages/PayrollReview.tsx` — FX breakdown + approve + batchPay execution
- `src/pages/Activity.tsx` — Transaction history
- `src/pages/Recipients.tsx` — Saved recipients
- `src/pages/Settings.tsx` — Settings + wallet info
- `src/hooks/useFx.ts` — FX rates hook
- `src/hooks/useBalances.ts` — USDC + cirBTC balances
- `src/lib/constants.ts` — App constants + contract addresses + ABI
- `src/lib/storage.ts` — localStorage helpers (Employee has paymentAsset field)
- `contracts/SoopayPayroll.sol` — Batch payroll contract

## Environment Variables

```
VITE_CIRBTC_ADDRESS=0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF
VITE_PAYROLL_CONTRACT=0xcf48794299977efa8236f571d222adff3850ea4b
EXCHANGE_RATE_API_KEY=<key>   # server-side only, never in VITE_
```

## Bridge

- Source: Arc Testnet
- Destination: Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, Avalanche Fuji
- Protocol: CCTP v2 (depositForBurn on Arc TokenMessengerV2)
- USDC only — cirBTC cannot be bridged

## Payroll Rules

- Salaries always stored in local currency (e.g. 20,000 BDT)
- Crypto equivalent (USDC or cirBTC) calculated at payment time from live FX
- USDC employees → USDC batchPay via SoopayPayroll
- cirBTC employees → cirBTC batchPay via SoopayPayroll
- Approval required before each batchPay if allowance is insufficient
- Max 100 per batch (auto-enforced)

## Notes

- Arc uses USDC as native gas — no ETH needed
- USDC always read via ERC-20 balanceOf (6 decimals)
- Bridge is USDC-only (no cirBTC bridge)
- Activity records persist in localStorage (confirmed transactions only)

## SoopayPayrollAgent (Arc Testnet)
- Address: `0x8d9c32954a5c9c4e75d63783b85d4d53893170d5`
- Explorer: https://explorer.testnet.arc.io/address/0x8d9c32954a5c9c4e75d63783b85d4d53893170d5
- Purpose: Onchain schedule registry — keccak256 hash of payroll config, no funds custody
