import React, { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Leaf } from 'lucide-react'

export default function Auth({ onLogin }) {
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

      if (!res.ok) throw new Error(data.detail || "Authentication Failed")
      if (onLogin) onLogin(data.email, data.access_token)

    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex w-full h-[100vh] items-center justify-center bg-gradient-to-br from-neutral-100 via-blue-50/30 to-sky-50/20 overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-soft" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl animate-pulse-soft animation-delay-1000" />
      </div>

      {/* Glassmorphism Card */}
      <Card className="w-full max-w-md mx-4 glass-card shadow-glass-strong animate-scale-in relative z-10">
        <CardHeader className="text-center space-y-3 pb-6">
          {/* Logo */}
          {/* <div className="mx-auto w-14 h-14 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center shadow-glow-strong hover-lift cursor-default">
            <Leaf className="w-7 h-7 text-white" strokeWidth={2.5} />
          </div> */}

          <CardTitle className="text-2xl font-bold tracking-tight text-gradient">
            MediMind
          </CardTitle>

          <CardDescription className="text-sm font-medium text-muted-foreground">
            {isLogin
              ? 'Welcome back! Please enter your details.'
              : 'Create your personalized medical profile.'}
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleAuth} className="animate-fade-in animation-delay-100">
          <CardContent className="space-y-5">
            <div className="space-y-2.5">
              <Label htmlFor="email" className="text-foreground font-medium">Email Address</Label>
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

            <div className="space-y-2.5">
              <Label htmlFor="password" className="text-foreground font-medium">Password</Label>
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
              <div className="mt-4 p-3 bg-red-50/80 backdrop-blur-sm text-red-600 text-sm rounded-lg border border-red-100 text-center animate-slide-down">
                {errorMsg}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-4 mt-2">
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
        <div className="px-6 pb-6 pt-2 text-center">
          <p className="text-[11px] text-muted-foreground">
            Your health data is secure and private
          </p>
        </div>
      </Card>
    </div>
  )
}
