"use client"
import { useEffect, useState } from "react"
import { Header } from "@/components/layout/header"
import { StatCard } from "@/components/dashboard/stat-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Flame, Package, Rocket, Bot, TrendingUp,
  ArrowRight, Sparkles, Zap, BarChart2,
} from "lucide-react"
import Link from "next/link"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts"
import { dashboardApi, productApi, STATIC_BASE, type DashboardStats, type ProductRecommendation, type TrendPoint } from "@/lib/api"

const platformColor: Record<string, "warning" | "info" | "danger" | "default"> = {
  amazon: "warning", etsy: "info", tiktok: "danger",
  facebook: "default", shopify: "default", google: "default",
}

function EggRow({ rec, rank }: { rec: ProductRecommendation; rank: number }) {
  const rankIcon = ["🥇", "🥈", "🥉"][rank] ?? "✨"
  const isXhs = rec.source_platform === "xiaohongshu"
  const href = isXhs ? "/xiaohongshu" : `/products/${rec.id}`

  return (
    <Link href={href}>
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border bg-card hover:bg-accent/30 transition-colors cursor-pointer ${isXhs ? "border-rose-500/20" : "border-border"}`}>
        <span className="text-lg shrink-0">{rankIcon}</span>
        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-secondary relative">
          {rec.main_image ? (
            <img
              src={rec.main_image.startsWith('/') ? `${STATIC_BASE}${rec.main_image}` : rec.main_image}
              alt={rec.title}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : <div className="w-full h-full flex items-center justify-center text-lg">🛍️</div>}
          {isXhs && (
            <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-rose-500 rounded-tl-md flex items-center justify-center">
              <span className="text-[7px] text-white font-bold">红</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{rec.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant={isXhs ? "danger" : (platformColor[rec.source_platform] ?? "outline")} className="text-[10px]">
              {isXhs ? "小红书" : rec.source_platform}
            </Badge>
            <span className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 text-amber-400" />{rec.rec_reason.split(" · ")[0]}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          {isXhs ? (
            <p className="text-xs text-rose-400">❤ {(rec.review_count ?? 0).toLocaleString()} 赞</p>
          ) : (
            <>
              <p className="text-sm font-bold text-foreground">${rec.price?.toFixed(2) ?? "--"}</p>
              {rec.profit_margin_estimate && (
                <p className="text-xs text-emerald-400">{rec.profit_margin_estimate.toFixed(0)}% 利润</p>
              )}
            </>
          )}
        </div>
        <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 ${isXhs ? "bg-rose-500/10 border border-rose-500/20" : "bg-primary/10 border border-primary/20"}`}>
          <span className={`text-xs font-bold ${isXhs ? "text-rose-400" : "text-primary"}`}>{(rec.rec_score * 100).toFixed(0)}</span>
          <span className="text-[9px] text-muted-foreground">{isXhs ? "热" : "AI"}</span>
        </div>
      </div>
    </Link>
  )
}

const platformMeta: Record<string, { label: string; color: string }> = {
  shopify:  { label: "Shopify",  color: "bg-purple-400" },
  amazon:   { label: "Amazon",   color: "bg-amber-400"  },
  etsy:     { label: "Etsy",     color: "bg-pink-400"   },
  tiktok:   { label: "TikTok",   color: "bg-red-400"    },
  google:   { label: "Google",   color: "bg-emerald-400"},
  facebook: { label: "Facebook", color: "bg-blue-400"   },
}

