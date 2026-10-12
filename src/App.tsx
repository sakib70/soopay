import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'
import { MobileNavigation } from '@/components/MobileNavigation'
import { CursorGlow } from '@/components/CursorGlow'
import { IntroPage } from '@/pages/IntroPage'
import { Dashboard } from '@/pages/Dashboard'
import { Send } from '@/pages/Send'
import { Bridge } from '@/pages/Bridge'
import { Payroll } from '@/pages/Payroll'
import { Employees } from '@/pages/Employees'
import { PayrollReview } from '@/pages/PayrollReview'
import { Activity } from '@/pages/Activity'
import { Recipients } from '@/pages/Recipients'
import { Settings } from '@/pages/Settings'
import { Reports } from '@/pages/Reports'
import { AgentPage } from '@/pages/AgentPage'

const INTRO_KEY = 'soopay:intro:v1'

export default function App() {
  // Show intro only once per browser session
  const [showIntro, setShowIntro] = useState(() => {
    return sessionStorage.getItem(INTRO_KEY) !== 'done'
  })

  const handleEnter = () => {
    sessionStorage.setItem(INTRO_KEY, 'done')
    setShowIntro(false)
  }

  // Cursor glow only on non-touch devices — initialised lazily to avoid SSR issues
  const [hasPointer] = useState(() => window.matchMedia('(pointer: fine)').matches)

  return (
    <>
      {/* Custom cursor — desktop only */}
      {hasPointer && !showIntro && <CursorGlow />}

      {/* Intro overlay */}
      {showIntro && <IntroPage onEnter={handleEnter} />}

      {/* Main app */}
      <Router>
        <div
          className="flex h-dvh overflow-hidden"
          style={{
            opacity: showIntro ? 0 : 1,
            transition: 'opacity 0.5s ease 0.1s',
          }}
        >
          {/* Desktop sidebar — fixed height, never scrolls */}
          <Sidebar />

          {/* Main content area — scrolls independently */}
          <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto">
              <Routes>
                <Route path="/"                   element={<Dashboard />} />
                <Route path="/send"               element={<Send />} />
                <Route path="/bridge"             element={<Bridge />} />
                <Route path="/payroll"            element={<Payroll />} />
                <Route path="/payroll/employees"  element={<Employees />} />
                <Route path="/payroll/review"     element={<PayrollReview />} />
                <Route path="/activity"           element={<Activity />} />
                <Route path="/recipients"         element={<Recipients />} />
                <Route path="/settings"           element={<Settings />} />
                <Route path="/reports"            element={<Reports />} />
                <Route path="/agent"              element={<AgentPage />} />
              </Routes>
            </main>
          </div>

          {/* Mobile bottom navigation */}
          <MobileNavigation />
        </div>
      </Router>
    </>
  )
}
