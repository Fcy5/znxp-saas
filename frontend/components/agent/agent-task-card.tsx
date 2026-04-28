"use client"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { CheckCircle2, XCircle, Clock, Loader2, ChevronDown, ChevronUp, ExternalLink, Check } from "lucide-react"
import Link from "next/link"
import type { AgentTask } from "@/lib/api"

const taskMeta: Record<string, { label: string; icon: string }> = {
  store_profile:     { label: "店铺智能诊脉",      icon: "🔍" },
  auto_discovery:    { label: "零提示词自动推品",   icon: "🎯" },
  batch_copywriting: { label: "SEO & GEO 批量文案", icon: "✍️" },
  copywriting:       { label: "SEO & GEO 文案重构", icon: "✍️" },
  image_processing:  { label: "图片深度处理",      icon: "🖼️" },
  video_generation:  { label: "AI 视频生成",       icon: "🎬" },
  publish:           { label: "上架到 Shopify",    icon: "🚀" },
}

const statusConfig = {
  pending:   { variant: "outline" as const,  icon: Clock,        color: "text-muted-foreground", label: "等待中" },
  running:   { variant: "default" as const,  icon: Loader2,      color: "text-primary",          label: "运行中" },
  success:   { variant: "success" as const,  icon: CheckCircle2, color: "text-emerald-400",       label: "已完成" },
  failed:    { variant: "danger" as const,   icon: XCircle,      color: "text-red-400",           label: "失败"   },
  cancelled: { variant: "outline" as const,  icon: XCircle,      color: "text-muted-foreground", label: "已取消" },
}

interface DiscoveredProduct {
  id: number
  title: string
  category: string
  platform: string
  rec_reason: string
}

