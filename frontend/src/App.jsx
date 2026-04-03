import React, { useState, useEffect } from 'react'
import Auth from './pages/Auth'
import Chat from './pages/Chat'

function App() {
  const [session, setSession] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = sessionStorage.getItem('token')
    const email = sessionStorage.getItem('email')

    if (token && email) {
      try {
        // Decode the JWT payload (base64 middle section) without a library
        const payload = JSON.parse(atob(token.split('.')[1]))
        const isExpired = payload.exp && Date.now() / 1000 > payload.exp

        if (isExpired) {
          // Token has expired — clear storage and show login
          sessionStorage.removeItem('token')
          sessionStorage.removeItem('email')
        } else {
          setSession({ access_token: token, email: email })
        }
      } catch {
        // Malformed token — clear and show login
        sessionStorage.removeItem('token')
        sessionStorage.removeItem('email')
      }
    }

    setIsLoading(false)
  }, [])


  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-blue-50/20 to-sky-50/10 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-glow animate-pulse-soft">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
            </svg>
          </div>
          <span className="text-lg font-semibold text-gradient">MediMind</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased">
      {!session ? (
        <div className="flex items-center justify-center min-h-screen">
          <Auth onLogin={(email, token) => {
            sessionStorage.setItem('token', token)
            sessionStorage.setItem('email', email)
            setSession({ access_token: token, email: email })
          }} />
        </div>
      ) : (
        <Chat session={session} onLogout={() => {
          sessionStorage.removeItem('token')
          sessionStorage.removeItem('email')
          setSession(null)
        }}/>
      )}
    </div>
  )
}

export default App
