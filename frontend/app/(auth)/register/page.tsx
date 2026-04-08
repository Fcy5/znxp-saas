"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, AlertCircle, Sparkles } from "lucide-react"
import { authApi } from "@/lib/api"

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: "", username: "", password: "", confirm: "" })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (form.password !== form.confirm) {
      setError("两次密码不一致")
      return
    }
    setLoading(true)
    try {
      const res = await authApi.register({
        email: form.email,
        username: form.username,
        password: form.password,
        otp_code: "000000",
      })
      if (res.data?.access_token) {
        localStorage.setItem("access_token", res.data.access_token)
        localStorage.setItem("user_id", String(res.data.user_id))
        localStorage.setItem("username", res.data.username)
        router.push("/dashboard")
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "注册失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">ZNXP SaaS</span>
          </div>
          <p className="text-sm text-muted-foreground">跨境 POD 刺绣选品自动化平台</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base text-center">创建账号</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">邮箱</label>
                <Input type="email" placeholder="your@email.com" value={form.email} onChange={set("email")} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">用户名</label>
                <Input placeholder="用户名" value={form.username} onChange={set("username")} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">密码</label>
                <Input type="password" placeholder="至少 6 位" value={form.password} onChange={set("password")} required minLength={6} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">确认密码</label>
                <Input type="password" placeholder="再输一次" value={form.confirm} onChange={set("confirm")} required />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-destructive">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "注册"}
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground mt-4">
              已有账号？
              <Link href="/login" className="text-primary hover:underline ml-1">直接登录</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
