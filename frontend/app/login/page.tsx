"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, AlertCircle, Sparkles } from "lucide-react"
import { authApi } from "@/lib/api"

const SAVED_EMAIL_KEY = "saved_login_email"
const SAVED_PWD_KEY = "saved_login_pwd"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const savedEmail = localStorage.getItem(SAVED_EMAIL_KEY) || ""
    const savedPwd = localStorage.getItem(SAVED_PWD_KEY) || ""
    if (savedEmail) { setEmail(savedEmail); setRemember(true) }
    if (savedPwd) setPassword(savedPwd)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await authApi.login({ email, password })
      if (res.data?.access_token) {
        localStorage.setItem("access_token", res.data.access_token)
        localStorage.setItem("user_id", String(res.data.user_id))
        localStorage.setItem("username", res.data.username)
        if (remember) {
          localStorage.setItem(SAVED_EMAIL_KEY, email)
          localStorage.setItem(SAVED_PWD_KEY, password)
        } else {
          localStorage.removeItem(SAVED_EMAIL_KEY)
          localStorage.removeItem(SAVED_PWD_KEY)
        }
        router.push("/dashboard")
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "登录失败，请检查邮箱和密码")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">ZNXP SaaS</span>
          </div>
          <p className="text-sm text-muted-foreground">跨境 POD 刺绣选品自动化平台</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base text-center">登录账号</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">邮箱</label>
                <Input
                  type="email"
                  placeholder="admin@znxp.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">密码</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="remember"
                  type="checkbox"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                  className="w-3.5 h-3.5 accent-primary cursor-pointer"
                />
                <label htmlFor="remember" className="text-xs text-muted-foreground cursor-pointer select-none">
                  记住账号密码
                </label>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "登录"}
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground mt-4">
              默认账号：admin@znxp.com / znxp2024
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
