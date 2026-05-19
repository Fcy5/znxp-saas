"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Header } from "@/components/layout/header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Drawer } from "@/components/ui/drawer"
import { Progress } from "@/components/ui/progress"
import { formatNumber } from "@/lib/utils"
import {
  Star, TrendingUp, Play, BarChart2, Search, ChevronLeft,
  Plus, Bot, Rocket, MessageSquare, ShoppingCart, Target,
  Loader2, ImageIcon, ExternalLink, Check, AlertCircle, CheckCircle2,
  Sparkles, Download,
} from "lucide-react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { productApi, shopApi, publishApi, uploadApi, agentApi, AVAILABLE_MODELS, IMAGE_MODELS, IMAGE_SIZES, IMAGE_QUALITIES, IMAGE_PROMPTS, STATIC_BASE, type ProductDetail, type SelectionMeta, type Shop, type SizeVariant } from "@/lib/api"
import { SELECTION_STATUSES, WEEKLY_CAMPAIGNS } from "@/lib/selection"
import { AgentWorkflow } from "@/components/agent/agent-workflow"

const APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"]
const CAMPAIGNS = [...WEEKLY_CAMPAIGNS]

const PLATFORM_LABEL: Record<string, string> = {
  amazon: "Amazon", etsy: "Etsy", shopify: "Shopify",
  facebook: "Facebook", google: "Google", tiktok: "TikTok",
}

