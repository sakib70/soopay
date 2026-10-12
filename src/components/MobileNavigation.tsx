import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Send, ArrowLeftRight, BarChart2, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/',        label: 'Home',     Icon: LayoutDashboard },
  { to: '/send',    label: 'Send',     Icon: Send },
  { to: '/bridge',  label: 'Bridge',   Icon: ArrowLeftRight },
  { to: '/reports', label: 'Reports',  Icon: BarChart2 },
  { to: '/activity',label: 'Activity', Icon: Activity },
]

export function MobileNavigation() {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 flex md:hidden"
      style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px) saturate(200%)',
        WebkitBackdropFilter: 'blur(20px) saturate(200%)',
        borderTop: '1px solid var(--border)',
      }}
    >
      {navItems.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-all',
              isActive ? '' : '',
            )
          }
          style={({ isActive }) => ({
            color: isActive ? 'var(--accent)' : 'var(--subtle)',
          })}
        >
          <Icon className="size-5" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
