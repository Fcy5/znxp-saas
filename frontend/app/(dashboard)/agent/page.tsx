"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/layout/header"
import { AgentTaskCard } from "@/components/agent/agent-task-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Loader2, Sparkles, Zap, ChevronRight, X, Search, Check, ArrowRight, CheckCircle2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { agentApi, shopApi, productApi, type AgentTask, type Shop, type ProductCard, VIDEO_MODELS } from "@/lib/api"

const agentCapabilities = [
  {
    type: "store_profile",
    icon: "🔍",
    title: "店铺智能诊脉",
    badge: "已上线",
    badgeVariant: "success" as const,
    status: "live" as const,
    description: "爬取 Shopify 店铺真实页面，Gemini 生成 CRO 诊断报告：Niche、目标受众、转化问题、改版方案。",
    steps: ["爬取店铺页面", "Gemini 多模态分析", "生成 CRO 诊断报告"],
  },
  {
    type: "auto_discovery",
    icon: "🎯",
    title: "零提示词自动推品",
    badge: "已上线",
    badgeVariant: "success" as const,
    status: "live" as const,
    description: "基于店铺画像，从商品库（Amazon/Etsy/TikTok/Google）捞取最匹配的爆款候选，无需任何 Prompt。",
    steps: ["读取店铺画像", "向量相似度检索", "趋势评分排序", "推送推荐结果"],
  },
  {
    type: "batch_copywriting",
    icon: "✍️",
    title: "SEO & GEO 双擎文案",
    badge: "已上线",
    badgeVariant: "success" as const,
    status: "live" as const,
    description: "批量为选品库商品生成 SEO 标题、Meta 描述、HTML 详情页（含 Q&A 结构化内容），迎合 AI 搜索引擎。",
    steps: ["读取选品库", "AI 文案重构", "Q&A 模块生成", "Alt 标签批量生成"],
  },
  {
    type: "image_processing",
    icon: "🖼️",
    title: "图片深度处理",
    badge: "已上线",
    badgeVariant: "success" as const,
    status: "live" as const,
    description: "调用 GPT-Image 2 自动擦除水印和品牌标识，将产品融入欧美生活场景，生成带折扣角标的广告主图。",
    steps: ["水印识别擦除", "产品抠图", "AI 换背景", "角标合成"],
  },
  {
    type: "video_generation",
    icon: "🎬",
    title: "AI 视频生成",
    badge: "已上线",
    badgeVariant: "success" as const,
    status: "live" as const,
    description: "基于商品主图，调用火山引擎 Seedance 生成 5-10 秒商品展示视频，720p，无水印，适合社媒素材。",
    steps: ["读取商品主图", "Seedance 图生视频", "下载存储", "返回可播放链接"],
  },
  {
    type: "publish",
    icon: "🚀",
    title: "一键上架 Shopify",
    badge: "已上线",
    badgeVariant: "success" as const,
    status: "live" as const,
    description: "字段映射到 Shopify，图片 SEO 重命名，GraphQL stagedUploadsCreate 直传媒体库，同步写入 Alt 文本。",
    steps: ["字段映射", "图片 SEO 重命名", "GraphQL 直传", "Alt 数据绑定"],
  },
]

const WORKFLOW_STEPS = ["诊脉", "推品", "文案", "图片", "视频", "上架"]
const WORKFLOW_LIVE = [true, true, true, true, true, true]

