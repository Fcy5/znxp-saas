"use client"
import { useEffect, useRef, useState } from "react"
import { Header } from "@/components/layout/header"
import { AgentTaskCard } from "@/components/agent/agent-task-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Loader2, Sparkles, Zap, ChevronRight } from "lucide-react"
import { agentApi, type AgentTask } from "@/lib/api"

const agentCapabilities = [
  {
    type: "store_profile",
    icon: "🔍",
    title: "店铺智能诊脉",
    badge: "Phase 1",
    badgeVariant: "success" as const,
    description: "输入 Shopify 店铺网址，Gemini 自动爬取分析首页/分类/商品，生成完整店铺画像：Niche、目标受众、客单价区间、视觉风格。",
    steps: ["爬取店铺页面", "Gemini 多模态分析", "生成店铺画像"],
  },
  {
    type: "auto_discovery",
    icon: "🎯",
    title: "零提示词自动推品",
    badge: "Phase 1",
    badgeVariant: "success" as const,
    description: "基于店铺画像，每日自动从底层商品库（Amazon/Etsy/TikTok）捞取最匹配的 3-5 个爆款候选，无需任何 Prompt。",
    steps: ["读取店铺画像", "向量相似度检索", "趋势评分排序", "推送推荐结果"],
  },
  {
    type: "copywriting",
    icon: "✍️",
    title: "SEO & GEO 双擎文案",
    badge: "Phase 1",
    badgeVariant: "success" as const,
    description: "重构 SEO 优化标题、生成含 Q&A 的结构化 HTML 描述、为每张图片生成富含长尾词的 Alt 标签，同时迎合 AI 搜索引擎。",
    steps: ["抓取竞品文案", "Gemini 文案重构", "生成 Q&A 模块", "Alt 标签批量生成"],
  },
  {
    type: "image_processing",
    icon: "🖼️",
    title: "图片深度处理",
    badge: "Phase 2",
    badgeVariant: "warning" as const,
    description: "自动擦除水印和品牌标识，利用 Google Imagen 将产品融入真实欧美生活场景，生成带折扣角标的广告主图。",
    steps: ["水印识别擦除", "产品抠图", "AI 换背景", "角标合成"],
  },
  {
    type: "video_generation",
    icon: "🎬",
    title: "视频全自动二创",
    badge: "Phase 3",
    badgeVariant: "info" as const,
    description: "从 TikTok/Facebook 抓取爆款视频 → Gemini 智能剪辑高光片段 → Google Veo 画面重绘 → AI 原生配音字幕 → 5-10 个 A/B 变体一键生成。",
    steps: ["视频素材抓取", "智能剪辑", "Veo 画面重绘", "AI 配音+字幕", "批量裂变"],
  },
  {
    type: "publish",
    icon: "🚀",
    title: "一键上架 Shopify",
    badge: "Phase 1",
    badgeVariant: "success" as const,
    description: "数据映射到 Shopify 字段，图片自动 SEO 重命名，通过 GraphQL stagedUploadsCreate 直传媒体库，同步写入 Alt 文本，完成后销毁本地暂存。",
    steps: ["字段映射", "图片 SEO 重命名", "GraphQL 直传", "Alt 数据绑定", "本地文件销毁"],
  },
]

export default function AgentPage() {
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadTasks = async () => {
    try {
      const res = await agentApi.listTasks()
      setTasks(res.data || [])
    } catch { } finally { setLoadingTasks(false) }
  }

  useEffect(() => {
    loadTasks()
  }, [])

  // 有 pending/running 任务时每 3s 轮询
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

  return (
    <div className="flex flex-col min-h-full">
      <Header title="AI Agent 工作台" />
      <div className="flex-1 p-6 space-y-6">

        {/* Hero Banner */}
        <div className="relative rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 via-violet-500/5 to-transparent p-6 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-primary" />
                <span className="text-lg font-bold text-foreground">AI Agent 全自动工作流</span>
                <Badge variant="default" className="text-[10px]">BETA</Badge>
              </div>
              <p className="text-sm text-muted-foreground max-w-lg">
                从"懂你的店" → "跨平台筛选高溢价品" → "图文重构" → "视频二创" → "API 无缝直传上架"，全程 Agent 托管，零人工干预。
              </p>
            </div>
            <Button className="gap-2 shrink-0">
              <Sparkles className="w-4 h-4" />
              一键启动全流程
            </Button>
          </div>
          {/* Progress of full pipeline */}
          <div className="mt-4 flex items-center gap-2">
            {["诊脉", "推品", "文案", "图片", "视频", "上架"].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs border ${i < 2 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : i === 2 ? "bg-primary/10 border-primary/20 text-primary" : "bg-secondary border-border text-muted-foreground"}`}>
                  {i < 2 ? "✓" : i === 2 ? "●" : "○"} {step}
                </div>
                {i < 5 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
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
              {agentCapabilities.map((cap) => (
                <Card key={cap.type} className="card-hover group cursor-pointer">
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
                    <div className="flex flex-wrap gap-1 mb-3">
                      {cap.steps.map((s, i) => (
                        <div key={s} className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">{i + 1}. {s}</span>
                          {i < cap.steps.length - 1 && <span className="text-[10px] text-muted-foreground/40">→</span>}
                        </div>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" className="w-full text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                      启动此 Agent
                    </Button>
                  </CardContent>
                </Card>
              ))}
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
                  暂无任务记录，去店铺管理页启动 AI 诊脉
                </div>
              ) : (
                tasks.slice(0, 10).map(task => (
                  <AgentTaskCard key={task.id} task={task} />
                ))
              )}
            </div>

            {/* Stats from real tasks */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xs">任务统计</CardTitle>
              </CardHeader>
              <CardContent className="pt-2 space-y-3">
                {(() => {
                  const total = tasks.length || 1
                  const success = tasks.filter(t => t.status === "success").length
                  const running = tasks.filter(t => t.status === "running" || t.status === "pending").length
                  const failed = tasks.filter(t => t.status === "failed").length
                  return [
                    { label: "累计任务", value: tasks.length, total: Math.max(tasks.length, 1), color: "bg-primary" },
                    { label: "成功完成", value: success, total: Math.max(tasks.length, 1), color: "bg-emerald-500" },
                    { label: "进行中", value: running, total: Math.max(tasks.length, 1), color: "bg-amber-500" },
                    { label: "失败", value: failed, total: Math.max(tasks.length, 1), color: "bg-red-500" },
                  ].map(s => (
                    <div key={s.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{s.label}</span>
                        <span className="text-foreground font-medium">{s.value}</span>
                      </div>
                      <Progress value={(s.value / s.total) * 100} color={s.color} />
                    </div>
                  ))
                })()}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