export function AgentTaskCard({
  task,
  onConfirmDiscovery,
}: {
  task: AgentTask
  onConfirmDiscovery?: (productIds: number[], shopId?: number) => Promise<void>
}) {
  const meta = taskMeta[task.task_type] ?? { label: task.task_type, icon: "⚙️" }
  const status = statusConfig[task.status as keyof typeof statusConfig] ?? statusConfig.pending
  const StatusIcon = status.icon
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<Set<number> | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const output = task.output_data as Record<string, unknown> | null
  const hasOutput = task.status === "success" && output

  // Initialize selection when discovery output is available
  const discoveryProducts: DiscoveredProduct[] = (
    task.task_type === "auto_discovery" && Array.isArray(output?.products)
      ? (output!.products as DiscoveredProduct[])
      : []
  )

  const getSelected = (): Set<number> => {
    if (selected !== null) return selected
    return new Set(discoveryProducts.map(p => p.id))
  }

  const toggleProduct = (id: number) => {
    const s = new Set(getSelected())
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }

  const handleConfirm = async () => {
    if (!onConfirmDiscovery || confirming || confirmed) return
    const ids = Array.from(getSelected())
    if (ids.length === 0) return
    setConfirming(true)
    try {
      await onConfirmDiscovery(ids, task.shop_id ?? undefined)
      setConfirmed(true)
    } catch {
      // error handled by parent
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-4 px-4 py-3.5">
        <div className="text-2xl w-10 text-center shrink-0">{meta.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-foreground">{meta.label}</span>
            <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
          </div>
          {task.status === "running" && (
            <div className="flex items-center gap-2">
              <Progress value={task.progress} className="flex-1" />
              <span className="text-xs text-muted-foreground shrink-0">{task.progress}%</span>
            </div>
          )}
          {task.error_message && (
            <p className="text-xs text-red-400 mt-1 truncate">{task.error_message}</p>
          )}
          {task.status !== "running" && (
            <p className="text-xs text-muted-foreground">{task.created_at}</p>
          )}
        </div>
        {hasOutput ? (
          <button onClick={() => setExpanded(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        ) : (
          <StatusIcon className={cn("w-5 h-5 shrink-0", status.color, task.status === "running" && "animate-spin")} />
        )}
      </div>

      {/* 展开结果 */}
      {expanded && hasOutput && (
        <div className="px-4 pb-3 border-t border-border pt-3 space-y-2 text-xs">

          {/* batch_copywriting */}
          {task.task_type === "batch_copywriting" && (
            <>
              <p className="text-muted-foreground">
                共处理 <span className="text-foreground font-medium">{String(output.total ?? 0)}</span> 条，
                成功 <span className="text-emerald-400 font-medium">{String(output.success ?? 0)}</span> 条
              </p>
              {Array.isArray(output.products) && (output.products as Record<string, unknown>[]).map((p, i) => (
                <div key={i} className={`rounded-lg border px-3 py-2 space-y-0.5 ${p.error ? "border-red-500/30 bg-red-500/5" : "border-border bg-secondary/50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-foreground truncate flex-1">{String(p.title)}</p>
                    {!p.error && (
                      <Link href={`/products/${p.product_id}`} className="shrink-0 text-primary hover:text-primary/80">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                  {!!p.seo_title && <p className="text-muted-foreground truncate">SEO: {String(p.seo_title)}</p>}
                  {!!p.error && <p className="text-red-400 text-[10px]">{String(p.error)}</p>}
                </div>
              ))}
            </>
          )}

          {/* auto_discovery */}
          {task.task_type === "auto_discovery" && discoveryProducts.length > 0 && (
            <>
              {confirmed ? (
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>已加入选品库</span>
                  <Link
                    href={task.shop_id ? `/library?shop_id=${task.shop_id}` : "/library"}
                    className="text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                  >
                    查看 <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground">推荐 <span className="text-foreground font-medium">{discoveryProducts.length}</span> 件，勾选后加入选品库</p>
                    <button
                      className="text-primary hover:underline"
                      onClick={() => {
                        const s = getSelected()
                        setSelected(s.size === discoveryProducts.length ? new Set() : new Set(discoveryProducts.map(p => p.id)))
                      }}
                    >
                      {getSelected().size === discoveryProducts.length ? "取消全选" : "全选"}
                    </button>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {discoveryProducts.slice(0, 8).map(p => (
                      <div
                        key={p.id}
                        onClick={() => toggleProduct(p.id)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-pointer transition-all ${
                          getSelected().has(p.id) ? "border-primary/40 bg-primary/5" : "border-border hover:bg-secondary/50"
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                          getSelected().has(p.id) ? "bg-primary border-primary" : "border-muted-foreground"
                        }`}>
                          {getSelected().has(p.id) && <Check className="w-2 h-2 text-white" />}
                        </div>
                        <p className="text-muted-foreground truncate flex-1">{p.title.slice(0, 45)}</p>
                      </div>
                    ))}
                    {discoveryProducts.length > 8 && (
                      <p className="text-muted-foreground text-center py-1">…还有 {discoveryProducts.length - 8} 件</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    className="w-full mt-1"
                    disabled={getSelected().size === 0 || confirming}
                    onClick={handleConfirm}
                  >
                    {confirming ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    确认加入选品库（{getSelected().size} 件）
                  </Button>
                </>
              )}
            </>
          )}

          {/* store_profile */}
          {task.task_type === "store_profile" && (
            <>
              {!!output.niche && <p><span className="text-muted-foreground">定位：</span>{String(output.niche)}</p>}
              {!!output.profile_summary && (
                <p className="text-muted-foreground line-clamp-3">{String(output.profile_summary).slice(0, 200)}…</p>
              )}
            </>
          )}

          {/* image_processing */}
          {task.task_type === "image_processing" && (
            <>
              <p className="text-muted-foreground">
                商品：<span className="text-foreground font-medium">{String(output.product_title ?? "")}</span>
                {!!output.operation && <> · {String(output.operation)}</>}
              </p>
              {!!output.image_url && (
                <a href={String(output.image_url)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary hover:text-primary/80 font-medium">
                  <ExternalLink className="w-3.5 h-3.5" />查看处理结果
                </a>
              )}
            </>
          )}

          {/* video_generation */}
          {task.task_type === "video_generation" && (
            <>
              <p className="text-muted-foreground">
                商品：<span className="text-foreground font-medium">{String(output.product_title ?? "")}</span>
                {!!output.duration && <> · {String(output.duration)}秒 · {String(output.resolution)}</>}
              </p>
              {!!output.video_url && (
                <a href={String(output.video_url)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary hover:text-primary/80 font-medium">
                  <ExternalLink className="w-3.5 h-3.5" />播放视频
                </a>
              )}
            </>
          )}

        </div>
      )}
    </div>
  )
}
