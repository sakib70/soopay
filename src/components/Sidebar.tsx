import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Send, ArrowLeftRight, Users, Activity, UserCheck, Settings, BarChart2, Bot } from 'lucide-react'
import { SoopayLogo, SoopayWordmark } from './SoopayLogo'
import { WalletButton } from './WalletButton'
import { NetworkBadge } from './NetworkBadge'

const navItems = [
  { to: '/',                   label: 'Dashboard',  Icon: LayoutDashboard },
  { to: '/send',               label: 'Send',        Icon: Send },
  { to: '/bridge',             label: 'Bridge',      Icon: ArrowLeftRight },
  { to: '/payroll',            label: 'Payroll',     Icon: Users },
  { to: '/activity',           label: 'Activity',    Icon: Activity },
  { to: '/reports',            label: 'Reports',     Icon: BarChart2 },
  { to: '/agent',              label: 'SooAgent',    Icon: Bot },
  { to: '/recipients',         label: 'Recipients',  Icon: UserCheck },
  { to: '/settings',           label: 'Settings',    Icon: Settings },
]

export function Sidebar() {
  return (
    <aside
      className="hidden md:flex w-[220px] flex-col h-full shrink-0"
      style={{
        background: 'rgba(10,10,20,0.72)',
        backdropFilter: 'blur(32px) saturate(160%)',
        WebkitBackdropFilter: 'blur(32px) saturate(160%)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '4px 0 40px rgba(0,0,0,0.4)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-5">
        <SoopayLogo size={34} />
        <SoopayWordmark className="text-lg" />
      </div>

      {/* Network badge */}
      <div className="px-4 mb-3">
        <NetworkBadge />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 group ${
                isActive ? 'nav-active' : 'hover:bg-white/[0.06]'
              }`
            }
            style={({ isActive }) => isActive
              ? { color: '#ffffff' }
              : { color: 'rgba(200,192,230,0.65)' }
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className="shrink-0 transition-all duration-200"
                  style={{
                    color: isActive ? '#fff' : 'rgba(200,192,230,0.5)',
                    filter: isActive ? 'drop-shadow(0 0 6px rgba(232,20,20,0.8))' : 'none',
                  }}
                >
                  <Icon className="size-4" />
                </span>
                <span className="transition-all duration-200">{label}</span>
                {isActive && (
                  <span
                    className="ml-auto w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: '#e81414', boxShadow: '0 0 6px rgba(232,20,20,0.8)' }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Wallet at bottom */}
      <div
        className="px-4 py-4 mt-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
      >
        <WalletButton />
      </div>
    </aside>
  )
}
