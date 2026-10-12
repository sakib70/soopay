import { useState, useCallback, useEffect } from 'react'
import { getCurrency, setCurrency } from '@/lib/storage'
import type { CurrencyCode } from '@/lib/constants'

export function useCurrency() {
  const [currency, _setCurrency] = useState<CurrencyCode>(() => getCurrency())

  const changeCurrency = useCallback((code: CurrencyCode) => {
    setCurrency(code)
    _setCurrency(code)
  }, [])

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'soopay_currency' && e.newValue) {
        _setCurrency(e.newValue as CurrencyCode)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return { currency, changeCurrency }
}
