import { useLocation, Link } from 'react-router-dom'
import { SoopayLogo } from './SoopayLogo'
import { WalletButton } from './WalletButton'
import { NetworkBadge } from './NetworkBadge'

export function Header() {
  const location = useLocation()

  const pageTitle: Record<string, string> = {
    '/':                   'Dashboard',
    '/send':               'Send',
    '/bridge':             'Bridge',
    '/payroll':            'Payroll',
    '/payroll/employees':  'Employees',
    '/payroll/review':     'Payroll Review',
    '/activity':           'Activity',
    '/recipients':         'Recipients',
    '/settings':           'Settings',
    '/reports':            'Reports',
    '/agent':              'SooAgent',
  }

  const title = pageTitle[location.pathname] || 'Soopay'

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 md:px-6"
      style={{
        background: 'rgba(9,9,15,0.75)',
        backdropFilter: 'blur(28px) saturate(160%)',
        WebkitBackdropFilter: 'blur(28px) saturate(160%)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.4)',
      }}
    >
      {/* Left: mobile logo + page title */}
      <div className="flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2 md:hidden">
          <SoopayLogo size={28} />
        </Link>
        <div className="hidden md:block">
          <NetworkBadge />
        </div>
        <h1
          className="display text-base font-semibold md:hidden"
          style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
        >
          {title}
        </h1>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2.5">
        <div className="md:hidden">
          <NetworkBadge />
        </div>
        <WalletButton />
      </div>
    </header>
  )
}
