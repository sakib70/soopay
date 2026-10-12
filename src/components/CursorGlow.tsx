/**
 * CursorGlow — replaces the default cursor with a premium glowing orb effect.
 * Renders two layers:
 *   1. A large diffuse "aura" that lags slightly behind the cursor
 *   2. A small crisp dot that follows immediately
 *
 * Also updates --mx / --my CSS variables on <body> so the body::after
 * radial gradient in index.css tracks the mouse.
 */
import { useEffect, useRef, useState } from 'react'

export function CursorGlow() {
  const [pos,    setPos]    = useState({ x: -200, y: -200 })
  const [lagged, setLagged] = useState({ x: -200, y: -200 })
  const [click,  setClick]  = useState(false)
  const [hidden, setHidden] = useState(true)
  const lagRef = useRef({ x: -200, y: -200 })
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY })
      setHidden(false)
      // Update body CSS vars for background tracking
      document.body.style.setProperty('--mx', `${(e.clientX / window.innerWidth) * 100}%`)
      document.body.style.setProperty('--my', `${(e.clientY / window.innerHeight) * 100}%`)
    }
    const onDown = () => setClick(true)
    const onUp   = () => setClick(false)
    const onLeave = () => setHidden(true)
    const onEnter = () => setHidden(false)

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup',   onUp)
    document.documentElement.addEventListener('mouseleave', onLeave)
    document.documentElement.addEventListener('mouseenter', onEnter)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup',   onUp)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      document.documentElement.removeEventListener('mouseenter', onEnter)
    }
  }, [])

  // Smooth lagged aura
  useEffect(() => {
    const animate = () => {
      setPos(cur => {
        lagRef.current = {
          x: lagRef.current.x + (cur.x - lagRef.current.x) * 0.10,
          y: lagRef.current.y + (cur.y - lagRef.current.y) * 0.10,
        }
        setLagged({ ...lagRef.current })
        return cur
      })
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  if (hidden) return null

  return (
    <>
      {/* Outer aura — large, diffuse, lagged */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: lagged.x,
          top: lagged.y,
          width:  click ? '280px' : '220px',
          height: click ? '280px' : '220px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(232,20,20,0.12) 0%, rgba(232,20,20,0.04) 40%, transparent 70%)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 9996,
          transition: 'width 0.3s ease, height 0.3s ease',
          mixBlendMode: 'screen',
        }}
      />
      {/* Mid ring — subtle border */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: lagged.x,
          top: lagged.y,
          width:  click ? '52px' : '36px',
          height: click ? '52px' : '36px',
          borderRadius: '50%',
          border: '1px solid rgba(232,20,20,0.45)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 9997,
          transition: 'width 0.18s ease, height 0.18s ease, border-color 0.2s ease',
          boxShadow: click ? '0 0 16px rgba(232,20,20,0.4)' : '0 0 8px rgba(232,20,20,0.2)',
        }}
      />
      {/* Inner dot — precise, no lag */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          width:  click ? '8px' : '5px',
          height: click ? '8px' : '5px',
          borderRadius: '50%',
          background: click ? 'rgba(255,255,255,0.9)' : 'rgba(232,20,20,0.95)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 9998,
          transition: 'width 0.15s ease, height 0.15s ease, background 0.15s ease',
          boxShadow: click ? '0 0 12px rgba(255,255,255,0.6)' : '0 0 8px rgba(232,20,20,0.8)',
        }}
      />
    </>
  )
}
