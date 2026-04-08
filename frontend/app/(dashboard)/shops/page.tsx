"use client"
import { useEffect, useState, useRef } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Store, Plus, ExternalLink, Trash2, Loader2,
  CheckCircle2, AlertCircle, Bot, Sparkles, ChevronDown, ChevronUp, X, History,
} from "lucide-react"
import { shopApi, agentApi, type Shop, type AgentTask } from "@/lib/api"
import Link from "next/link"

// ── 简易 Markdown 渲染（支持 ### 标题 + **bold**）────────────────────────────
function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split("\n")
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) {
          return <p key={i} className="font-semibold text-foreground mt-2 first:mt-0">{line.slice(4)}</p>
        }
        if (line.startsWith("**") && line.endsWith("**")) {
          return <p key={i} className="font-medium text-foreground">{line.slice(2, -2)}</p>
        }
        // inline bold: **text**
        const parts = line.split(/(\*\*[^*]+\*\*)/)
        return (
          <p key={i} className="text-muted-foreground leading-relaxed">
            {parts.map((part, j) =>
              part.startsWith("**") && part.endsWith("**")
                ? <strong key={j} className="text-foreground font-medium">{part.slice(2, -2)}</strong>
                : part
            )}
          </p>
        )
      })}
    </div>
  )
}

// ── 任务状态颜色 ──────────────────────────────────────────────────────────────
const taskStatusLabel: Record<string, string> = {
  pending: "排队中", running: "执行中", success: "完成", failed: "失败",
}
const taskTypeLabel: Record<string, string> = {
  store_profile: "店铺诊脉", auto_discovery: "智能推品",
}

