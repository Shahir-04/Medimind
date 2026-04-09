import React, { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Leaf, Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '@/lib/useTheme'

export default function Auth({ onLogin }) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLogin, setIsLogin] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    const endpoint = isLogin ? '/api/login' : '/api/signup'

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await res.json()

      if (!res.ok) {
        let msg = "Authentication Failed"
        if (data.detail) {
          msg = Array.isArray(data.detail) ? data.detail[0].msg : data.detail
        }
        throw new Error(msg)
      }

      if (onLogin) onLogin(data.email, data.access_token)

    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`relative flex flex-col w-full min-h-[100vh] h-[100vh] items-center justify-center overflow-y-auto overflow-x-hidden ${resolvedTheme === 'dark' ? 'bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950' : 'bg-gradient-to-br from-neutral-100 via-blue-50/30 to-sky-50/20'}`}>
      {/* Theme Toggle */}
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="absolute top-4 right-4 z-20 p-2.5 rounded-xl glass-card text-muted-foreground hover:text-foreground transition-all hover:scale-105"
        title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
      >
        {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </button>

      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-64 md:w-96 h-64 md:h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-soft" />
        <div className="absolute bottom-0 right-1/4 w-64 md:w-96 h-64 md:h-96 bg-accent/5 rounded-full blur-3xl animate-pulse-soft animation-delay-1000" />
      </div>

      {/* Top Heading - flows naturally above the card */}
      <div className="relative z-20 flex justify-center items-center pointer-events-none mb-6 md:mb-10 mt-12 md:mt-0 flex-shrink-0">
        <h1 className="text-4xl sm:text-5xl md:text-5xl font-extrabold tracking-tighter animate-fade-in flex flex-col items-center gap-2 sm:gap-4 px-4 text-center">
          <span className="text-gradient">MediMind</span>
          <span className="text-muted-foreground text-[9px] sm:text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] sm:tracking-[0.3em] opacity-60">Your Personalized Medical Assistant</span>
        </h1>
      </div>

      {/* Glassmorphism Card */}
      <Card className="w-full max-w-md mx-4 glass-card shadow-glass-strong animate-scale-in relative z-10 flex-shrink-0 mb-8">
        <CardHeader className="text-center space-y-3 pb-4 sm:pb-6">
          <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-gradient">
            MediMind
          </CardTitle>

          <CardDescription className="text-xs sm:text-sm font-medium text-muted-foreground">
            {isLogin
              ? 'Welcome back! Please enter your details.'
              : 'Create your personalized medical profile.'}
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleAuth} className="animate-fade-in animation-delay-100">
          <CardContent className="space-y-4 sm:space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-medium text-sm">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input-premium"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground font-medium text-sm">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input-premium"
              />
            </div>

            {errorMsg && (
              <div className="mt-3 p-3 bg-red-50/80 backdrop-blur-sm text-red-600 text-sm rounded-lg border border-red-100 text-center animate-slide-down">
                {errorMsg}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3 sm:gap-4 mt-2">
            <Button
              type="submit"
              className="w-full h-11 text-white shadow-glow hover:shadow-glow-strong font-semibold"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                isLogin ? 'Sign In' : 'Create Account'
              )}
            </Button>

            <button
              type="button"
              onClick={() => { setIsLogin(!isLogin); setErrorMsg(''); }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors outline-none font-medium"
            >
              {isLogin
                ? "Don't have an account? Sign up"
                : "Already have an account? Log in"}
            </button>
          </CardFooter>
        </form>

        {/* Premium Footer */}
        <div className="px-6 pb-5 pt-2 text-center">
          <p className="text-[11px] text-muted-foreground">
            Your health data is secure and private
          </p>
        </div>
      </Card>
    </div>
  )
}
