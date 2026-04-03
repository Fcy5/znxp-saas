import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react"

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  icon: LucideIcon
  trend?: number
  color?: "blue" | "violet" | "emerald" | "amber" | "rose"
}

const colors = {
  blue: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  violet: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  rose: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20" },
}

export function StatCard({ label, value, sub, icon: Icon, trend, color = "blue" }: StatCardProps) {
  const c = colors[color]
  return (
    <Card className="card-hover overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            {trend !== undefined && (
              <div className={cn("flex items-center gap-1 text-xs mt-1.5 font-medium", trend >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {trend >= 0 ? "+" : ""}{trend}% vs 昨日
              </div>
            )}
          </div>
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border", c.bg, c.border)}>
            <Icon className={cn("w-5 h-5", c.text)} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
