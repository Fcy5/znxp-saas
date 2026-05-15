"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ArrowRight, BadgeCheck, Bookmark, Flower2, Loader2, MonitorPlay, ShoppingBag, Sparkles, Target, Truck, WandSparkles } from "lucide-react"
import { productApi, type ProductCard, type SelectionCampaignBucket, type SelectionFeedbackSummary, type SelectionOverview, type SelectionPolicyResponse, type SelectionStandardsResponse } from "@/lib/api"
import { SELECTION_STATUSES, WEEKLY_CAMPAIGNS } from "@/lib/selection"
import { ProductCard as ProductTile } from "@/components/product/product-card"

type ThemeConfig = {
  key: string
  title: string
  desc: string
  keyword: string
  category?: string | null
  badge?: string
  href: string
}

const features = [
  { href: "/selection/products", icon: ShoppingBag, name: "选品大厅", desc: "全平台商品池、筛选、AI 推荐", badge: "HOT" },
  { href: "/selection/library", icon: Bookmark, name: "我的选品库", desc: "候选、重点、主推商品", badge: "WORKBENCH" },
  { href: "/selection/xiaohongshu", icon: Flower2, name: "小红书 / Instagram", desc: "社媒素材库、热帖、跨境内容参考", badge: "NEW" },
  { href: "/selection/facebook", icon: MonitorPlay, name: "FB 广告库", desc: "广告素材、投放参考、媒体同步" },
  { href: "/selection/suppliers", icon: Truck, name: "供应商", desc: "供应商管理、供应商商品库" },
]

const themes: ThemeConfig[] = [
  { key: "memorial", title: "Memorial Day", desc: "纪念、家庭、户外、礼品方向", keyword: "memorial", category: "Gifts", badge: "NOW", href: "/selection/products?q=memorial&cat=Gifts" },
  { key: "fathers", title: "Father's Day", desc: "父亲、爷爷、家庭纪念礼物方向", keyword: "father", category: "Apparel", badge: "NOW", href: "/selection/products?q=father&cat=Apparel" },
  { key: "graduation", title: "Graduation", desc: "毕业纪念、名字和仪式感礼物方向", keyword: "graduation", category: "Apparel", badge: "SEASON", href: "/selection/products?q=graduation&cat=Apparel" },
  { key: "summer", title: "Summer", desc: "夏季出游、露营、轻礼物方向", keyword: "summer", category: null, href: "/selection/products?q=summer" },
]

