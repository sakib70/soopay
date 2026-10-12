interface LogoProps {
  size?: number
  className?: string
}

/**
 * SoopayLogo — renders the real Soopay logo from /public/logo.svg.
 * Drop-in replacement for the previous SVG inline; same props API.
 */
export function SoopayLogo({ size = 32, className = '' }: LogoProps) {
  return (
    <img
      src="/logo.svg"
      alt="Soopay"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size, objectFit: 'contain' }}
      draggable={false}
    />
  )
}

export function SoopayWordmark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`display font-bold tracking-tight ${className}`}
      style={{ color: 'var(--ink)' }}
    >
      Soopay
    </span>
  )
}
