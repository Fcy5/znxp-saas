"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/layout/header"
import { AgentTaskCard } from "@/components/agent/agent-task-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Loader2, Sparkles, Zap, ChevronRight, X, Search, Check } from "lucide-react"
import { Input } from "@/components/ui/input"
import { agentApi, shopApi, productApi, type AgentTask, type Shop, type ProductCard } from "@/lib/api"

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
    badge: "开发中",
    badgeVariant: "warning" as const,
    status: "wip" as const,
    description: "自动擦除水印和品牌标识，利用 Google Imagen 将产品融入真实欧美生活场景，生成带折扣角标的广告主图。",
    steps: ["水印识别擦除", "产品抠图", "AI 换背景", "角标合成"],
  },
  {
    type: "video_generation",
    icon: "🎬",
    title: "视频全自动二创",
    badge: "开发中",
    badgeVariant: "warning" as const,
    status: "wip" as const,
    description: "从 TikTok/Facebook 抓取爆款视频 → Gemini 智能剪辑 → Google Veo 画面重绘 → AI 配音字幕 → 批量变体。",
    steps: ["视频素材抓取", "智能剪辑", "Veo 画面重绘", "AI 配音+字幕", "批量裂变"],
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

// 已上线能力的顺序（工作流步骤）
const WORKFLOW_STEPS = ["诊脉", "推品", "文案", "图片", "视频", "上架"]
const WORKFLOW_LIVE = [true, true, true, false, false, true]

// ── 店铺选择弹窗 ──────────────────────────────────────────────────────────────
function ShopSelectModal({
  title,
  onSelect,
  onClose,
}: {
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
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm">🏪</div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{shop.name}</p>
                    <p className="text-xs text-muted-foreground">{shop.domain}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── 选品弹窗（批量文案用）────────────────────────────────────────────────────
function ProductPickerModal({ onConfirm, onClose }: {
  onConfirm: (productIds: number[], shopId?: number) => void
  onClose: () => void
}) {
  const [products, setProducts] = useState<ProductCard[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState("")
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [shops, setShops] = useState<Shop[]>([])
  const [shopId, setShopId] = useState<number | undefined>()

  useEffect(() => {
    shopApi.list().then(r => { setShops(r.data || []); if (r.data?.[0]) setShopId(r.data[0].id) })
  }, [])

  useEffect(() => {
    setLoading(true)
    productApi.myLibrary(1, 50, keyword || undefined)
      .then(r => setProducts(r.data || []))
      .finally(() => setLoading(false))
  }, [keyword])

  const toggle = (id: number) => setSelected(prev => {
    const s = new Set(prev)
    s.has(id) ? s.delete(id) : s.add(id)
    return s
  })
  const toggleAll = () => {
    if (selected.size === products.length) setSelected(new Set())
    else setSelected(new Set(products.map(p => p.id)))
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <Card className="w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <CardHeader className="shrink-0 pb-3">
          <CardTitle className="flex items-center justify-between text-sm">
            选择要生成文案的商品
            <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
          </CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-xs"
              placeholder="搜索商品标题..."
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
            />
          </div>
        </CardHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-1.5">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> 加载中...
            </div>
          ) : products.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">选品库为空，请先去「选品大厅」加入商品</p>
          ) : (
            <>
              <button onClick={toggleAll} className="text-xs text-primary hover:underline mb-1">
                {selected.size === products.length ? "取消全选" : `全选 (${products.length})`}
              </button>
              {products.map(p => (
                <div
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                    selected.has(p.id) ? "border-primary/50 bg-primary/5" : "border-border hover:border-border/80 hover:bg-secondary/50"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    selected.has(p.id) ? "bg-primary border-primary" : "border-muted-foreground"
                  }`}>
                    {selected.has(p.id) && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  {p.main_image && (
                    <img src={p.main_image} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{p.title}</p>
                    <p className="text-[10px] text-muted-foreground">{p.category} · ${p.price ?? "—"}</p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="shrink-0 px-4 pb-4 pt-3 border-t border-border space-y-3">
          {shops.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">参考店铺风格：</span>
              <select
                className="flex-1 text-xs bg-secondary border border-border rounded px-2 py-1 text-foreground"
                value={shopId ?? ""}
                onChange={e => setShopId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">不指定</option>
                {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>取消</Button>
            <Button
              size="sm" className="flex-1"
              disabled={selected.size === 0}
              onClick={() => onConfirm(Array.from(selected), shopId)}
            >
              生成文案（{selected.size} 件）
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default function AgentPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [modalType, setModalType] = useState<string | null>(null)
  const [launching, setLaunching] = useState<string | null>(null)
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

  const handleLaunch = async (type: string, shop: Shop) => {
    setModalType(null)
    setLaunching(type)
    try {
      let task: AgentTask | undefined
      if (type === "store_profile") {
        task = (await agentApi.storeProfile(shop.domain)).data!
      } else if (type === "auto_discovery") {
        task = (await agentApi.autoDiscovery(shop.id, 10)).data!
      }
      if (task) setTasks(prev => [task!, ...prev])
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "启动失败")
    } finally { setLaunching(null) }
  }

  const handleLaunchCopy = async (productIds: number[], shopId?: number) => {
    setModalType(null)
    setLaunching("batch_copywriting")
    try {
      const task = (await agentApi.batchCopywriting(productIds, shopId)).data!
      setTasks(prev => [task, ...prev])
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "启动失败")
    } finally { setLaunching(null) }
  }

  const handleCapabilityClick = (type: string, status: string) => {
    if (status === "wip") return
    if (type === "publish") { router.push("/library"); return }
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
            <Button className="gap-2 shrink-0" onClick={() => setModalType("workflow")}>
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
                const isWip = cap.status === "wip"
                const isLaunching = launching === cap.type
                return (
                  <Card
                    key={cap.type}
                    className={`group ${isWip ? "opacity-60" : "card-hover cursor-pointer"}`}
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
                        {isWip && (
                          <span className="text-[10px] text-amber-400 border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 rounded-full">
                            开发中
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-3">{cap.description}</p>
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
                        className={`w-full text-xs transition-opacity ${isWip ? "opacity-40 cursor-not-allowed" : "opacity-0 group-hover:opacity-100"}`}
                        disabled={isWip || isLaunching}
                        onClick={() => handleCapabilityClick(cap.type, cap.status)}
                      >
                        {isLaunching ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                        {isWip ? "开发中，敬请期待" : "启动此 Agent"}
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
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> 加载中...
                </div>
              ) : tasks.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4 text-center">
                  暂无任务记录
                </div>
              ) : (
                tasks.slice(0, 10).map(task => (
                  <AgentTaskCard key={task.id} task={task} />
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

      {/* 店铺选择弹窗（诊脉/推品） */}
      {modalType && modalType !== "workflow" && modalType !== "batch_copywriting" && (
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

      {/* 一键启动工作流 */}
      {modalType === "workflow" && (
        <ShopSelectModal
          title="选择店铺，启动完整工作流"
          onSelect={async (shop) => {
            setModalType(null)
            setLaunching("workflow")
            try {
              const t1 = (await agentApi.storeProfile(shop.domain)).data!
              const t2 = (await agentApi.autoDiscovery(shop.id, 10)).data!
              setTasks(prev => [t2, t1, ...prev])
            } catch (e: unknown) {
              alert(e instanceof Error ? e.message : "启动失败")
            } finally { setLaunching(null) }
          }}
          onClose={() => setModalType(null)}
        />
      )}
    </div>
  )
}