export default function ProductDetailPage() {
  const params = useParams()
  const id = Number(params.id)

  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPublish, setShowPublish] = useState(false)
  const [shops, setShops] = useState<Shop[]>([])
  const [shopsLoading, setShopsLoading] = useState(false)
  const [selectedShop, setSelectedShop] = useState<number | null>(null)
  const [publishTitle, setPublishTitle] = useState("")
  const [publishDesc, setPublishDesc] = useState("")
  const [publishTags, setPublishTags] = useState("")
  const [publishPrice, setPublishPrice] = useState("")
  const [enableSizes, setEnableSizes] = useState(false)
  const [sizeVariants, setSizeVariants] = useState<SizeVariant[]>(
    APPAREL_SIZES.map(s => ({ size: s, price: 0 }))
  )
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set(["S","M","L","XL"]))
  const [extraImages, setExtraImages] = useState<string[]>([])
  const [uploadingImg, setUploadingImg] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<{ url?: string; error?: string } | null>(null)
  const [generatingCopy, setGeneratingCopy] = useState(false)
  const [copyError, setCopyError] = useState("")
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].value)

  const [showAgentWorkflow, setShowAgentWorkflow] = useState(false)
  const [selectionMeta, setSelectionMeta] = useState<SelectionMeta>({
    selection_status: "candidate",
    season_tags: [],
    holiday_tags: [],
    audience_tags: [],
    scenario_tags: [],
    customization_type: [],
  })
  const [savingSelection, setSavingSelection] = useState(false)
  const [selectionMsg, setSelectionMsg] = useState("")
  const [autoTagging, setAutoTagging] = useState(false)
  const [taggingMsg, setTaggingMsg] = useState("")
  const [feedbackOutcome, setFeedbackOutcome] = useState("approved")
  const [feedbackReasons, setFeedbackReasons] = useState("")
  const [feedbackNotes, setFeedbackNotes] = useState("")
  const [feedbackAction, setFeedbackAction] = useState("")
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState("")

  // AI 修图
  const [showImageStudio, setShowImageStudio] = useState(false)
  const [imgModel, setImgModel] = useState(IMAGE_MODELS[0].value)
  const [imgPrompt, setImgPrompt] = useState(IMAGE_PROMPTS[0].prompt)
  const [generatingImg, setGeneratingImg] = useState(false)
  const [imgError, setImgError] = useState("")
  const [generatedImgs, setGeneratedImgs] = useState<string[]>([])
  const [useRefImg, setUseRefImg] = useState(true)
  const [imgSize, setImgSize] = useState("auto")
  const [imgQuality, setImgQuality] = useState("low")
  const [activePanel, setActivePanel] = useState<"metrics" | "ai" | "decision" | "insights" | null>(null)

  const handleGenerateImage = async () => {
    if (!imgPrompt.trim()) return
    setGeneratingImg(true)
    setImgError("")
    try {
      const productContext = product
        ? `Product: ${product.title}${product.category ? `, Category: ${product.category}` : ""}. `
        : ""
      const finalPrompt = `${productContext}${imgPrompt}`
      const referenceUrl = useRefImg ? product?.main_image ?? undefined : undefined
      const res = await agentApi.generateImage(finalPrompt, imgModel, referenceUrl, imgSize, imgQuality)
      if (res.data?.url) {
        setGeneratedImgs(prev => [res.data!.url, ...prev])
      }
    } catch (err: unknown) {
      setImgError(err instanceof Error ? err.message : "生成失败")
    } finally {
      setGeneratingImg(false)
    }
  }

  const addGeneratedToPublish = (url: string) => {
    const next = extraImages.includes(url) ? extraImages : [...extraImages, url]
    setExtraImages(next)
    setShowImageStudio(false)
    if (!showPublish) openPublish({ extraImages: next })
  }

  const handleGenerateCopy = async () => {
    if (!product) return
    setGeneratingCopy(true)
    setCopyError("")
    try {
      const res = await agentApi.generateCopy(product.id, "en", selectedModel)
      if (res.data) {
        setPublishTitle(res.data.seo_title)
        setPublishDesc(res.data.html_description)
      }
    } catch (err: unknown) {
      setCopyError(err instanceof Error ? err.message : "生成失败")
    } finally {
      setGeneratingCopy(false)
    }
  }

  useEffect(() => {
    if (!id) return
    productApi.getDetail(id)
      .then(res => {
        setProduct(res.data)
        if (res.data?.is_saved) setSaved(true)
        if (res.data?.selection_meta) {
          setSelectionMeta(res.data.selection_meta)
          setFeedbackOutcome(res.data.selection_meta.review_feedback?.outcome || "approved")
          setFeedbackReasons((res.data.selection_meta.review_feedback?.reasons || []).join(", "))
          setFeedbackNotes(res.data.selection_meta.review_feedback?.notes || "")
          setFeedbackAction(res.data.selection_meta.review_feedback?.next_action || "")
        }
      })
      .catch(() => setError("商品不存在或加载失败"))
      .finally(() => setLoading(false))
  }, [id])

  const handleSave = async () => {
    if (saved || saving) return
    setSaving(true)
    try {
      await productApi.save(id)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const setTagField = (field: keyof SelectionMeta, raw: string) => {
    const tags = raw.split(",").map(v => v.trim()).filter(Boolean)
    setSelectionMeta(prev => ({ ...prev, [field]: tags }))
  }

  const saveSelectionMeta = async () => {
    setSavingSelection(true)
    setSelectionMsg("")
    try {
      if (!saved) {
        await productApi.save(id)
        setSaved(true)
      }
      const res = await productApi.updateSelectionMeta(id, selectionMeta)
      if (res.data) setSelectionMeta(res.data)
      setSelectionMsg("选品决策已保存")
    } catch (err: unknown) {
      setSelectionMsg(err instanceof Error ? err.message : "保存失败")
    } finally {
      setSavingSelection(false)
    }
  }

  const runAutoTagging = async () => {
    setAutoTagging(true)
    setTaggingMsg("")
    try {
      const res = await productApi.autoTagSelectionProduct(id)
      if (res.data) {
        setSelectionMeta(prev => ({
          ...prev,
          season_tags: res.data.season_tags,
          holiday_tags: res.data.holiday_tags,
          audience_tags: res.data.audience_tags,
          scenario_tags: res.data.scenario_tags,
          customization_type: res.data.customization_type,
          event_window: res.data.event_window,
          content_hook: res.data.content_hook,
          tag_confidence: res.data.tag_confidence,
          tag_summary: res.data.tag_summary,
        }))
        setTaggingMsg(`${res.data.tag_summary} 识别信心 ${res.data.tag_confidence}。`)
      }
    } catch (err: unknown) {
      setTaggingMsg(err instanceof Error ? err.message : "自动识别失败")
    } finally {
      setAutoTagging(false)
    }
  }

  const saveSelectionFeedback = async () => {
    setSavingFeedback(true)
    setFeedbackMsg("")
    try {
      if (!saved) {
        await productApi.save(id)
        setSaved(true)
      }
      const res = await productApi.saveSelectionFeedback(id, {
        outcome: feedbackOutcome,
        reasons: feedbackReasons.split(",").map(v => v.trim()).filter(Boolean),
        notes: feedbackNotes || undefined,
        next_action: feedbackAction || undefined,
      })
      if (res.data) setSelectionMeta(res.data)
      setFeedbackMsg("复核反馈已保存")
    } catch (err: unknown) {
      setFeedbackMsg(err instanceof Error ? err.message : "反馈保存失败")
    } finally {
      setSavingFeedback(false)
    }
  }

  const openPublish = async (draft?: { title?: string; description?: string; extraImages?: string[] }) => {
    if (product) {
      setPublishTitle(draft?.title ?? product.title)
      setPublishDesc(draft?.description ?? (product.description || ""))
      setPublishPrice(product.price?.toString() || "")
      setPublishTags(product.category || "")
    }
    setPublishResult(null)
    if (draft?.extraImages) {
      setExtraImages(Array.from(new Set(draft.extraImages)))
    }
    setEnableSizes(false)
    setSelectedSizes(new Set(["S","M","L","XL"]))
    setShowPublish(true)
    setShopsLoading(true)
    try {
      const res = await shopApi.list()
      setShops(res.data || [])
      if (res.data?.length > 0) setSelectedShop(res.data[0].id)
    } catch {
      setShops([])
    } finally {
      setShopsLoading(false)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImg(true)
    try {
      const url = await uploadApi.upload(file)
      setExtraImages(prev => [...prev, url])
    } catch {
      // ignore
    } finally {
      setUploadingImg(false)
      e.target.value = ""
    }
  }

  const toggleSize = (size: string) => {
    setSelectedSizes(prev => {
      const next = new Set(prev)
      if (next.has(size)) next.delete(size); else next.add(size)
      return next
    })
  }

  const updateSizePrice = (size: string, price: string) => {
    setSizeVariants(prev => prev.map(v => v.size === size ? { ...v, price: parseFloat(price) || 0 } : v))
  }

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedShop) return
    setPublishing(true)
    const basePrice = parseFloat(publishPrice) || product?.price || 9.99
    try {
      const variants: SizeVariant[] = enableSizes
        ? sizeVariants
            .filter(v => selectedSizes.has(v.size))
            .map(v => ({ size: v.size, price: v.price || basePrice }))
        : []
      const res = await publishApi.publish({
        product_id: id,
        shop_id: selectedShop,
        title: publishTitle,
        description: publishDesc,
        price: basePrice,
        tags: publishTags,
        variants: variants.length > 0 ? variants : undefined,
        extra_images: extraImages.length > 0 ? extraImages : undefined,
      })
      setPublishResult({ url: res.data?.shopify_product_url || "" })
    } catch (err: unknown) {
      setPublishResult({ error: err instanceof Error ? err.message : "上架失败" })
    } finally {
      setPublishing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-full">
        <Header title="商品详情" />
        <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="flex flex-col min-h-full">
        <Header title="商品详情" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <p>{error || "商品不存在"}</p>
          <Link href="/products">
            <Button variant="outline" size="sm" className="gap-1">
              <ChevronLeft className="w-3.5 h-3.5" /> 返回选品大厅
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const p = product
  const aiScore = p.ai_score ?? 0
  const platformLabel = PLATFORM_LABEL[p.source_platform] ?? p.source_platform
  const scoreBreakdownEntries = selectionMeta.score_breakdown
    ? [
        { label: "广告验证", value: selectionMeta.score_breakdown.ad_validation ?? 0 },
        { label: "社媒热度", value: selectionMeta.score_breakdown.social_heat ?? 0 },
        { label: "利润空间", value: selectionMeta.score_breakdown.profit ?? 0 },
        { label: "市场竞争", value: selectionMeta.score_breakdown.market_competition ?? 0 },
        { label: "产品质量", value: selectionMeta.score_breakdown.product_quality ?? 0 },
        { label: "趋势时效", value: selectionMeta.score_breakdown.trend_timing ?? 0 },
        { label: "受众匹配", value: selectionMeta.score_breakdown.audience_fit ?? 0 },
        { label: "刺绣适配", value: selectionMeta.score_breakdown.embroidery_fit ?? 0 },
      ].sort((a, b) => b.value - a.value)
    : []
  const keyMetrics = [
    {
      icon: ShoppingCart,
      label: "市场价格",
      value: p.price ? `$${p.price}` : "—",
      color: "text-foreground",
      formula: "来源于原始商品抓取价格，展示当前抓到的市场售价。",
      reason: p.price ? `当前价格落在 $${p.price}，便于和利润率、目标售价联动判断。` : "当前没有抓到稳定价格，不能直接用于定价判断。",
    },
    {
      icon: TrendingUp,
      label: "销量增速",
      value: p.sales_trend ? `+${p.sales_trend}%` : "—",
      color: "text-emerald-400",
      formula: "按评论数 / 上架月数估算月均增长，再归一化到 0-200 区间。",
      reason: p.sales_trend
        ? `当前增速为 +${p.sales_trend}% ，说明这款商品近期仍在增长；该值越高，代表近阶段热度越强。`
        : "缺少评论或上架时间，当前无法估算增长斜率。",
    },
    {
      icon: Target,
      label: "预估利润率",
      value: p.profit_margin_estimate ? `${p.profit_margin_estimate}%` : "—",
      color: "text-emerald-400",
      formula: "基于抓取售价与系统估算成本得到毛利率区间。",
      reason: p.profit_margin_estimate
        ? `当前预估利润率 ${p.profit_margin_estimate}% ，${p.profit_margin_estimate >= 45 ? "属于较健康的利润结构，可支撑投放测试。" : "利润空间偏一般，建议谨慎控制获客成本。"}`
        : "缺少足够的成本或售价参考，当前利润率不可解释。",
    },
    {
      icon: Star,
      label: "用户评分",
      value: p.review_score ? `${p.review_score}${p.review_count ? ` (${formatNumber(p.review_count)})` : ""}` : "—",
      color: "text-amber-400",
      formula: "直接取平台评分和评价数量，用于判断口碑稳定性。",
      reason: p.review_score
        ? `评分 ${p.review_score}${p.review_count ? `，共 ${formatNumber(p.review_count)} 条评价` : ""}，${p.review_score >= 4.7 ? "说明口碑很强。" : "说明口碑基础存在，但还需要结合评论内容判断。"}`
        : "当前没有可用评分数据，无法用口碑做强判断。",
    },
    {
      icon: Play,
      label: "TikTok播放",
      value: p.tiktok_views ? formatNumber(p.tiktok_views) : "—",
      color: "text-pink-400",
      formula: "通过 TikTok 搜索结果聚合相关播放量，用来判断社媒传播势能。",
      reason: p.tiktok_views
        ? `相关播放量约 ${formatNumber(p.tiktok_views)}，${p.tiktok_views >= 1_000_000 ? "已经形成明显社媒流量池。" : "说明有一定社媒讨论度，但未到爆发段。"}`
        : "没有抓到有效播放量，暂时不能把社媒热度作为主依据。",
    },
    {
      icon: Search,
      label: "GMC搜索量",
      value: p.gmc_search_volume ? formatNumber(p.gmc_search_volume) : "—",
      color: "text-blue-400",
      formula: "来自 Google Merchant / 搜索侧关键词需求量，用于判断搜索需求。",
      reason: p.gmc_search_volume
        ? `当前搜索量约 ${formatNumber(p.gmc_search_volume)}，${p.gmc_search_volume >= 1000 ? "说明有稳定主动搜索需求。" : "说明搜索需求存在，但规模仍偏小。"}`
        : "暂无稳定搜索量数据，当前不能据此判断搜索需求。",
    },
  ]
  const panelCards = [
    {
      id: "metrics" as const,
      title: "数据指标解释",
      desc: "查看评分构成、销量增速和利润率的计算口径，以及每个分值为什么会这样。",
    },
    {
      id: "ai" as const,
      title: "AI 内容与素材",
      desc: "把标题优化、Meta、Alt 标签、详情页和图片素材集中到一个窗口里处理。",
    },
    {
      id: "decision" as const,
      title: "选品决策",
      desc: "把专题、标签、复核、8 维评分卡收进独立面板，避免详情页主视图过载。",
    },
    {
      id: "insights" as const,
      title: "评论与广告洞察",
      desc: "集中查看评论情绪、痛点提炼、广告验证和收藏热度等辅助判断信息。",
    },
  ]

  return (
    <div className="flex flex-col min-h-full">
      <Header title="商品详情" />
      <div className="flex-1 p-6 space-y-6 max-w-6xl">
        {/* Breadcrumb */}
        <Link href="/products" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit">
          <ChevronLeft className="w-3.5 h-3.5" />
          返回选品大厅
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="relative group/img aspect-square rounded-2xl bg-secondary overflow-hidden flex items-center justify-center border border-border">
              {p.main_image ? (
                <img src={p.main_image} alt={p.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
              ) : (
                <ImageIcon className="w-16 h-16 text-muted-foreground/20" />
              )}
              <button
                onClick={() => setShowImageStudio(true)}
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity"
              >
                <Sparkles className="w-6 h-6 text-white" />
                <span className="text-xs text-white font-medium">AI 修图</span>
              </button>
            </div>

            <Card className="glow">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">AI 综合评分</span>
                  <span className="text-3xl font-black gradient-text">{aiScore > 0 ? aiScore : "—"}</span>
                </div>
                <Progress value={aiScore} color="bg-gradient-to-r from-blue-500 to-violet-500" />
                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-foreground">为什么是这个分</p>
                  {selectionMeta.score_summary && (
                    <p className="text-xs leading-5 text-muted-foreground">{selectionMeta.score_summary}</p>
                  )}
                  {selectionMeta.selection_reason && (
                    <p className="text-xs leading-5 text-muted-foreground">{selectionMeta.selection_reason}</p>
                  )}
                  {scoreBreakdownEntries.slice(0, 3).map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-lg border border-border bg-secondary px-3 py-2 text-xs">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-medium text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="w-full" onClick={() => setActivePanel("metrics")}>
                  查看完整评分依据
                </Button>
              </CardContent>
            </Card>

            {p.images && p.images.length > 1 && (
              <div className="grid grid-cols-4 gap-1.5">
                {p.images.slice(0, 8).map((img, i) => (
                  <div key={i} className="aspect-square rounded-lg overflow-hidden border border-border bg-secondary">
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-3 space-y-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="warning">{platformLabel}</Badge>
                    {p.category && <Badge variant="outline">{p.category}</Badge>}
                  </div>
                  <h1 className="text-xl font-bold text-foreground leading-tight">{p.title}</h1>
                  {p.source_url && (
                    p.source_platform === "tiktok" ? (
                      <a href={p.source_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg bg-pink-500/10 border border-pink-500/30 text-pink-400 hover:bg-pink-500/20 transition-colors text-xs font-medium w-fit">
                        <Play className="w-3.5 h-3.5 fill-pink-400" /> 在 TikTok 上观看视频
                      </a>
                    ) : (
                      <a href={p.source_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-2 w-fit">
                        <ExternalLink className="w-3 h-3" /> 查看原链接
                      </a>
                    )
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {keyMetrics.map((metric) => (
                    <div key={metric.label} className="rounded-xl border border-border bg-secondary p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <metric.icon className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{metric.label}</span>
                      </div>
                      <p className={`text-sm font-bold ${metric.color}`}>{metric.value}</p>
                    </div>
                  ))}
                </div>

                {p.description && (
                  <div className="rounded-xl border border-border bg-secondary/50 p-4">
                    <p className="text-[11px] text-muted-foreground mb-2">原始描述摘要</p>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{p.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Button className="w-full gap-2 h-11" onClick={() => openPublish()}>
                <Rocket className="w-4 h-4" />
                改款上架到 Shopify
              </Button>
              <div className="flex gap-2">
                {!saved && (
                  <Button variant="outline" className="flex-1 gap-2" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    加入选品库
                  </Button>
                )}
                <Button variant="outline" className="flex-1 gap-2" onClick={() => setShowAgentWorkflow(true)}>
                  <Bot className="w-3.5 h-3.5" />
                  Agent 优化
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {panelCards.map((panel) => (
                <Card key={panel.id} className="card-hover">
                  <CardContent className="p-5 space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{panel.title}</p>
                      <p className="text-xs leading-5 text-muted-foreground mt-1">{panel.desc}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setActivePanel(panel.id)}>
                      打开独立窗口
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Drawer
        open={activePanel === "metrics"}
        onClose={() => setActivePanel(null)}
        title="数据指标解释"
        width="w-full max-w-2xl"
      >
        <div className="p-5 space-y-5">
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">AI 综合评分</span>
                <span className="text-2xl font-black gradient-text">{aiScore > 0 ? aiScore : "—"}</span>
              </div>
              <Progress value={aiScore} color="bg-gradient-to-r from-blue-500 to-violet-500" />
              {selectionMeta.score_summary && <p className="text-sm text-muted-foreground">{selectionMeta.score_summary}</p>}
              {selectionMeta.selection_reason && <p className="text-sm text-muted-foreground leading-6">{selectionMeta.selection_reason}</p>}
            </CardContent>
          </Card>

          {scoreBreakdownEntries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>8 维评分卡</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                {scoreBreakdownEntries.map((item) => (
                  <div key={item.label} className="rounded-xl border border-border bg-secondary px-3 py-3">
                    <p className="text-[11px] text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-base font-semibold text-foreground">{item.value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>核心指标口径</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {keyMetrics.map((metric) => (
                <div key={metric.label} className="rounded-xl border border-border bg-secondary/60 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium text-foreground">{metric.label}</p>
                    <p className={`text-sm font-semibold ${metric.color}`}>{metric.value}</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{metric.formula}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.reason}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </Drawer>

      <Drawer
        open={activePanel === "ai"}
        onClose={() => setActivePanel(null)}
        title="AI 内容与素材"
        width="w-full max-w-3xl"
      >
        <div className="p-5 space-y-5">
          {(p.seo_title || p.ai_description || p.meta_description || (p.alt_tags && p.alt_tags.length > 0)) ? (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-5 space-y-4">
                {p.seo_title && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">商品标题优化</p>
                    <p className="text-sm font-medium text-foreground">{p.seo_title}</p>
                  </div>
                )}
                {p.meta_description && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">Meta 描述</p>
                    <p className="text-sm text-muted-foreground">{p.meta_description}</p>
                  </div>
                )}
                {p.alt_tags && p.alt_tags.length > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-2">图片 Alt 标签</p>
                    <div className="flex flex-wrap gap-2">
                      {p.alt_tags.map((tag, i) => (
                        <span key={i} className="text-[11px] bg-secondary border border-border px-2.5 py-1 rounded-lg">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
                {p.ai_description && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-2">HTML 详情页</p>
                    <div className="text-sm text-muted-foreground prose prose-sm prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: p.ai_description }} />
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card><CardContent className="p-5 text-sm text-muted-foreground">当前还没有 AI 生成内容。</CardContent></Card>
          )}

          {p.images && p.images.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>素材图集</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                {p.images.slice(0, 12).map((img, i) => (
                  <div key={i} className="aspect-square rounded-xl overflow-hidden border border-border bg-secondary">
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </Drawer>

      <Drawer
        open={activePanel === "decision"}
        onClose={() => setActivePanel(null)}
        title="选品决策"
        width="w-full max-w-3xl"
      >
        <div className="p-5 space-y-5">
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">专题池</label>
                  <select
                    value={selectionMeta.weekly_campaign || ""}
                    onChange={e => setSelectionMeta(prev => ({ ...prev, weekly_campaign: e.target.value || undefined }))}
                    className="w-full h-9 rounded-lg border border-border bg-secondary px-3 text-sm"
                  >
                    <option value="">未设置</option>
                    {CAMPAIGNS.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">选品状态</label>
                  <select
                    value={selectionMeta.selection_status || "candidate"}
                    onChange={e => setSelectionMeta(prev => ({ ...prev, selection_status: e.target.value }))}
                    className="w-full h-9 rounded-lg border border-border bg-secondary px-3 text-sm"
                  >
                    {SELECTION_STATUSES.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <Button size="sm" variant="outline" className="gap-2" onClick={runAutoTagging} disabled={autoTagging}>
                  {autoTagging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  自动识别标签
                </Button>
                {taggingMsg && <span className="text-xs text-muted-foreground">{taggingMsg}</span>}
              </div>

              {(selectionMeta.tag_summary || selectionMeta.tag_confidence != null) && (
                <div className="rounded-xl border border-border bg-secondary px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-muted-foreground">自动标签识别结果</span>
                    {selectionMeta.tag_confidence != null && (
                      <span className="text-[11px] font-medium text-foreground">信心 {selectionMeta.tag_confidence}</span>
                    )}
                  </div>
                  {selectionMeta.tag_summary && <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{selectionMeta.tag_summary}</p>}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">季节标签</label>
                  <Input value={(selectionMeta.season_tags || []).join(", ")} onChange={e => setTagField("season_tags", e.target.value)} placeholder="spring, summer" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">节日标签</label>
                  <Input value={(selectionMeta.holiday_tags || []).join(", ")} onChange={e => setTagField("holiday_tags", e.target.value)} placeholder="fathers_day, graduation" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">人群标签</label>
                  <Input value={(selectionMeta.audience_tags || []).join(", ")} onChange={e => setTagField("audience_tags", e.target.value)} placeholder="dad, pet_owner" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">场景标签</label>
                  <Input value={(selectionMeta.scenario_tags || []).join(", ")} onChange={e => setTagField("scenario_tags", e.target.value)} placeholder="gift, bbq, travel" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">刺绣位置</label>
                  <Input value={selectionMeta.embroidery_position || ""} onChange={e => setSelectionMeta(prev => ({ ...prev, embroidery_position: e.target.value }))} placeholder="front cap / chest / tote" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">定制类型</label>
                  <Input value={(selectionMeta.customization_type || []).join(", ")} onChange={e => setTagField("customization_type", e.target.value)} placeholder="name, date, title, line_art" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-muted-foreground">选品理由</label>
                <textarea
                  value={selectionMeta.selection_reason || ""}
                  onChange={e => setSelectionMeta(prev => ({ ...prev, selection_reason: e.target.value }))}
                  placeholder="记录为什么适合本周专题、目标人群和定制表达"
                  className="w-full min-h-24 rounded-lg border border-border bg-secondary px-3 py-2 text-sm resize-y"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-muted-foreground">内容切入口</label>
                <Input value={selectionMeta.content_hook || ""} onChange={e => setSelectionMeta(prev => ({ ...prev, content_hook: e.target.value }))} placeholder="gift for dad / pet memorial / graduation keepsake" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">趋势分</label>
                  <Input type="number" value={selectionMeta.trend_score ?? ""} onChange={e => setSelectionMeta(prev => ({ ...prev, trend_score: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">刺绣适配分</label>
                  <Input type="number" value={selectionMeta.embroidery_fit_score ?? ""} onChange={e => setSelectionMeta(prev => ({ ...prev, embroidery_fit_score: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>复核反馈</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={feedbackOutcome}
                  onChange={e => setFeedbackOutcome(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-secondary px-3 text-sm"
                >
                  <option value="approved">确认通过</option>
                  <option value="featured_confirmed">确认主推</option>
                  <option value="rejected_confirmed">确认淘汰</option>
                  <option value="featured_missed">主推误判</option>
                  <option value="rejected_missed">淘汰误判</option>
                </select>
                <Input value={feedbackAction} onChange={e => setFeedbackAction(e.target.value)} placeholder="next action / keep / redesign / retest" />
              </div>
              <Input value={feedbackReasons} onChange={e => setFeedbackReasons(e.target.value)} placeholder="原因，逗号分隔：custom weak, audience unclear" />
              <textarea
                value={feedbackNotes}
                onChange={e => setFeedbackNotes(e.target.value)}
                placeholder="补充说明这次复核为什么通过、淘汰或误判"
                className="w-full min-h-20 rounded-lg border border-border bg-secondary px-3 py-2 text-sm resize-y"
              />
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" className="gap-2" onClick={saveSelectionFeedback} disabled={savingFeedback}>
                  {savingFeedback ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  保存复核反馈
                </Button>
                {feedbackMsg && <span className="text-xs text-muted-foreground">{feedbackMsg}</span>}
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3 px-1">
            <Button size="sm" className="gap-2" onClick={saveSelectionMeta} disabled={savingSelection}>
              {savingSelection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              保存选品决策
            </Button>
            {selectionMsg && <span className="text-xs text-muted-foreground">{selectionMsg}</span>}
          </div>
        </div>
      </Drawer>

      <Drawer
        open={activePanel === "insights"}
        onClose={() => setActivePanel(null)}
        title="评论与广告洞察"
        width="w-full max-w-2xl"
      >
        <div className="p-5 space-y-5">
          {(p.sentiment_summary || (p.pain_points && p.pain_points.length > 0)) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-violet-400" />
                  AI 评论情感分析
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {p.sentiment_summary && <p className="text-sm text-muted-foreground leading-relaxed">{p.sentiment_summary}</p>}
                {p.pain_points && p.pain_points.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-foreground mb-2">核心痛点（高转化文案素材）</p>
                    <div className="space-y-2">
                      {p.pain_points.map((pt: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="text-amber-400 mt-0.5 shrink-0">•</span>
                          {pt}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {(p.facebook_ad_count != null || p.etsy_favorites != null) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-blue-400" />
                  广告投放数据
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 p-3 rounded-xl bg-secondary border border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">Facebook 广告数量</p>
                    <p className="text-2xl font-bold text-foreground">{p.facebook_ad_count ?? "—"}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">按商品标题关键词与广告文本匹配得到，数量越高说明商业化验证越充分。</p>
                  </div>
                  {p.etsy_favorites != null && (
                    <div className="border-l border-border pl-4 ml-4">
                      <p className="text-xs text-muted-foreground">Etsy 收藏数</p>
                      <p className="text-2xl font-bold text-foreground">{formatNumber(p.etsy_favorites)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">收藏数反映长期兴趣积累，用于辅助判断内容接受度。</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </Drawer>

      {/* Publish Dialog */}
      {showPublish && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPublish(false)}>
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CardHeader className="pb-3 sticky top-0 bg-card z-10 border-b border-border">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Rocket className="w-4 h-4 text-primary" />
                改款上架到 Shopify
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {publishResult ? (
                <div className="text-center py-8 space-y-3">
                  {publishResult.error ? (
                    <>
                      <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
                      <p className="text-sm text-destructive">{publishResult.error}</p>
                      <Button variant="outline" size="sm" onClick={() => setPublishResult(null)}>重试</Button>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                      <p className="text-sm text-foreground font-medium">上架成功！</p>
                      {publishResult.url && (
                        <a href={publishResult.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline block">
                          在 Shopify 查看商品
                        </a>
                      )}
                      <Button size="sm" className="mt-2" onClick={() => setShowPublish(false)}>关闭</Button>
                    </>
                  )}
                </div>
              ) : (
                <form onSubmit={handlePublish} className="space-y-5">

                  {/* 店铺选择 */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">目标店铺</label>
                    {shopsLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 加载店铺...
                      </div>
                    ) : shops.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        尚未绑定店铺，请先前往{" "}
                        <Link href="/shops" className="text-primary underline" onClick={() => setShowPublish(false)}>店铺管理</Link> 绑定
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {shops.map(s => (
                          <button key={s.id} type="button" onClick={() => setSelectedShop(s.id)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${selectedShop === s.id ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                            {s.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* AI 生成文案 */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground shrink-0">AI 文案</span>
                    <select
                      value={selectedModel}
                      onChange={e => setSelectedModel(e.target.value)}
                      disabled={generatingCopy}
                      className="flex-1 text-xs px-2 py-1 rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {AVAILABLE_MODELS.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs h-7 shrink-0 border-violet-500/40 text-violet-400 hover:bg-violet-500/10"
                      onClick={handleGenerateCopy}
                      disabled={generatingCopy}
                    >
                      {generatingCopy
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> 生成中...</>
                        : <><Bot className="w-3 h-3" /> 生成商品标题及详情</>
                      }
                    </Button>
                  </div>
                  {copyError && <p className="text-xs text-destructive">{copyError}</p>}

                  {/* 标题 */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">商品标题</label>
                    <Input value={publishTitle} onChange={e => setPublishTitle(e.target.value)} className="text-xs" />
                  </div>

                  {/* 描述 */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">商品描述</label>
                    <textarea
                      value={publishDesc}
                      onChange={e => setPublishDesc(e.target.value)}
                      rows={4}
                      placeholder="商品详细描述（支持 HTML）"
                      className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  {/* 价格 + 标签 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">基础售价 (USD)</label>
                      <Input type="number" step="0.01" min="0.01" value={publishPrice} onChange={e => setPublishPrice(e.target.value)} className="text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">标签 (逗号分隔)</label>
                      <Input value={publishTags} onChange={e => setPublishTags(e.target.value)} placeholder="hoodie,custom,gift" className="text-xs" />
                    </div>
                  </div>

                  {/* 尺码变体 */}
                  <div className="space-y-2 border border-border rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEnableSizes(v => !v)}
                        className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${enableSizes ? "bg-primary" : "bg-muted border border-border"}`}
                      >
                        <span className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${enableSizes ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                      <span className="text-xs font-medium text-foreground">启用尺码变体</span>
                    </div>
                    {enableSizes && (
                      <div className="space-y-2 mt-2">
                        <div className="flex flex-wrap gap-1.5">
                          {APPAREL_SIZES.map(size => (
                            <button
                              key={size}
                              type="button"
                              onClick={() => toggleSize(size)}
                              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${selectedSizes.has(size) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {sizeVariants.filter(v => selectedSizes.has(v.size)).map(v => (
                            <div key={v.size} className="space-y-1">
                              <label className="text-[10px] text-muted-foreground">{v.size} 价格</label>
                              <Input
                                type="number" step="0.01" min="0.01"
                                placeholder={publishPrice || "0"}
                                onChange={e => updateSizePrice(v.size, e.target.value)}
                                className="text-xs h-7 px-2"
                              />
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground">留空则使用基础售价</p>
                      </div>
                    )}
                  </div>

                  {/* 额外图片上传 */}
                  <div className="space-y-2 border border-border rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">额外图片</span>
                      <label className={`text-xs px-3 py-1 rounded-lg border border-dashed border-border cursor-pointer hover:border-primary hover:text-primary transition-colors ${uploadingImg ? "opacity-50 pointer-events-none" : ""}`}>
                        {uploadingImg ? <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />上传中...</span> : "+ 上传图片"}
                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                      </label>
                    </div>
                    {extraImages.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {extraImages.map((url, i) => (
                          <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setExtraImages(prev => prev.filter((_, j) => j !== i))}
                              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs"
                            >✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">主图会自动从商品提取，这里可添加更多展示图</p>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <Button type="submit" className="flex-1 gap-1.5" disabled={publishing || !selectedShop}>
                      {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                      {publishing ? "上架中..." : "立即上架"}
                    </Button>
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setShowPublish(false)}>取消</Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Agent 工作流 */}
      {showAgentWorkflow && product && (
        <AgentWorkflow
          productId={product.id}
          productTitle={product.title}
          productImage={product.main_image ?? undefined}
          initialExtraImages={extraImages}
          onAddExtraImage={(url) => setExtraImages((prev) => prev.includes(url) ? prev : [...prev, url])}
          onRemoveExtraImage={(url) => setExtraImages((prev) => prev.filter((item) => item !== url))}
          onClose={() => setShowAgentWorkflow(false)}
          onPublish={({ title, description, extraImages }) => {
            openPublish({ title, description, extraImages })
          }}
        />
      )}

      {/* AI 修图弹窗 */}
      {showImageStudio && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowImageStudio(false)}>
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                AI 图片工坊
              </CardTitle>
              <button onClick={() => setShowImageStudio(false)} className="text-muted-foreground hover:text-foreground">
                <Check className="w-4 h-4 opacity-0" />✕
              </button>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* 模型选择 + 原图开关 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">图片模型</label>
                  {product?.main_image && product.main_image.startsWith("http") && (
                    <button
                      onClick={() => setUseRefImg(v => !v)}
                      className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg border transition-colors ${useRefImg ? "border-violet-500/50 bg-violet-500/10 text-violet-400" : "border-border text-muted-foreground hover:text-foreground"}`}
                    >
                      <ImageIcon className="w-3 h-3" />
                      {useRefImg ? "图生图" : "文生图"}
                    </button>
                  )}
                </div>
                <select
                  value={imgModel}
                  onChange={e => setImgModel(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {IMAGE_MODELS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* 尺寸 + 质量 */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">尺寸</label>
                  <select value={imgSize} onChange={e => setImgSize(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                    {IMAGE_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">质量</label>
                  <select value={imgQuality} onChange={e => setImgQuality(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                    {IMAGE_QUALITIES.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
                  </select>
                </div>
              </div>

              {/* 快捷提示词 */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">快捷风格</label>
                <div className="flex flex-wrap gap-1.5">
                  {IMAGE_PROMPTS.map(t => (
                    <button
                      key={t.label}
                      onClick={() => setImgPrompt(t.prompt)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                        imgPrompt === t.prompt
                          ? "border-violet-500/50 bg-violet-500/10 text-violet-400"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 自定义 Prompt */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">提示词（可自定义）</label>
                <textarea
                  value={imgPrompt}
                  onChange={e => setImgPrompt(e.target.value)}
                  rows={3}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="描述你想要的图片效果..."
                />
              </div>

              {imgError && <p className="text-xs text-destructive">{imgError}</p>}

              <Button
                className="w-full gap-2"
                onClick={handleGenerateImage}
                disabled={generatingImg || !imgPrompt.trim()}
              >
                {generatingImg
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> AI 生成中，请稍候...</>
                  : <><Sparkles className="w-4 h-4" /> 生成图片</>
                }
              </Button>

              {/* 生成结果 */}
              {generatedImgs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">生成结果（点击加入上架图片）</p>
                  <div className="grid grid-cols-2 gap-3">
                    {generatedImgs.map((url, i) => (
                      <div key={i} className="relative group/gen aspect-square rounded-xl overflow-hidden border border-border bg-secondary">
                        <img
                          src={url.startsWith('/') ? `${STATIC_BASE}${url}` : url}
                          alt={`generated-${i}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/gen:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            onClick={() => addGeneratedToPublish(url)}
                            className="text-xs bg-primary text-white px-3 py-1.5 rounded-lg font-medium"
                          >
                            加入上架
                          </button>
                          <a
                            href={url.startsWith('/') ? `${STATIC_BASE}${url}` : url}
                            download
                            className="text-xs bg-secondary text-foreground px-3 py-1.5 rounded-lg font-medium flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" /> 下载
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
