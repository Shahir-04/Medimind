import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Mail, Eye, EyeOff, ShieldCheck, Zap, Sun, Moon, Contact } from 'lucide-react'
import { useTheme } from '@/lib/useTheme'

export default function Auth({ onLogin }) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('signup') // 'login', 'signup', 'reset'
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [pendingVerification, setPendingVerification] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [verifyingCode, setVerifyingCode] = useState(false)

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    setSuccessMsg('')

    let endpoint = '/api/login'
    let bodyData = { email, password }
    if (mode === 'signup') {
      endpoint = '/api/signup'
    } else if (mode === 'reset') {
      endpoint = '/api/reset-password'
      bodyData = { email, new_password: password }
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      })

      const data = await res.json()

      if (!res.ok) {
        let msg = mode === 'reset' ? "Password Reset Failed" : "Authentication Failed"
        if (data.detail) {
          msg = Array.isArray(data.detail) ? data.detail[0].msg : data.detail
        }
        if (res.status === 403 && msg.includes('verify')) {
          setPendingVerification(true)
          setSuccessMsg('Please verify your email to log in.')
        }
        throw new Error(msg)
      }

      if (mode === 'signup') {
        setPendingVerification(true)
        setSuccessMsg(data.message || 'Verification email sent! Check your inbox.')
        setPassword('')
      } else if (mode === 'reset') {
        setSuccessMsg("Password reset successfully. Please log in.")
        setMode('login')
        setPassword('')
      } else {
        if (onLogin) onLogin(data.email, data.access_token)
      }
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleResendVerification = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to resend verification email')
      }
      setSuccessMsg(data.message || 'Verification email resent!')
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setErrorMsg('Please enter the 6-digit verification code')
      return
    }
    setVerifyingCode(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: verificationCode })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || 'Invalid verification code')
      }
      setPendingVerification(false)
      setSuccessMsg('Email verified! You can now log in.')
      setMode('login')
      setVerificationCode('')
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setVerifyingCode(false)
    }
  }

  const handleOAuth = (provider) => {
    setErrorMsg(`${provider} login is not implemented yet.`)
  }

  return (
    <div className={`min-h-screen flex w-full flex-col lg:flex-row transition-colors duration-300 ${resolvedTheme === 'dark' ? 'bg-neutral-950 text-foreground' : 'bg-white text-neutral-900'}`}>
      {/* Theme Toggle Button */}
      <button
        type="button"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className={`absolute top-4 right-4 z-50 p-2.5 rounded-full transition-all hover:scale-105 shadow-sm ${resolvedTheme === 'dark' ? 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700' : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200'}`}
        title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
      >
        {resolvedTheme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
      </button>

      {/* Left Panel (Blue branding area) */}
      <div className="relative hidden w-full lg:flex lg:w-5/12 xl:w-[45%] p-10 flex-col bg-gradient-to-b from-[#4EA0F5] to-[#2E81D4] text-white justify-between overflow-hidden">
        {/* Decorate circles/glows */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-white/5 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4 pointer-events-none" />

        <div className="relative z-10 flex items-center gap-2.5 mb-12">
          <Contact className="w-8 h-8" />
          <span className="text-xl font-bold tracking-wide">MediMind</span>
        </div>

        <div className="relative z-10 mb-auto mt-16 max-w-xl">
          <h1 className="text-4xl lg:text-5xl xl:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6">
            Your health journey,<br />guided by<br />intelligence.
          </h1>
          <p className="text-white/90 text-lg font-medium leading-relaxed max-w-lg">
            Join the next generation of clinical interaction.<br />
            Secure, private, and powered by advanced medical AI.
          </p>
        </div>

        <div className="relative z-10 flex flex-col gap-6 mt-16 pb-8">
          <div className="flex gap-4 items-start">
            <div className="p-3 bg-white/20 rounded-full flex-shrink-0 backdrop-blur-md shadow-sm">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div className="pt-0.5">
              <h3 className="font-bold text-[17px] tracking-tight">HIPAA Compliant</h3>
              <p className="text-white/80 text-[15px] mt-0.5">Your data is encrypted and protected.</p>
            </div>
          </div>
          <div className="flex gap-4 items-start">
            <div className="p-3 bg-white/20 rounded-full flex-shrink-0 backdrop-blur-md shadow-sm">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div className="pt-0.5">
              <h3 className="font-bold text-[17px] tracking-tight">Instant Triage</h3>
              <p className="text-white/80 text-[15px] mt-0.5">24/7 symptom analysis and guidance.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel (Auth Form) */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 sm:p-12 relative z-10">

        {/* Mobile Logo */}
        <div className="flex lg:hidden items-center gap-2 mb-8 text-[#3A8DED]">
          <Contact className="w-8 h-8" />
          <span className="text-2xl font-bold tracking-wide text-foreground">MediMind</span>
        </div>

        <div className="w-full max-w-[420px] space-y-8 animate-fade-in">

          {pendingVerification ? (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Check Your Email</h2>
                <p className="text-muted-foreground text-[15px] mt-3">
                  We've sent a verification code to<br />
                  <span className="font-semibold text-foreground">{email}</span>
                </p>
              </div>

              {successMsg && (
                <div className="p-3 bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 text-sm rounded-lg border border-green-100 dark:border-green-900/50 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  {successMsg}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <input
                      key={i}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={verificationCode[i] || ''}
                      onPaste={(e) => {
                        e.preventDefault()
                        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
                        setVerificationCode(pasted)
                        if (pasted.length > 0) {
                          document.getElementById(`otp-${Math.min(pasted.length - 1, 5)}`)?.focus()
                        }
                      }}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '')
                        const newCode = verificationCode.split('')
                        newCode[i] = val
                        setVerificationCode(newCode.join('').slice(0, 6))
                        if (val && i < 5) {
                          document.getElementById(`otp-${i + 1}`)?.focus()
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !verificationCode[i] && i > 0) {
                          document.getElementById(`otp-${i - 1}`)?.focus()
                        }
                      }}
                      id={`otp-${i}`}
                      className="w-12 h-14 text-center text-xl font-bold bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg focus:ring-2 focus:ring-[#3A8DED] focus:border-[#3A8DED] outline-none"
                    />
                  ))}
                </div>
                <p className="text-center text-sm text-muted-foreground">Enter the 6-digit code from your email</p>
              </div>

              {errorMsg && !successMsg && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-900/50 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {errorMsg}
                </div>
              )}

              <Button
                type="button"
                onClick={handleVerifyCode}
                className="w-full h-12 bg-[#4EA0F5] hover:bg-[#348BEA] text-white font-semibold text-[15px] rounded-xl shadow-md transition-all hover:shadow-lg"
                disabled={verifyingCode || verificationCode.length !== 6}
              >
                {verifyingCode ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify Code'
                )}
              </Button>

              <Button
                type="button"
                onClick={handleResendVerification}
                className="w-full h-12 bg-[#4EA0F5] hover:bg-[#348BEA] text-white font-semibold text-[15px] rounded-xl shadow-md transition-all hover:shadow-lg"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Resend Verification Email'
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setPendingVerification(false); setMode('login'); setSuccessMsg(''); setErrorMsg(''); }}
                  className="text-[#4EA0F5] hover:text-[#348BEA] hover:underline text-sm font-medium transition-colors"
                >
                  Back to Login
                </button>
              </div>
            </div>
          ) : (
          <div className="space-y-2">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              {mode === 'login' ? 'Welcome Back' : mode === 'reset' ? 'Reset Password' : 'Create Account'}
            </h2>
            <p className="text-muted-foreground text-[15px]">
              {mode === 'login' ? 'Enter your credentials to access your profile.' : mode === 'reset' ? 'Enter your email and a new password.' : 'Enter your details to start your health profile.'}
            </p>
          </div>
          )}

          {pendingVerification ? null : (
          <form onSubmit={handleAuth} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[13px] font-semibold text-foreground/80">Email Address</Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={`pl-4 pr-10 h-12 bg-neutral-100/50 dark:bg-neutral-900/50 border-neutral-200 dark:border-neutral-800 rounded-xl focus-visible:ring-[#3A8DED] ${resolvedTheme === 'dark' ? 'text-white' : 'text-neutral-900'}`}
                />
                <Mail className="absolute right-3.5 top-3.5 h-5 w-5 text-neutral-400 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-[13px] font-semibold text-foreground/80">
                  {mode === 'reset' ? 'New Password' : 'Password'}
                </Label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => { setMode('reset'); setErrorMsg(''); setSuccessMsg(''); }}
                    className="text-[13px] font-medium text-[#3A8DED] hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className={`pl-4 pr-10 h-12 bg-neutral-100/50 dark:bg-neutral-900/50 border-neutral-200 dark:border-neutral-800 rounded-xl focus-visible:ring-[#3A8DED] ${resolvedTheme === 'dark' ? 'text-white' : 'text-neutral-900'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors focus:outline-none"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <div className="flex items-start gap-3 py-1">
                <div className="flex items-center h-5">
                  <input
                    id="terms"
                    type="checkbox"
                    required
                    className="w-4 h-4 mt-0.5 rounded border-neutral-300 text-[#3A8DED] focus:ring-[#3A8DED] bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 accent-[#3A8DED]"
                  />
                </div>
                <Label htmlFor="terms" className="text-[13px] text-muted-foreground leading-snug font-normal">
                  I agree to the <a href="#" className="font-semibold text-foreground hover:text-[#3A8DED]">Terms of Service</a> and <a href="#" className="font-semibold text-foreground hover:text-[#3A8DED]">Privacy Policy</a>.
                </Label>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-900/50 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 text-sm rounded-lg border border-green-100 dark:border-green-900/50 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                {successMsg}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 bg-[#4EA0F5] hover:bg-[#348BEA] text-white font-semibold text-[15px] rounded-xl shadow-md transition-all hover:shadow-lg"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                mode === 'login' ? 'Sign In' : mode === 'reset' ? 'Update Password' : 'Create Account'
              )}
            </Button>
          </form>
          )}

          {(mode === 'login' || mode === 'signup') && !pendingVerification && (
            <div className="mt-8 space-y-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-neutral-200 dark:border-neutral-800"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className={`px-4 font-bold tracking-widest ${resolvedTheme === 'dark' ? 'bg-neutral-950 text-neutral-500' : 'bg-white text-neutral-400'}`}>
                    Or continue with
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOAuth('Google')}
                  className="h-11 rounded-xl border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950 hover:bg-neutral-100 dark:hover:bg-neutral-900 font-medium text-foreground transition-colors shadow-sm"
                >
                  <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google" className="w-4 h-4 mr-2" />
                  Google
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOAuth('Apple')}
                  className="h-11 rounded-xl border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950 hover:bg-neutral-100 dark:hover:bg-neutral-900 font-medium text-foreground transition-colors shadow-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" className="w-4 h-4 mr-2" fill="currentColor">
                    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                  </svg>
                  Apple
                </Button>
              </div>
            </div>
          )}

          {!pendingVerification && (
            <div className="mt-8 text-center">
              <p className="text-[14px] text-muted-foreground font-medium">
                {mode === 'login' ? "Don't have an account? " : mode === 'reset' ? "Remembered your password? " : "Already have an account? "}
                <button
                  type="button"
                  onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErrorMsg(''); setSuccessMsg(''); }}
                  className="text-[#4EA0F5] hover:text-[#348BEA] hover:underline font-bold transition-colors"
                >
                  {mode === 'login' ? 'Create one here' : 'Log in here'}
                </button>
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
