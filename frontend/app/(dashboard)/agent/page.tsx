"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/layout/header"
import { AgentTaskCard } from "@/components/agent/agent-task-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Loader2, Sparkles, Zap, ChevronRight, X } from "lucide-react"
import { agentApi, shopApi, type AgentTask, type Shop } from "@/lib/api"

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
      } else if (type === "batch_copywriting") {
        task = (await agentApi.batchCopywriting(shop.id, 10)).data!
      }
      if (task) setTasks(prev => [task!, ...prev])
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

      {/* 店铺选择弹窗 */}
      {modalType && modalType !== "workflow" && (
        <ShopSelectModal
          title={
            modalType === "store_profile" ? "选择要诊脉的店铺" :
            modalType === "auto_discovery" ? "选择要推品的店铺" :
            "选择要生成文案的店铺"
          }
          onSelect={(shop) => handleLaunch(modalType, shop)}
          onClose={() => setModalType(null)}
        />
      )}

      {/* 一键启动工作流弹窗 */}
      {modalType === "workflow" && (
        <ShopSelectModal
          title="选择店铺，启动完整工作流"
          onSelect={async (shop) => {
            setModalType(null)
            setLaunching("workflow")
            try {
              const t1 = (await agentApi.storeProfile(shop.domain)).data!
              const t2 = (await agentApi.autoDiscovery(shop.id, 10)).data!
              const t3 = (await agentApi.batchCopywriting(shop.id, 10)).data!
              setTasks(prev => [t3, t2, t1, ...prev])
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