// ── 店铺选择弹窗 ──────────────────────────────────────────────────────────────
function ShopSelectModal({ title, onSelect, onClose }: {
  title: string
  onSelect: (shop: Shop) => void
  onClose: () => void
}) {
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    shopApi.list().then(r => setShops(r.data || [])).finally(() => setLoading(false))
  }, [])

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <Card className="w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            {title}
            <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> 加载店铺...
            </div>
          ) : shops.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">暂无绑定店铺，请先去「我的店铺」绑定</p>
          ) : (
            <div className="space-y-2">
              {shops.map(shop => (
                <button
                  key={shop.id}
                  onClick={() => onSelect(shop)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all"
                >
                  <p className="text-sm font-medium text-foreground">{shop.name}</p>
                  <p className="text-xs text-muted-foreground">{shop.domain}</p>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── 选品弹窗（批量文案 / 单选视频用）────────────────────────────────────────
function ProductPickerModal({ onConfirm, onClose, title = "选择要生成文案的商品", singleSelect = false, shopId: defaultShopId }: {
  onConfirm: (productIds: number[], shopId?: number) => void
  onClose: () => void
  title?: string
  singleSelect?: boolean
  shopId?: number
}) {
  const [products, setProducts] = useState<ProductCard[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState("")
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [shops, setShops] = useState<Shop[]>([])
  const [shopId, setShopId] = useState<number | undefined>(defaultShopId)

  useEffect(() => {
    shopApi.list().then(r => {
      setShops(r.data || [])
      if (!defaultShopId && r.data?.[0]) setShopId(r.data[0].id)
    })
  }, [defaultShopId])

  useEffect(() => {
    setLoading(true)
    productApi.myLibrary(1, 50, keyword || undefined, shopId)
      .then(r => setProducts(r.data || []))
      .finally(() => setLoading(false))
  }, [keyword, shopId])

  const toggle = (id: number) => {
    if (singleSelect) { onConfirm([id], shopId); return }
    setSelected(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }
  const toggleAll = () => {
    if (selected.size === products.length) setSelected(new Set())
    else setSelected(new Set(products.map(p => p.id)))
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <Card className="w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <CardHeader className="shrink-0 pb-3">
          <CardTitle className="flex items-center justify-between text-sm">
            {title}
            <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
          </CardTitle>
          <div className="flex gap-2 mt-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 text-xs" placeholder="搜索商品标题..." value={keyword} onChange={e => setKeyword(e.target.value)} />
            </div>
            {shops.length > 0 && (
              <select
                className="text-xs bg-secondary border border-border rounded-lg px-2 py-1 text-foreground h-8"
                value={shopId ?? ""}
                onChange={e => setShopId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">全部</option>
                {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
        </CardHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-1.5">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> 加载中...
            </div>
          ) : products.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">选品库为空，请先去「选品大厅」加入商品或通过 AI 推品</p>
          ) : (
            <>
              {!singleSelect && (
                <button onClick={toggleAll} className="text-xs text-primary hover:underline mb-1">
                  {selected.size === products.length ? "取消全选" : `全选 (${products.length})`}
                </button>
              )}
              {products.map(p => (
                <div
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                    selected.has(p.id) ? "border-primary/50 bg-primary/5" : "border-border hover:border-border/80 hover:bg-secondary/50"
                  }`}
                >
                  {!singleSelect && (
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      selected.has(p.id) ? "bg-primary border-primary" : "border-muted-foreground"
                    }`}>
                      {selected.has(p.id) && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                  )}
                  {p.main_image && <img src={p.main_image} alt="" className="w-10 h-10 rounded object-cover shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{p.title}</p>
                    <p className="text-[10px] text-muted-foreground">{p.category} · ${p.price ?? "—"}</p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {!singleSelect && (
          <div className="shrink-0 px-4 pb-4 pt-3 border-t border-border flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>取消</Button>
            <Button size="sm" className="flex-1" disabled={selected.size === 0} onClick={() => onConfirm(Array.from(selected), shopId)}>
              生成文案（{selected.size} 件）
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}

// ── 完整工作流向导（多步确认）────────────────────────────────────────────────
type WizardPhase =
  | "shop_select"
  | "profile_running"
  | "profile_done"
  | "discovery_running"
  | "discovery_confirm"

interface DiscoveredProduct {
  id: number
  title: string
  category: string
  price: number | null
  platform: string
  rec_reason: string
}

function WorkflowWizard({ onClose, onTaskCreated }: {
  onClose: () => void
  onTaskCreated: (task: AgentTask) => void
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<WizardPhase>("shop_select")
  const [shop, setShop] = useState<Shop | null>(null)
  const [profileTask, setProfileTask] = useState<AgentTask | null>(null)
  const [discoveryTask, setDiscoveryTask] = useState<AgentTask | null>(null)
  const [discoveryProducts, setDiscoveryProducts] = useState<DiscoveredProduct[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  useEffect(() => () => stopPoll(), [])

  const pollUntilDone = (taskId: number, onDone: (t: AgentTask) => void) => {
    stopPoll()
    pollRef.current = setInterval(async () => {
      try {
        const res = await agentApi.getTask(taskId)
        const t = res.data!
        if (t.status === "success") { stopPoll(); onDone(t) }
        else if (t.status === "failed") {
          stopPoll()
          setError(t.error_message || "任务失败，请重试")
        }
      } catch {}
    }, 2000)
  }

  const startProfile = async (selectedShop: Shop) => {
    setShop(selectedShop)
    setError(null)
    setPhase("profile_running")
    try {
      const res = await agentApi.storeProfile(selectedShop.domain)
      const task = res.data!
      setProfileTask(task)
      onTaskCreated(task)
      pollUntilDone(task.id, doneTask => {
        setProfileTask(doneTask)
        setPhase("profile_done")
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "诊脉启动失败")
      setPhase("shop_select")
    }
  }

  const startDiscovery = async () => {
    if (!shop) return
    setError(null)
    setPhase("discovery_running")
    try {
      const res = await agentApi.autoDiscovery(shop.id, 12)
      const task = res.data!
      setDiscoveryTask(task)
      onTaskCreated(task)
      pollUntilDone(task.id, doneTask => {
        setDiscoveryTask(doneTask)
        const output = doneTask.output_data as { products?: DiscoveredProduct[] } | null
        const products = Array.isArray(output?.products) ? output!.products : []
        setDiscoveryProducts(products)
        setSelected(new Set(products.map(p => p.id)))
        setPhase("discovery_confirm")
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "推品启动失败")
      setPhase("profile_done")
    }
  }

  const confirmAndNavigate = async () => {
    if (!shop || selected.size === 0) return
    setConfirming(true)
    try {
      await agentApi.confirmDiscovery(Array.from(selected), shop.id)
      onClose()
      router.push(`/library?shop_id=${shop.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "确认失败，请重试")
    } finally {
      setConfirming(false)
    }
  }

  const toggleProduct = (id: number) => {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const profileOutput = profileTask?.output_data as { niche?: string; profile_summary?: string } | null
  const stepLabels: Record<WizardPhase, string> = {
    shop_select: "选择店铺",
    profile_running: "诊脉中…",
    profile_done: "确认诊脉结果",
    discovery_running: "推品中…",
    discovery_confirm: "确认推品结果",
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Wizard Header */}
        <CardHeader className="shrink-0 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                AI 全自动工作流
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{stepLabels[phase]}</p>
            </div>
            <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
          {/* Step progress */}
          <div className="flex items-center gap-1.5 mt-3">
            {(["shop_select", "profile_running", "profile_done", "discovery_running", "discovery_confirm"] as WizardPhase[]).map((p, i) => (
              <div key={p} className="flex items-center gap-1.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                  phase === p ? "bg-primary text-white" :
                  (["shop_select", "profile_running", "profile_done", "discovery_running", "discovery_confirm"] as WizardPhase[]).indexOf(phase) > i
                    ? "bg-emerald-500 text-white" : "bg-secondary text-muted-foreground"
                }`}>{i + 1}</div>
                {i < 4 && <div className={`h-px w-6 ${
                  (["shop_select", "profile_running", "profile_done", "discovery_running", "discovery_confirm"] as WizardPhase[]).indexOf(phase) > i
                    ? "bg-emerald-500" : "bg-border"
                }`} />}
              </div>
            ))}
          </div>
        </CardHeader>

        {/* Wizard Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* Error */}
          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Step 1: Shop Select */}
          {phase === "shop_select" && (
            <ShopSelectModal
              title="选择要运行工作流的店铺"
              onSelect={startProfile}
              onClose={onClose}
            />
          )}

          {/* Step 2: Profile Running */}
          {phase === "profile_running" && (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">正在诊脉「{shop?.name}」</p>
                <p className="text-xs text-muted-foreground mt-1">爬取店铺首页，AI 分析 Niche 和转化问题…</p>
              </div>
              {profileTask && (
                <div className="w-full max-w-xs">
                  <Progress value={profileTask.progress} />
                </div>
              )}
            </div>
          )}

          {/* Step 3: Profile Done — Confirm */}
          {phase === "profile_done" && profileOutput && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-medium">诊脉完成</span>
              </div>
              {profileOutput.niche && (
                <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-1">店铺 Niche</p>
                  <p className="text-sm font-medium text-foreground">{profileOutput.niche}</p>
                </div>
              )}
              {profileOutput.profile_summary && (
                <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-1">诊断摘要</p>
                  <p className="text-xs text-foreground leading-relaxed line-clamp-5">{profileOutput.profile_summary}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">AI 已分析完店铺画像，下一步将基于 Niche「{profileOutput.niche}」为你推荐最匹配的商品。</p>
            </div>
          )}

          {/* Step 4: Discovery Running */}
          {phase === "discovery_running" && (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">正在推品…</p>
                <p className="text-xs text-muted-foreground mt-1">从 Amazon / Etsy / TikTok / Google 筛选最匹配商品</p>
              </div>
              {discoveryTask && (
                <div className="w-full max-w-xs">
                  <Progress value={discoveryTask.progress} />
                </div>
              )}
            </div>
          )}

          {/* Step 5: Discovery Confirm */}
          {phase === "discovery_confirm" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm font-medium">推品完成，共推荐 {discoveryProducts.length} 件</span>
                </div>
                <button
                  onClick={() => {
                    if (selected.size === discoveryProducts.length) setSelected(new Set())
                    else setSelected(new Set(discoveryProducts.map(p => p.id)))
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  {selected.size === discoveryProducts.length ? "取消全选" : "全选"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">勾选要加入「{shop?.name}」选品库的商品，确认后自动跳转到该店铺的选品库。</p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {discoveryProducts.map(p => (
                  <div
                    key={p.id}
                    onClick={() => toggleProduct(p.id)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                      selected.has(p.id) ? "border-primary/50 bg-primary/5" : "border-border hover:bg-secondary/50"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      selected.has(p.id) ? "bg-primary border-primary" : "border-muted-foreground"
                    }`}>
                      {selected.has(p.id) && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{p.title}</p>
                      <p className="text-[10px] text-muted-foreground">{p.category} · {p.platform} · {p.rec_reason?.slice(0, 40)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-border flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
            取消
          </Button>
          <div className="flex gap-2">
            {phase === "profile_done" && (
              <Button onClick={startDiscovery} className="gap-2">
                确认，开始推品
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
            {phase === "discovery_confirm" && (
              <Button onClick={confirmAndNavigate} disabled={selected.size === 0 || confirming} className="gap-2">
                {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                加入选品库并查看（{selected.size} 件）
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function AgentPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [modalType, setModalType] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [launching, setLaunching] = useState<string | null>(null)
  const [videoModel, setVideoModel] = useState(VIDEO_MODELS[0].value)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadTasks = async () => {
    try {
      const res = await agentApi.listTasks()
      setTasks(res.data || [])
    } catch { } finally { setLoadingTasks(false) }
  }

  useEffect(() => { loadTasks() }, [])

  useEffect(() => {
    const hasActive = tasks.some(t => t.status === "pending" || t.status === "running")
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(loadTasks, 3000)
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [tasks])

  // Add new task to top of list (from wizard or individual launch)
  const handleTaskCreated = (task: AgentTask) => {
    setTasks(prev => {
      const exists = prev.find(t => t.id === task.id)
      if (exists) return prev.map(t => t.id === task.id ? task : t)
      return [task, ...prev]
    })
  }

  const handleLaunch = async (type: string, shop: Shop) => {
    setModalType(null)
    setLaunching(type)
    try {
      let task: AgentTask | undefined
      if (type === "store_profile") {
        task = (await agentApi.storeProfile(shop.domain)).data!
      } else if (type === "auto_discovery") {
        task = (await agentApi.autoDiscovery(shop.id, 12)).data!
      }
      if (task) handleTaskCreated(task)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "启动失败")
    } finally { setLaunching(null) }
  }

  const handleLaunchCopy = async (productIds: number[], shopId?: number) => {
    setModalType(null)
    setLaunching("batch_copywriting")
    try {
      const task = (await agentApi.batchCopywriting(productIds, shopId)).data!
      handleTaskCreated(task)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "启动失败")
    } finally { setLaunching(null) }
  }

  const handleLaunchVideo = async (productId: number) => {
    setModalType(null)
    setLaunching("video_generation")
    try {
      const task = (await agentApi.videoGeneration(productId, 5, "720p", videoModel)).data!
      handleTaskCreated(task)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "启动失败，请确认已配置视频模型 API Key")
    } finally { setLaunching(null) }
  }

  const handleCapabilityClick = (type: string, status: string) => {
    if ((status as string) === "wip") return
    if (type === "publish" || type === "image_processing") { router.push("/library"); return }
    setModalType(type)
  }

  return (
    <div className="flex flex-col min-h-full">
      <Header title="AI Agent 工作台" />
      <div className="flex-1 p-6 space-y-6">

        {/* Hero Banner */}
        <div className="relative rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 via-violet-500/5 to-transparent p-6 overflow-hidden">
          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-primary" />
                <span className="text-lg font-bold text-foreground">AI Agent 全自动工作流</span>
                <Badge variant="default" className="text-[10px]">BETA</Badge>
              </div>
              <p className="text-sm text-muted-foreground max-w-lg">
                从"懂你的店" → "跨平台筛选高溢价品" → "文案重构" → "图文处理" → "视频二创" → "API 直传上架"，全程 Agent 托管。
              </p>
            </div>
            <Button className="gap-2 shrink-0" onClick={() => setShowWizard(true)}>
              <Sparkles className="w-4 h-4" />
              一键启动工作流
            </Button>
          </div>
          {/* Pipeline status */}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            {WORKFLOW_STEPS.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs border ${
                  WORKFLOW_LIVE[i]
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                }`}>
                  {WORKFLOW_LIVE[i] ? "✓" : "⚙"} {step}
                </div>
                {i < WORKFLOW_STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Capabilities */}
          <div className="lg:col-span-2">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Agent 能力矩阵
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {agentCapabilities.map((cap) => {
                const isWip = (cap.status as string) === "wip"
                const isLaunching = launching === cap.type
                return (
                  <Card
                    key={cap.type}
                    className={`group ${isWip ? "opacity-60" : "card-hover cursor-pointer"}`}
                    onClick={() => !isWip && !isLaunching && handleCapabilityClick(cap.type, cap.status)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{cap.icon}</span>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{cap.title}</p>
                            <Badge variant={cap.badgeVariant} className="text-[9px] mt-0.5">{cap.badge}</Badge>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-3">{cap.description}</p>
                      {cap.type === "video_generation" && (
                        <select
                          className="w-full text-xs bg-secondary border border-border rounded px-2 py-1 text-foreground mb-2"
                          value={videoModel}
                          onChange={e => { e.stopPropagation(); setVideoModel(e.target.value) }}
                          onClick={e => e.stopPropagation()}
                        >
                          {VIDEO_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      )}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {cap.steps.map((s, i) => (
                          <div key={s} className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">{i + 1}. {s}</span>
                            {i < cap.steps.length - 1 && <span className="text-[10px] text-muted-foreground/40">→</span>}
                          </div>
                        ))}
                      </div>
                      <Button
                        size="sm" variant="outline"
                        className="w-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        disabled={isWip || isLaunching}
                        onClick={(e) => { e.stopPropagation(); handleCapabilityClick(cap.type, cap.status) }}
                      >
                        {isLaunching ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                        启动此 Agent
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* Task Queue */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              任务队列
            </h2>
            <div className="space-y-2">
              {loadingTasks ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> 加载任务...
                </div>
              ) : tasks.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4">暂无任务记录</p>
              ) : (
                tasks.slice(0, 10).map(task => (
                  <AgentTaskCard
                    key={task.id}
                    task={task}
                    onConfirmDiscovery={async (productIds, shopId) => {
                      await agentApi.confirmDiscovery(productIds, shopId)
                      router.push(`/library${shopId ? `?shop_id=${shopId}` : ""}`)
                    }}
                  />
                ))
              )}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-xs">任务统计</CardTitle>
              </CardHeader>
              <CardContent className="pt-2 space-y-3">
                {(() => {
                  const success = tasks.filter(t => t.status === "success").length
                  const running = tasks.filter(t => t.status === "running" || t.status === "pending").length
                  const failed = tasks.filter(t => t.status === "failed").length
                  const total = Math.max(tasks.length, 1)
                  return [
                    { label: "累计任务", value: tasks.length, color: "bg-primary" },
                    { label: "成功完成", value: success, color: "bg-emerald-500" },
                    { label: "进行中", value: running, color: "bg-amber-500" },
                    { label: "失败", value: failed, color: "bg-red-500" },
                  ].map(s => (
                    <div key={s.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{s.label}</span>
                        <span className="text-foreground font-medium">{s.value}</span>
                      </div>
                      <Progress value={(s.value / total) * 100} color={s.color} />
                    </div>
                  ))
                })()}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* 店铺选择弹窗（诊脉/推品单独启动） */}
      {modalType && !["batch_copywriting", "video_generation"].includes(modalType) && (
        <ShopSelectModal
          title={modalType === "store_profile" ? "选择要诊脉的店铺" : "选择要推品的店铺"}
          onSelect={(shop) => handleLaunch(modalType, shop)}
          onClose={() => setModalType(null)}
        />
      )}

      {/* 选品弹窗（批量文案） */}
      {modalType === "batch_copywriting" && (
        <ProductPickerModal
          onConfirm={handleLaunchCopy}
          onClose={() => setModalType(null)}
        />
      )}

      {/* 选品弹窗（视频生成，单选） */}
      {modalType === "video_generation" && (
        <ProductPickerModal
          title="选择商品生成视频（点击即启动）"
          singleSelect
          onConfirm={(ids) => { if (ids[0]) handleLaunchVideo(ids[0]) }}
          onClose={() => setModalType(null)}
        />
      )}

      {/* 完整工作流向导 */}
      {showWizard && (
        <WorkflowWizard
          onClose={() => setShowWizard(false)}
          onTaskCreated={handleTaskCreated}
        />
      )}
    </div>
  )
}
