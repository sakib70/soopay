/**
 * IntroPage — cinematic full-screen intro for Soopay.
 * Press Enter / click the button / tap to enter the app.
 * Remembers dismissal in sessionStorage so it only shows once per session.
 */

import { useEffect, useRef, useState } from 'react'

interface Props {
  onEnter: () => void
}

// Floating particle data
interface Particle {
  id: number
  x: number
  y: number
  size: number
  speedX: number
  speedY: number
  opacity: number
  hue: number
}

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    speedX: (Math.random() - 0.5) * 0.015,
    speedY: (Math.random() - 0.5) * 0.015,
    opacity: Math.random() * 0.5 + 0.1,
    hue: Math.random() > 0.7 ? 0 : 230, // red or blue-purple
  }))
}

export function IntroPage({ onEnter }: Props) {
  const [phase, setPhase]       = useState<'in' | 'idle' | 'out'>('in')
  const [particles]             = useState(() => generateParticles(60))
  const [particlePos, setPos]   = useState(particles)
  const [mouseX, setMouseX]     = useState(50)
  const [mouseY, setMouseY]     = useState(50)
  const [pressing, setPressing] = useState(false)
  const [chars, setChars]       = useState<string[]>([])
  const rafRef                  = useRef<number>(0)
  const frameRef                = useRef(0)
  const containerRef            = useRef<HTMLDivElement>(null)
  const phaseRef                = useRef(phase)

  // Particle animation loop
  useEffect(() => {
    const animate = () => {
      setPos(prev => prev.map(p => {
        let nx = p.x + p.speedX
        let ny = p.y + p.speedY
        if (nx < 0 || nx > 100) { nx = Math.random() * 100; ny = Math.random() * 100 }
        if (ny < 0 || ny > 100) { nx = Math.random() * 100; ny = Math.random() * 100 }
        return { ...p, x: nx, y: ny }
      }))
      frameRef.current++
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // Cursor parallax
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 100
      const y = (e.clientY / window.innerHeight) * 100
      setMouseX(x)
      setMouseY(y)
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  // Keep phaseRef in sync so the keydown handler sees the latest phase
  useEffect(() => { phaseRef.current = phase }, [phase])

  // Enter on keyboard — uses phaseRef to avoid stale closure
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (phaseRef.current === 'out') return
        phaseRef.current = 'out'
        setPhase('out')
        setTimeout(onEnter, 700)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onEnter])

  // Scramble text effect on "SOOPAY"
  useEffect(() => {
    const word = 'SOOPAY'
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let iteration = 0
    const maxIter = word.length * 5
    const interval = setInterval(() => {
      setChars(
        word.split('').map((ch, i) => {
          if (i < Math.floor(iteration / 5)) return ch
          return charset[Math.floor(Math.random() * charset.length)]
        })
      )
      if (iteration >= maxIter) clearInterval(interval)
      iteration++
    }, 40)
    return () => clearInterval(interval)
  }, [])

  // Phase-in animation on mount
  useEffect(() => {
    const t = setTimeout(() => setPhase('idle'), 100)
    return () => clearTimeout(t)
  }, [])

  function handleEnter() {
    if (phaseRef.current === 'out') return
    phaseRef.current = 'out'
    setPhase('out')
    setTimeout(onEnter, 700)
  }

  const offsetX = (mouseX - 50) * 0.06
  const offsetY = (mouseY - 50) * 0.06

  return (
    <div
      ref={containerRef}
      onClick={handleEnter}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        overflow: 'hidden',
        cursor: 'none',
        background: '#07070e',
        opacity: phase === 'out' ? 0 : 1,
        transition: phase === 'out' ? 'opacity 0.65s cubic-bezier(0.4,0,0.2,1)' : 'none',
      }}
    >
      {/* Deep space background orbs */}
      <div style={{
        position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none',
      }}>
        {/* Large ambient orb — red */}
        <div style={{
          position: 'absolute',
          width: '70vw', height: '70vw',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(220,15,15,0.18) 0%, transparent 70%)',
          top: '-20vw', left: '15vw',
          transform: `translate(${offsetX * -0.5}px, ${offsetY * -0.5}px)`,
          transition: 'transform 0.4s ease',
          filter: 'blur(60px)',
        }} />
        {/* Blue-purple orb */}
        <div style={{
          position: 'absolute',
          width: '50vw', height: '50vw',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(80,40,200,0.20) 0%, transparent 70%)',
          bottom: '-10vw', right: '-5vw',
          transform: `translate(${offsetX * 0.8}px, ${offsetY * 0.8}px)`,
          transition: 'transform 0.4s ease',
          filter: 'blur(50px)',
        }} />
        {/* Subtle blue */}
        <div style={{
          position: 'absolute',
          width: '30vw', height: '30vw',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(30,80,220,0.15) 0%, transparent 70%)',
          top: '50%', left: '-5vw',
          transform: `translate(${offsetX * 0.3}px, ${offsetY * 0.3}px)`,
          transition: 'transform 0.5s ease',
          filter: 'blur(40px)',
        }} />
      </div>

      {/* Floating particles */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        aria-hidden="true"
      >
        {particlePos.map(p => (
          <circle
            key={p.id}
            cx={`${p.x}%`}
            cy={`${p.y}%`}
            r={p.size}
            fill={p.hue === 0 ? `rgba(232,40,40,${p.opacity})` : `rgba(140,100,255,${p.opacity})`}
          />
        ))}
      </svg>

      {/* Grid overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
      }} />

      {/* Horizontal scan lines */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 4px)',
      }} />

      {/* Center content */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 0,
        transform: `translate(${offsetX * 0.2}px, ${offsetY * 0.2}px)`,
        transition: 'transform 0.5s ease',
      }}>

        {/* Logo mark */}
        <div
          className="animate-fade-in"
          style={{
            marginBottom: '28px',
            opacity: phase === 'in' ? 0 : 1,
            transition: 'opacity 0.8s ease 0.2s',
          }}
        >
          <img
            src="/logo.svg"
            alt="Soopay"
            style={{
              width: 80, height: 80,
              filter: 'drop-shadow(0 0 24px rgba(232,20,20,0.7)) drop-shadow(0 0 48px rgba(232,20,20,0.3))',
              animation: 'float 4s ease-in-out infinite',
            }}
          />
        </div>

        {/* Brand name — scramble effect */}
        <div
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 'clamp(56px, 12vw, 120px)',
            fontWeight: 800,
            letterSpacing: '-0.06em',
            lineHeight: 1,
            color: '#ffffff',
            textShadow: '0 0 40px rgba(232,20,20,0.5), 0 0 80px rgba(232,20,20,0.2)',
            marginBottom: '12px',
            opacity: phase === 'in' ? 0 : 1,
            transition: 'opacity 0.8s ease 0.4s',
          }}
        >
          {chars.length > 0 ? chars.join('') : 'SOOPAY'}
        </div>

        {/* Tagline */}
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 'clamp(13px, 2vw, 18px)',
            fontWeight: 300,
            letterSpacing: '0.25em',
            color: 'rgba(200,190,230,0.7)',
            textTransform: 'uppercase',
            marginBottom: '56px',
            opacity: phase === 'in' ? 0 : 1,
            transition: 'opacity 0.8s ease 0.6s',
          }}
        >
          Local Currency · Global Blockchain Payments
        </p>

        {/* Thin divider */}
        <div style={{
          width: 'clamp(120px, 20vw, 240px)',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(232,20,20,0.6), transparent)',
          marginBottom: '48px',
          opacity: phase === 'in' ? 0 : 1,
          transition: 'opacity 0.8s ease 0.7s',
        }} />

        {/* Enter button */}
        <button
          onClick={(e) => { e.stopPropagation(); handleEnter() }}
          onMouseDown={() => setPressing(true)}
          onMouseUp={() => setPressing(false)}
          onMouseLeave={() => setPressing(false)}
          style={{
            display: 'flex', alignItems: 'center', gap: '14px',
            padding: '16px 40px',
            borderRadius: '999px',
            background: pressing
              ? 'rgba(232,20,20,0.25)'
              : 'rgba(232,20,20,0.12)',
            border: '1px solid rgba(232,20,20,0.4)',
            color: '#fff',
            fontSize: '15px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: pressing
              ? '0 0 40px rgba(232,20,20,0.5), inset 0 1px 0 rgba(255,255,255,0.1)'
              : '0 0 24px rgba(232,20,20,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
            transform: pressing ? 'scale(0.97)' : 'scale(1)',
            transition: 'all 0.15s ease',
            opacity: phase === 'in' ? 0 : 1,
          }}
        >
          <span>Enter App</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Press Enter hint */}
        <p style={{
          marginTop: '20px',
          fontSize: '11px',
          letterSpacing: '0.12em',
          color: 'rgba(255,255,255,0.2)',
          textTransform: 'uppercase',
          fontFamily: "'DM Sans', sans-serif",
          opacity: phase === 'in' ? 0 : 1,
          transition: 'opacity 0.8s ease 1s',
        }}>
          Press Enter or click anywhere
        </p>
      </div>

      {/* Custom cursor */}
      <div style={{
        position: 'fixed',
        left: `${mouseX}%`,
        top: `${mouseY}%`,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 9999,
        transition: 'left 0.05s linear, top 0.05s linear',
      }}>
        {/* Outer ring */}
        <div style={{
          position: 'absolute',
          width: pressing ? '52px' : '36px',
          height: pressing ? '52px' : '36px',
          borderRadius: '50%',
          border: '1px solid rgba(232,20,20,0.6)',
          transform: 'translate(-50%, -50%)',
          transition: 'width 0.2s ease, height 0.2s ease, border-color 0.2s ease',
          boxShadow: '0 0 12px rgba(232,20,20,0.3)',
        }} />
        {/* Inner dot */}
        <div style={{
          position: 'absolute',
          width: '5px', height: '5px',
          borderRadius: '50%',
          background: 'rgba(232,20,20,0.9)',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 8px rgba(232,20,20,0.8)',
        }} />
      </div>

      {/* Bottom corner labels */}
      <div style={{
        position: 'absolute', bottom: '28px', left: '32px',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '10px', letterSpacing: '0.08em',
        color: 'rgba(255,255,255,0.18)',
        opacity: phase === 'in' ? 0 : 1,
        transition: 'opacity 1s ease 1.2s',
      }}>
        USDC · cirBTC · Arc Testnet
      </div>
      <div style={{
        position: 'absolute', bottom: '28px', right: '32px',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '10px', letterSpacing: '0.08em',
        color: 'rgba(255,255,255,0.18)',
        opacity: phase === 'in' ? 0 : 1,
        transition: 'opacity 1s ease 1.2s',
        textAlign: 'right',
      }}>
        v1.0 · Built on Arc
      </div>

      {/* Top status bar */}
      <div style={{
        position: 'absolute', top: '24px', left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '6px 16px',
        borderRadius: '999px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(10px)',
        opacity: phase === 'in' ? 0 : 1,
        transition: 'opacity 0.8s ease 1s',
        whiteSpace: 'nowrap',
      }}>
        <span style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: '#22c55e',
          boxShadow: '0 0 6px rgba(34,197,94,0.8)',
          animation: 'pulse-glow 2s infinite',
          display: 'inline-block',
        }} />
        <span style={{
          fontSize: '11px', letterSpacing: '0.06em',
          color: 'rgba(255,255,255,0.45)',
          fontFamily: "'JetBrains Mono', monospace",
        }}>ARC TESTNET · LIVE</span>
      </div>
    </div>
  )
}