// Custom tooltip for the trend chart
function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg text-xs space-y-1">
      <p className="text-muted-foreground font-medium">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name === "new_products" ? "新入库" : "已上架"}：{p.value}
        </p>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const today = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recs, setRecs] = useState<ProductRecommendation[]>([])
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [trendDays, setTrendDays] = useState<7 | 14 | 30>(14)

  useEffect(() => {
    Promise.all([
      dashboardApi.stats().then(r => setStats(r.data)).catch(() => {}),
      productApi.recommendations(20).then(r => setRecs(r.data || [])).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    dashboardApi.trend(trendDays).then(r => setTrend(r.data || [])).catch(() => {})
  }, [trendDays])

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Dashboard" />
      <div className="flex-1 p-6 space-y-6">
        {/* Welcome */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground">早上好，欢迎回来 👋</h2>
            <p className="text-muted-foreground text-sm mt-0.5">{today}</p>
          </div>
          <Link href="/products">
            <Button className="gap-2">
              <Sparkles className="w-4 h-4" />
              进入选品大厅
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card animate-pulse h-24" />
            ))
          ) : (
            <>
              <StatCard label="平台商品总量" value={stats?.total_products_platform ?? 0} icon={Flame} color="amber" sub="全平台真实数据" />
              <StatCard label="我的商品库" value={stats?.total_products_in_library ?? 0} icon={Package} color="blue" />
              <StatCard label="今日已上架" value={stats?.published_today ?? 0} icon={Rocket} color="emerald" />
              <StatCard label="累计上架" value={stats?.total_published ?? 0} icon={Bot} color="violet" sub="Shopify 已发布" />
            </>
          )}
        </div>

        {/* Trend Chart */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                数据趋势
              </CardTitle>
              <div className="flex gap-1">
                {([7, 14, 30] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setTrendDays(d)}
                    className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${trendDays === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
                  >
                    {d}天
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {trend.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">加载中...</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorProducts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorPublished" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    interval={trendDays === 7 ? 0 : trendDays === 14 ? 1 : 4}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<TrendTooltip />} />
                  <Legend
                    formatter={(value) => (
                      <span className="text-xs text-muted-foreground">
                        {value === "new_products" ? "新入库商品" : "我的上架数"}
                      </span>
                    )}
                  />
                  <Area
                    type="monotone"
                    dataKey="new_products"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#colorProducts)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="published"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#colorPublished)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* AI 今日推品 */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                AI 今日推品
                <Badge variant="warning" className="text-[10px]">每日推荐</Badge>
              </h3>
              <Link href="/products" className="text-xs text-primary hover:underline flex items-center gap-1">
                查看全部 <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl border border-border bg-card animate-pulse" />
                ))}
              </div>
            ) : recs.length > 0 ? (
              <div className="space-y-2">
                {recs.map((rec, i) => <EggRow key={rec.id} rec={rec} rank={i} />)}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">暂无推荐数据</div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Data Sources */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-blue-400" />
                  数据来源分布
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2.5">
                {loading ? (
                  <div className="space-y-2.5">
                    {Array.from({length: 5}).map((_,i) => <div key={i} className="h-7 rounded bg-secondary animate-pulse" />)}
                  </div>
                ) : (() => {
                  const counts = stats?.platform_counts ?? {}
                  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
                  return Object.entries(counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([plat, count]) => {
                      const meta = platformMeta[plat] ?? { label: plat, color: "bg-slate-400" }
                      return (
                        <div key={plat}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-foreground">{meta.label}</span>
                            <span className="text-muted-foreground font-medium">{count.toLocaleString()}</span>
                          </div>
                          <Progress value={Math.round(count / total * 100)} color={meta.color} />
                        </div>
                      )
                    })
                })()}
                <p className="text-[10px] text-muted-foreground text-right pt-1">
                  共 {stats?.total_products_platform.toLocaleString() ?? "—"} 条真实商品
                </p>
              </CardContent>
            </Card>

            {/* Category Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  品类分布
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({length: 5}).map((_,i) => <div key={i} className="h-7 rounded bg-secondary animate-pulse" />)}
                  </div>
                ) : (() => {
                  const counts = stats?.category_counts ?? {}
                  const max = Math.max(...Object.values(counts), 1)
                  return Object.entries(counts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(([cat, count]) => {
                      const pct = Math.round(count / max * 100)
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-foreground">{cat}</span>
                            <span className="text-muted-foreground font-medium">{count.toLocaleString()}</span>
                          </div>
                          <Progress value={pct} color={pct > 80 ? "bg-amber-400" : pct > 50 ? "bg-emerald-400" : "bg-primary"} />
                        </div>
                      )
                    })
                })()}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