function ThemeSection({
  theme,
  products,
  loading,
  onImport,
  importing,
  importedCount,
  totalCandidates,
}: {
  theme: ThemeConfig
  products: ProductCard[]
  loading: boolean
  onImport: () => void
  importing: boolean
  importedCount?: number
  totalCandidates?: number
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">{theme.title}</h3>
            {theme.badge && <Badge variant="warning" className="text-[10px] px-1.5 py-0">{theme.badge}</Badge>}
            {typeof totalCandidates === "number" && <Badge variant="outline" className="text-[10px] px-1.5 py-0">候选 {totalCandidates}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{theme.desc}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={theme.href}>
            <Button size="sm" variant="outline">
              查看更多
            </Button>
          </Link>
          <Button size="sm" onClick={onImport} disabled={loading || importing || products.length === 0} className="gap-2">
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bookmark className="w-3.5 h-3.5" />}
            一键入库
          </Button>
        </div>
      </div>

      {!!importedCount && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
          已将 {importedCount} 个候选商品加入选品库，下一步可进入“我的选品库”继续细筛。
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card animate-pulse">
              <div className="aspect-square bg-secondary rounded-t-xl" />
              <div className="p-3.5 space-y-2">
                <div className="h-3 bg-secondary rounded w-3/4" />
                <div className="h-3 bg-secondary rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">当前没有匹配商品</div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {products.map(product => (
            <ProductTile key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  )
}

export default function SelectionSystemPage() {
  const [themeProducts, setThemeProducts] = useState<Record<string, ProductCard[]>>({})
  const [themeCounts, setThemeCounts] = useState<Record<string, number>>({})
  const [themeLoading, setThemeLoading] = useState<Record<string, boolean>>({})
  const [importingKey, setImportingKey] = useState<string | null>(null)
  const [importedCounts, setImportedCounts] = useState<Record<string, number>>({})
  const [overview, setOverview] = useState<SelectionOverview | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [autoCurating, setAutoCurating] = useState(false)
  const [autoCurateMsg, setAutoCurateMsg] = useState("")
  const [policy, setPolicy] = useState<SelectionPolicyResponse | null>(null)
  const [standards, setStandards] = useState<SelectionStandardsResponse | null>(null)
  const [feedbackSummary, setFeedbackSummary] = useState<SelectionFeedbackSummary | null>(null)

  const loadThemePool = async () => {
    themes.forEach(theme => setThemeLoading(prev => ({ ...prev, [theme.key]: true })))
    try {
      const res = await productApi.selectionCandidatePool(8)
      const buckets = (res.data || []).reduce<Record<string, SelectionCampaignBucket>>((acc, item) => {
        acc[item.campaign] = item
        return acc
      }, {})
      setThemeProducts({
        memorial: buckets["Memorial Day"]?.products || [],
        fathers: buckets["Father's Day"]?.products || [],
        graduation: buckets["Graduation"]?.products || [],
        summer: buckets["Summer"]?.products || [],
      })
      setThemeCounts({
        memorial: buckets["Memorial Day"]?.total_candidates || 0,
        fathers: buckets["Father's Day"]?.total_candidates || 0,
        graduation: buckets["Graduation"]?.total_candidates || 0,
        summer: buckets["Summer"]?.total_candidates || 0,
      })
    } catch {
      setThemeProducts({ memorial: [], fathers: [], graduation: [], summer: [] })
      setThemeCounts({ memorial: 0, fathers: 0, graduation: 0, summer: 0 })
    } finally {
      setThemeLoading({ memorial: false, fathers: false, graduation: false, summer: false })
    }
  }

  const loadOverview = async () => {
    setOverviewLoading(true)
    try {
      const res = await productApi.selectionOverview(8)
      setOverview(res.data || null)
    } catch {
      setOverview(null)
    } finally {
      setOverviewLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    loadThemePool().catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    loadOverview().catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    productApi.selectionPolicy().then(res => setPolicy(res.data || null)).catch(() => setPolicy(null))
    productApi.selectionStandards().then(res => setStandards(res.data || null)).catch(() => setStandards(null))
    productApi.selectionFeedbackSummary().then(res => setFeedbackSummary(res.data || null)).catch(() => setFeedbackSummary(null))
  }, [])

  const handleImportTheme = async (key: string) => {
    const ids = (themeProducts[key] || []).map(item => item.id)
    if (ids.length === 0) return
    setImportingKey(key)
    try {
      await productApi.batchSave(ids)
      setImportedCounts(prev => ({ ...prev, [key]: ids.length }))
    } finally {
      setImportingKey(null)
    }
  }

  const handleAutoCurate = async () => {
    setAutoCurating(true)
    setAutoCurateMsg("")
    try {
      const res = await productApi.autoCurateSelection()
      setAutoCurateMsg(`已生成 ${res.data.total_curated} 个候选，其中 ${res.data.shortlisted} 个重点、${res.data.featured} 个主推。`)
      await Promise.all([
        loadThemePool(),
        loadOverview(),
        productApi.selectionPolicy().then(res => setPolicy(res.data || null)),
        productApi.selectionFeedbackSummary().then(res => setFeedbackSummary(res.data || null)),
      ])
    } catch (err: unknown) {
      setAutoCurateMsg(err instanceof Error ? err.message : "自动生成失败")
    } finally {
      setAutoCurating(false)
    }
  }

  const campaignStats = overview?.campaigns || []
  const topProducts = overview?.top_products || []
  const totalByStatus = overview || { candidate: 0, shortlisted: 0, featured: 0, rejected: 0, total: 0, campaigns: [], top_products: [] }

  const statusLabel: Record<(typeof SELECTION_STATUSES)[number], string> = {
    candidate: "候选",
    shortlisted: "重点",
    featured: "主推",
    rejected: "淘汰",
  }

  return (
    <div className="flex flex-col min-h-full">
      <Header title="选品系统" />
      <div className="flex-1 p-6 space-y-8 max-w-7xl w-full mx-auto">
        <Link href="/control-center" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          返回中控台
        </Link>

        <section className="space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold text-foreground">本周专题候选池</h2>
              <p className="text-sm text-muted-foreground mt-2">本周专题池固定为 {WEEKLY_CAMPAIGNS.join(" / ")}，先从全量商品池按专题分类查看候选商品，再由用户一键入库进入选品库细筛。</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={handleAutoCurate} disabled={autoCurating} className="gap-2">
                {autoCurating ? <Loader2 className="w-4 h-4 animate-spin" /> : <WandSparkles className="w-4 h-4" />}
                生成本周候选
              </Button>
              <Link href="/selection/products">
                <Button variant="outline" className="gap-2">
                  <Sparkles className="w-4 h-4" />
                  进入全量商品池
                </Button>
              </Link>
            </div>
          </div>
          {autoCurateMsg && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
              {autoCurateMsg}
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Target className="w-4 h-4" />
                候选款
              </div>
              <div className="text-2xl font-semibold text-foreground">{overviewLoading ? "--" : totalByStatus.candidate}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Sparkles className="w-4 h-4" />
                重点款
              </div>
              <div className="text-2xl font-semibold text-foreground">{overviewLoading ? "--" : totalByStatus.shortlisted}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <BadgeCheck className="w-4 h-4" />
                主推款
              </div>
              <div className="text-2xl font-semibold text-foreground">{overviewLoading ? "--" : totalByStatus.featured}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Bookmark className="w-4 h-4" />
                库内总数
              </div>
              <div className="text-2xl font-semibold text-foreground">{overviewLoading ? "--" : totalByStatus.total}</div>
            </CardContent>
          </Card>
        </section>

        {(policy || standards) && (
          <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">选品标准库</h3>
                  <p className="text-sm text-muted-foreground mt-1">把定制刺绣的判断标准直接收进系统，不再只靠口头经验。</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">礼品属性</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(standards?.gift_attributes || []).map(item => <Badge key={item} variant="outline">{item}</Badge>)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">关系人群</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(standards?.audiences || []).map(item => <Badge key={item} variant="outline">{item}</Badge>)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">定制表达难度</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(standards?.customization_difficulty || []).map(item => <Badge key={item} variant="outline">{item}</Badge>)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">视觉展示效果</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(standards?.visual_merchandising || []).map(item => <Badge key={item} variant="outline">{item}</Badge>)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">8 维评分权重</h3>
                  <p className="text-sm text-muted-foreground mt-1">当前分数不再是黑箱，直接展示系统真实使用的权重。</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {policy && [
                    ["广告验证", policy.weights.ad_validation],
                    ["社媒热度", policy.weights.social_heat],
                    ["利润空间", policy.weights.profit],
                    ["市场竞争", policy.weights.market_competition],
                    ["产品质量", policy.weights.product_quality],
                    ["趋势时效", policy.weights.trend_timing],
                    ["受众匹配", policy.weights.audience_fit],
                    ["刺绣适配", policy.weights.embroidery_fit],
                  ].map(([label, weight]) => (
                    <div key={String(label)} className="rounded-lg bg-secondary px-3 py-2 text-foreground">
                      {label} {(Number(weight) * 100).toFixed(0)}%
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {policy && (
          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">当前生效策略</h3>
              <p className="text-sm text-muted-foreground mt-1">这里展示的不是静态配置，而是下一轮自动选品会直接使用的真实规则。</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {policy.campaigns.map(item => (
                <Card key={item.campaign}>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-foreground">{item.campaign}</div>
                      <Badge variant="outline">{item.effective_target_quota}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      基础配额 {item.target_quota} / 生效配额 {item.effective_target_quota}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      最低相关度 {item.minimum_relevance_score}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {item.strict_custom_signal && <Badge variant="outline">强定制信号</Badge>}
                      {item.strict_audience_signal && <Badge variant="outline">强人群信号</Badge>}
                      {item.strict_scenario_signal && <Badge variant="outline">强场景信号</Badge>}
                      {!item.strict_custom_signal && !item.strict_audience_signal && !item.strict_scenario_signal && (
                        <Badge variant="outline">常规模式</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      反馈样本 {item.feedback_sample_count}
                    </div>
                    <div className="space-y-2 text-xs">
                      {item.recommended_adjustments.slice(0, 2).map(adjustment => (
                        <div key={adjustment} className="rounded-lg bg-secondary px-2.5 py-2 text-foreground">
                          {adjustment}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {features.map((feature) => (
            <Link key={feature.href} href={feature.href}>
              <Card className="h-full hover:bg-accent/20 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <feature.icon className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{feature.name}</p>
                        {feature.badge && <Badge variant="warning" className="text-[10px] px-1.5 py-0">{feature.badge}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{feature.desc}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-lg font-semibold text-foreground">专题池进度</h3>
              <p className="text-sm text-muted-foreground mt-1">按固定 4 个专题池查看候选、重点、主推、淘汰分布。</p>
            </div>
            <Link href="/selection/library">
              <Button size="sm" variant="outline">进入选品库</Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {campaignStats.map(item => (
              <Card key={item.campaign}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-foreground">{item.campaign}</div>
                    <Badge variant="outline">{item.total}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-secondary px-3 py-2 text-foreground">候选 {item.candidate}</div>
                    <div className="rounded-lg bg-secondary px-3 py-2 text-foreground">重点 {item.shortlisted}</div>
                    <div className="rounded-lg bg-secondary px-3 py-2 text-foreground">主推 {item.featured}</div>
                    <div className="rounded-lg bg-secondary px-3 py-2 text-foreground">淘汰 {item.rejected}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {feedbackSummary && (
          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">复核反馈闭环</h3>
              <p className="text-sm text-muted-foreground mt-1">记录主推确认、淘汰确认和误判原因，并给下一轮专题池策略建议。</p>
            </div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">反馈总数</div><div className="text-2xl font-semibold mt-1">{feedbackSummary.total_feedback}</div></CardContent></Card>
              <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">确认主推</div><div className="text-2xl font-semibold mt-1">{feedbackSummary.total_approved}</div></CardContent></Card>
              <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">确认淘汰</div><div className="text-2xl font-semibold mt-1">{feedbackSummary.total_rejected}</div></CardContent></Card>
              <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">误判样本</div><div className="text-2xl font-semibold mt-1">{feedbackSummary.total_missed}</div></CardContent></Card>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {feedbackSummary.campaigns.map(item => (
                <Card key={item.campaign}>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-foreground">{item.campaign}</div>
                      <Badge variant="outline">反馈 {item.total_feedback}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">高频原因：{item.top_reasons.length ? item.top_reasons.join(" / ") : "暂无"}</div>
                    <div className="space-y-2 text-sm">
                      {item.recommended_adjustments.map(adjustment => (
                        <div key={adjustment} className="rounded-lg bg-secondary px-3 py-2 text-foreground">{adjustment}</div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardContent className="p-5 space-y-2">
                <div className="font-medium text-foreground">全局下一轮建议</div>
                <div className="space-y-2 text-sm">
                  {feedbackSummary.global_recommendations.map(item => (
                    <div key={item} className="rounded-lg bg-secondary px-3 py-2 text-foreground">{item}</div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        <section className="space-y-8">
          {themes.map(theme => (
            <ThemeSection
              key={theme.key}
              theme={theme}
              products={themeProducts[theme.key] || []}
              loading={themeLoading[theme.key] ?? true}
              onImport={() => handleImportTheme(theme.key)}
              importing={importingKey === theme.key}
              importedCount={importedCounts[theme.key]}
              totalCandidates={themeCounts[theme.key]}
            />
          ))}
        </section>

        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">当前高分候选</h3>
            <p className="text-sm text-muted-foreground mt-1">按 `final_selection_score` 排序，优先查看已经具备专题和理由的商品。</p>
          </div>
          {overviewLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : topProducts.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              选品库里还没有可用于排序的候选商品，先从上面的专题池一键入库。
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {topProducts.map(product => (
                <div key={product.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/selection/products/${product.id}`} className="font-medium text-foreground line-clamp-2 hover:underline">
                        {product.title}
                      </Link>
                      <div className="text-xs text-muted-foreground mt-1">{product.weekly_campaign || "未归类专题"}</div>
                    </div>
                    <Badge variant="outline">{Math.round(product.final_selection_score || 0)}</Badge>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="info">{statusLabel[(product.selection_status || "candidate") as (typeof SELECTION_STATUSES)[number]]}</Badge>
                    {product.embroidery_fit_score !== undefined && (
                      <Badge variant="outline">刺绣 {Math.round(product.embroidery_fit_score || 0)}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-4">
                    {product.selection_reason || "暂未生成选品理由"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
