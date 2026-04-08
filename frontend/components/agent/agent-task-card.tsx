import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react"

interface AgentTask {
  id: number
  task_type: string
  status: "pending" | "running" | "success" | "failed" | "cancelled"
  progress: number
  error_message?: string | null
  created_at: string
}

const taskMeta: Record<string, { label: string; icon: string }> = {
  store_profile: { label: "店铺智能诊脉", icon: "🔍" },
  auto_discovery: { label: "零提示词自动推品", icon: "🎯" },
  batch_copywriting: { label: "SEO & GEO 批量文案", icon: "✍️" },
  copywriting: { label: "SEO & GEO 文案重构", icon: "✍️" },
  image_processing: { label: "图片深度处理", icon: "🖼️" },
  video_generation: { label: "视频全自动二创", icon: "🎬" },
  publish: { label: "上架到 Shopify", icon: "🚀" },
}

const statusConfig = {
  pending: { variant: "outline" as const, icon: Clock, color: "text-muted-foreground", label: "等待中" },
  running: { variant: "default" as const, icon: Loader2, color: "text-primary", label: "运行中" },
  success: { variant: "success" as const, icon: CheckCircle2, color: "text-emerald-400", label: "已完成" },
  failed: { variant: "danger" as const, icon: XCircle, color: "text-red-400", label: "失败" },
  cancelled: { variant: "outline" as const, icon: XCircle, color: "text-muted-foreground", label: "已取消" },
}

export function AgentTaskCard({ task }: { task: AgentTask }) {
  const meta = taskMeta[task.task_type] ?? { label: task.task_type, icon: "⚙️" }
  const status = statusConfig[task.status]
  const StatusIcon = status.icon

  return (
    <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border bg-card card-hover">
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
      <StatusIcon className={cn("w-5 h-5 shrink-0", status.color, task.status === "running" && "animate-spin")} />
    </div>
  )
}