// ── 单条任务进度卡 ─────────────────────────────────────────────────────────────
function TaskCard({ task, onDismiss }: { task: AgentTask; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(task.status === "success")

  const output = task.output_data as Record<string, unknown> | null

  return (
    <div className={`rounded-xl border p-3 text-xs space-y-2 ${
      task.status === "success" ? "border-emerald-500/30 bg-emerald-500/5" :
      task.status === "failed"  ? "border-destructive/30 bg-destructive/5" :
      "border-primary/20 bg-primary/5"
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {task.status === "running" || task.status === "pending"
            ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            : task.status === "success"
            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            : <AlertCircle className="w-3.5 h-3.5 text-destructive" />
          }
          <span className="font-medium text-foreground">{taskTypeLabel[task.task_type] ?? task.task_type}</span>
          <span className={`text-[10px] ${task.status === "success" ? "text-emerald-400" : task.status === "failed" ? "text-destructive" : "text-primary"}`}>
            {taskStatusLabel[task.status] ?? task.status}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {output && (
            <button onClick={() => setExpanded(v => !v)} className="text-muted-foreground hover:text-foreground">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
          {(task.status === "success" || task.status === "failed") && (
            <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* progress bar */}
      {(task.status === "running" || task.status === "pending") && (
        <Progress value={task.progress} className="h-1" />
      )}

      {/* error */}
      {task.status === "failed" && task.error_message && (
        <p className="text-destructive">{task.error_message}</p>
      )}

      {/* output */}
      {expanded && output && task.task_type === "store_profile" && (
        <div className="space-y-1.5 pt-1 border-t border-border">
          {output.niche && <p><span className="text-muted-foreground">定位：</span>{String(output.niche)}</p>}
          {output.visual_style && <p><span className="text-muted-foreground">风格：</span>{String(output.visual_style)}</p>}
          {output.profile_summary && <p className="text-muted-foreground leading-relaxed">{String(output.profile_summary)}</p>}
        </div>
      )}
      {expanded && output && task.task_type === "auto_discovery" && (
        <div className="space-y-1.5 pt-1 border-t border-border">
          {output.niche && <p><span className="text-muted-foreground">匹配定位：</span>{String(output.niche)}</p>}
          {Array.isArray(output.products) && (
            <div className="space-y-1">
              <p className="text-muted-foreground">推荐商品 {output.products.length} 件：</p>
              {(output.products as Record<string, unknown>[]).slice(0, 5).map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-primary font-medium">#{i + 1}</span>
                  <Link href={`/products/${p.id}`} className="text-foreground hover:text-primary hover:underline truncate">
                    {String(p.title).slice(0, 60)}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 诊脉历史记录 ──────────────────────────────────────────────────────────────
function DiagnosisHistory({ shopId }: { shopId: number }) {
  const [history, setHistory] = useState<AgentTask[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    agentApi.listShopDiagnosis(shopId)
      .then(res => setHistory(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [shopId])

  const successHistory = history.filter(t => t.status === "success")
  if (loading) return null
  if (successHistory.length === 0) return null

  return (
    <div className="border-t border-border pt-3">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        <History className="w-3.5 h-3.5" />
        <span>诊脉历史 ({successHistory.length} 条)</span>
        {expanded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {successHistory.map(task => {
            const output = task.output_data as Record<string, unknown> | null
            const isOpen = openId === task.id
            const date = new Date(task.created_at).toLocaleString("zh-CN", {
              month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
            })
            return (
              <div key={task.id} className="rounded-lg border border-border bg-secondary/50">
                <button
                  onClick={() => setOpenId(isOpen ? null : task.id)}
                  className="flex items-center justify-between w-full px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="text-foreground">{date}</span>
                    {output?.niche && (
                      <span className="text-muted-foreground">· {String(output.niche)}</span>
                    )}
                  </div>
                  {isOpen ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                </button>
                {isOpen && output?.profile_summary && (
                  <div className="px-3 pb-3 pt-1 border-t border-border text-xs">
                    <SimpleMarkdown text={String(output.profile_summary)} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── 店铺卡片（含任务面板）────────────────────────────────────────────────────────
function ShopCard({ shop, onDelete }: { shop: Shop; onDelete: () => void }) {
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [profileLoading, setProfileLoading] = useState(false)
  const [discoveryLoading, setDiscoveryLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pollTask = (taskId: number) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await agentApi.getTask(taskId)
        const t = res.data!
        setTasks(prev => prev.map(x => x.id === taskId ? t : x))
        if (t.status === "success" || t.status === "failed") {
          clearInterval(pollRef.current!)
          pollRef.current = null
        }
      } catch { clearInterval(pollRef.current!); pollRef.current = null }
    }, 3000)
  }

  const handleProfile = async () => {
    setProfileLoading(true)
    try {
      const res = await agentApi.storeProfile(shop.domain)
      const task = res.data!
      setTasks(prev => [task, ...prev])
      pollTask(task.id)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "启动失败")
    } finally { setProfileLoading(false) }
  }

  const handleDiscovery = async () => {
    setDiscoveryLoading(true)
    try {
      const res = await agentApi.autoDiscovery(shop.id, 10)
      const task = res.data!
      setTasks(prev => [task, ...prev])
      pollTask(task.id)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "启动失败")
    } finally { setDiscoveryLoading(false) }
  }

  // cleanup on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const dismissTask = (id: number) => setTasks(prev => prev.filter(t => t.id !== id))

  return (
    <Card className="card-hover">
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Store className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{shop.name}</p>
              <p className="text-xs text-muted-foreground">{shop.domain}</p>
            </div>
          </div>
          <Badge variant="success" className="text-[10px]">已连接</Badge>
        </div>

        {/* Profile summary */}
        {shop.profile_summary && (
          <div className="p-3 rounded-xl bg-secondary border border-border">
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 mb-1.5">
              <CheckCircle2 className="w-3 h-3" /> AI 店铺画像已生成
              {shop.niche && <span className="ml-1 text-muted-foreground">· {shop.niche}</span>}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{shop.profile_summary}</p>
          </div>
        )}

        {/* Task results */}
        {tasks.length > 0 && (
          <div className="space-y-2">
            {tasks.map(t => <TaskCard key={t.id} task={t} onDismiss={() => dismissTask(t.id)} />)}
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handleProfile} disabled={profileLoading}>
            {profileLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3 text-violet-400" />}
            AI 店铺诊脉
          </Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handleDiscovery} disabled={discoveryLoading}>
            {discoveryLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-amber-400" />}
            智能推品
          </Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5 col-span-2 justify-start"
            onClick={() => window.open(`https://${shop.domain}`, "_blank")}>
            <ExternalLink className="w-3 h-3" /> 访问店铺
          </Button>
        </div>

        {/* Diagnosis History */}
        <DiagnosisHistory shopId={shop.id} />

        {/* Delete */}
        <button
          onClick={onDelete}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="w-3 h-3" /> 解绑店铺
        </button>
      </CardContent>
    </Card>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function ShopsPage() {
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [domain, setDomain] = useState("")
  const [name, setName] = useState("")
  const [token, setToken] = useState("")

  const load = async () => {
    setLoading(true)
    try {
      const res = await shopApi.list()
      setShops(res.data || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败")
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(""); setSaving(true)
    try {
      await shopApi.create({ name, domain, access_token: token })
      setShowAdd(false); setDomain(""); setName(""); setToken("")
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "绑定失败")
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("确认解绑该店铺？")) return
    try {
      await shopApi.delete(id)
      setShops(s => s.filter(x => x.id !== id))
    } catch (err: unknown) { alert(err instanceof Error ? err.message : "操作失败") }
  }

  return (
    <div className="flex flex-col min-h-full">
      <Header title="我的店铺" />
      <div className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">绑定的店铺</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              绑定 Shopify 店铺后即可一键改款上架，并使用 AI 诊脉生成店铺画像
            </p>
          </div>
          <Button className="gap-2" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4" /> 绑定新店铺
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {shops.map(shop => (
              <ShopCard key={shop.id} shop={shop} onDelete={() => handleDelete(shop.id)} />
            ))}
            <Card
              className="border-dashed border-border/50 cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all"
              onClick={() => setShowAdd(true)}
            >
              <CardContent className="p-5 flex flex-col items-center justify-center h-full min-h-[160px] text-muted-foreground hover:text-foreground transition-colors">
                <Plus className="w-8 h-8 mb-2" />
                <p className="text-sm font-medium">绑定新店铺</p>
                <p className="text-xs mt-1">支持 Shopify</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Add Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
            <Card className="w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-primary" /> 绑定 Shopify 店铺
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAdd} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">店铺域名</label>
                    <Input placeholder="yourstore.myshopify.com" value={domain} onChange={e => setDomain(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">店铺名称</label>
                    <Input placeholder="My Shopify Store" value={name} onChange={e => setName(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Admin API Access Token</label>
                    <Input placeholder="shpat_xxxxxxxxxxxxxxxx" value={token} onChange={e => setToken(e.target.value)} required />
                    <p className="text-[10px] text-muted-foreground">在 Shopify 后台 → Apps → 自定义应用 中获取</p>
                  </div>
                  {error && (
                    <div className="flex items-center gap-2 text-xs text-destructive">
                      <AlertCircle className="w-3.5 h-3.5" /> {error}
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <Button type="submit" className="flex-1" disabled={saving}>
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "确认绑定"}
                    </Button>
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAdd(false)}>取消</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
