"use client"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { CheckCircle2, XCircle, Clock, Loader2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import Link from "next/link"

interface AgentTask {
  id: number
  task_type: string
  status: "pending" | "running" | "success" | "failed" | "cancelled"
  progress: number
  error_message?: string | null
  output_data?: Record<string, unknown> | null
  created_at: string
}

const taskMeta: Record<string, { label: string; icon: string }> = {
  store_profile:     { label: "店铺智能诊脉",     icon: "🔍" },
  auto_discovery:    { label: "零提示词自动推品",  icon: "🎯" },
  batch_copywriting: { label: "SEO & GEO 批量文案", icon: "✍️" },
  copywriting:       { label: "SEO & GEO 文案重构", icon: "✍️" },
  image_processing:  { label: "图片深度处理",     icon: "🖼️" },
  video_generation:  { label: "视频全自动二创",   icon: "🎬" },
  publish:           { label: "上架到 Shopify",   icon: "🚀" },
}

const statusConfig = {
  pending:   { variant: "outline" as const,  icon: Clock,        color: "text-muted-foreground", label: "等待中" },
  running:   { variant: "default" as const,  icon: Loader2,      color: "text-primary",          label: "运行中" },
  success:   { variant: "success" as const,  icon: CheckCircle2, color: "text-emerald-400",       label: "已完成" },
  failed:    { variant: "danger" as const,   icon: XCircle,      color: "text-red-400",           label: "失败"   },
  cancelled: { variant: "outline" as const,  icon: XCircle,      color: "text-muted-foreground", label: "已取消" },
}

export function AgentTaskCard({ task }: { task: AgentTask }) {
  const meta = taskMeta[task.task_type] ?? { label: task.task_type, icon: "⚙️" }
  const status = statusConfig[task.status]
  const StatusIcon = status.icon
  const [expanded, setExpanded] = useState(false)

  const output = task.output_data as Record<string, unknown> | null
  const hasOutput = task.status === "success" && output

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
                  {p.seo_title && <p className="text-muted-foreground truncate">SEO: {String(p.seo_title)}</p>}
                  {p.error && <p className="text-red-400 text-[10px]">{String(p.error)}</p>}
                </div>
              ))}
            </>
          )}
          {task.task_type === "auto_discovery" && Array.isArray(output.products) && (
            <>
              <p className="text-muted-foreground">推荐 <span className="text-foreground font-medium">{(output.products as unknown[]).length}</span> 件商品</p>
              {(output.products as Record<string, unknown>[]).slice(0, 5).map((p, i) => (
                <p key={i} className="text-muted-foreground truncate">#{i + 1} {String(p.title).slice(0, 50)}</p>
              ))}
            </>
          )}
          {task.task_type === "store_profile" && (
            <>
              {output.niche && <p><span className="text-muted-foreground">定位：</span>{String(output.niche)}</p>}
              {output.profile_summary && (
                <p className="text-muted-foreground line-clamp-3">{String(output.profile_summary).slice(0, 200)}...</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
