"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Check, Crown, Building2, Key, Bell, Shield, LogOut, Palette, Loader2, Bot, CheckCircle2 } from "lucide-react"
import { useTheme, THEMES } from "@/components/theme-provider"
import { request, AVAILABLE_MODELS, dashboardApi } from "@/lib/api"

const plans = [
  {
    name: "Free", price: "$0", current: false,
    features: ["5 次/月 AI 推品", "基础筛选", "1 个店铺"],
  },
  {
    name: "Starter", price: "$29", current: true,
    features: ["50 次/月 AI 推品", "全维度筛选", "3 个店铺", "SEO 文案生成", "图片基础处理"],
  },
  {
    name: "Pro", price: "$79", current: false,
    features: ["无限 AI 推品", "5 个店铺", "视频二创", "Agent 自动模式", "优先队列"],
  },
  {
    name: "Enterprise", price: "联系我们", current: false,
    features: ["无限一切", "专属 Agent", "API 访问", "SLA 保障"],
  },
]

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const router = useRouter()

  // 用户信息
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [currentPwd, setCurrentPwd] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState("")

  // 用量统计（真实数据）
  const [stats, setStats] = useState<{ total_published: number; total_products_in_library: number; agent_tasks_completed_today: number } | null>(null)

  // AI 配置
  const [aiKey, setAiKey] = useState("")
  const [aiUrl, setAiUrl] = useState("")
  const [aiModel, setAiModel] = useState("")
  const [aiSaving, setAiSaving] = useState(false)
  const [aiSaved, setAiSaved] = useState(false)
  const [aiError, setAiError] = useState("")

  useEffect(() => {
    // 加载用户信息
    request<{ data: { username: string; email: string; subscription_tier: string } }>("/users/me")
      .then(res => {
        setUsername(res.data.username)
        setEmail(res.data.email)
      }).catch(() => {
        // 降级读 localStorage
        const u = localStorage.getItem("username") || ""
        const e = localStorage.getItem("email") || ""
        setUsername(u); setEmail(e)
      })
    // 加载真实用量
    dashboardApi.stats().then(r => setStats(r.data)).catch(() => {})
    // 加载 AI 配置
    request<{ data: { ai_api_key: string; ai_base_url: string; ai_model: string } }>("/settings/ai")
      .then(res => {
        setAiKey(res.data.ai_api_key)
        setAiUrl(res.data.ai_base_url)
        setAiModel(res.data.ai_model)
      })
      .catch(() => {})
  }, [])

  const handleSaveProfile = async () => {
    setProfileSaving(true); setProfileMsg("")
    try {
      await request("/users/me", {
        method: "PUT",
        body: JSON.stringify({
          username: username || undefined,
          email: email || undefined,
          current_password: currentPwd || undefined,
          new_password: newPwd || undefined,
        }),
      })
      setCurrentPwd(""); setNewPwd("")
      setProfileMsg("保存成功")
      setTimeout(() => setProfileMsg(""), 3000)
    } catch (e: unknown) {
      setProfileMsg(e instanceof Error ? e.message : "保存失败")
    } finally { setProfileSaving(false) }
  }

  const handleLogout = () => {
    localStorage.removeItem("access_token")
    localStorage.removeItem("username")
    localStorage.removeItem("email")
    router.push("/login")
  }

  const handleSaveAI = async () => {
    setAiSaving(true)
    setAiError("")
    setAiSaved(false)
    try {
      await request("/settings/ai", {
        method: "PUT",
        body: JSON.stringify({
          ai_api_key: aiKey.includes("***") ? undefined : aiKey,
          ai_base_url: aiUrl,
          ai_model: aiModel,
        }),
      })
      setAiSaved(true)
      setTimeout(() => setAiSaved(false), 3000)
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : "保存失败")
    } finally {
      setAiSaving(false)
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <Header title="设置" />
      <div className="flex-1 p-6 space-y-6 max-w-4xl">

        {/* Theme */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-primary" />
              主题颜色
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm transition-all ${
                    theme === t.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-primary/40"
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-background"
                    style={{
                      backgroundColor: t.color,
                      outlineColor: theme === t.id ? t.color : "transparent",
                    }}
                  />
                  {t.label}
                  {theme === t.id && <Check className="w-3.5 h-3.5 text-primary ml-1" />}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Subscription */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400" />
              订阅计划
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Usage */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "今日 Agent 任务", used: stats?.agent_tasks_completed_today ?? 0, total: 50, color: "bg-primary" },
                { label: "累计上架商品", used: stats?.total_published ?? 0, total: null, color: "bg-violet-500" },
                { label: "我的选品库", used: stats?.total_products_in_library ?? 0, total: null, color: "bg-emerald-500" },
                { label: "平台商品总量", used: stats?.total_products_in_library ?? 0, total: null, color: "bg-amber-500" },
              ].map(u => (
                <div key={u.label} className="bg-secondary rounded-xl p-3 border border-border">
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-muted-foreground">{u.label}</span>
                    <span className="text-foreground font-medium">
                      {u.total ? `${u.used}/${u.total}` : u.used.toLocaleString()}
                    </span>
                  </div>
                  {u.total && <Progress value={(u.used / u.total) * 100} color={u.color} />}
                </div>
              ))}
            </div>

            {/* Plans */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {plans.map(plan => (
                <div
                  key={plan.name}
                  className={`rounded-xl border p-4 ${plan.current ? "border-primary/50 bg-primary/5 glow" : "border-border bg-secondary"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-foreground">{plan.name}</span>
                    {plan.current && <Badge variant="default" className="text-[9px]">当前</Badge>}
                  </div>
                  <p className="text-lg font-black text-foreground mb-3">{plan.price}<span className="text-xs text-muted-foreground font-normal">{plan.price !== "联系我们" ? "/月" : ""}</span></p>
                  <ul className="space-y-1.5 mb-4">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Check className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {!plan.current && (
                    <Button size="sm" variant={plan.name === "Pro" ? "default" : "outline"} className="w-full text-xs">
                      升级
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              账号信息
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">用户名</label>
              <Input value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">邮箱</label>
              <Input value={email} onChange={e => setEmail(e.target.value)} type="email" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">当前密码（修改密码时填写）</label>
              <Input value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} placeholder="留空则不修改密码" type="password" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">新密码</label>
              <Input value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="留空则不修改密码" type="password" />
            </div>
            <div className="flex items-center gap-3 col-span-full">
              <Button size="sm" onClick={handleSaveProfile} disabled={profileSaving}>
                {profileSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                保存更改
              </Button>
              {profileMsg && (
                <span className={`text-xs ${profileMsg.includes("成功") ? "text-emerald-400" : "text-destructive"}`}>
                  {profileMsg}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* AI 配置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-violet-400" />
              AI 配置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">API Key（中转 Token）</label>
              <Input
                value={aiKey}
                onChange={e => setAiKey(e.target.value)}
                placeholder="sk-of-..."
                type="password"
              />
              <p className="text-[10px] text-muted-foreground">修改后点保存立即生效，无需重启服务</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">接口地址（Base URL）</label>
              <Input
                value={aiUrl}
                onChange={e => setAiUrl(e.target.value)}
                placeholder="https://api.ofox.ai/v1"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">默认模型</label>
              <select
                value={aiModel}
                onChange={e => setAiModel(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {AVAILABLE_MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            {aiError && <p className="text-xs text-destructive">{aiError}</p>}
            <Button onClick={handleSaveAI} disabled={aiSaving} className="gap-2">
              {aiSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : aiSaved ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Key className="w-3.5 h-3.5" />}
              {aiSaved ? "已保存" : "保存 AI 配置"}
            </Button>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              通知设置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Agent 任务完成通知", sub: "每次 Agent 完成任务时邮件提醒", defaultOn: true },
              { label: "每日推品报告", sub: "每天早上推送今日爆款推荐摘要", defaultOn: true },
              { label: "类目异动预警", sub: "关注的类目出现大幅增长时提醒", defaultOn: false },
              { label: "订阅到期提醒", sub: "订阅到期前 7 天邮件提醒", defaultOn: true },
            ].map(n => (
              <div key={n.label} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm text-foreground">{n.label}</p>
                  <p className="text-xs text-muted-foreground">{n.sub}</p>
                </div>
                <div className={`w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${n.defaultOn ? "bg-primary justify-end" : "bg-secondary border border-border justify-start"}`}>
                  <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Shield className="w-4 h-4" />
              危险操作
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button variant="outline" onClick={handleLogout} className="gap-2 border-border text-muted-foreground hover:text-foreground">
              <LogOut className="w-4 h-4" />
              退出登录
            </Button>
            <Button variant="destructive" className="gap-2">
              删除账号
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
