"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Header } from "@/components/layout/header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { productApi, shopApi, publishApi, uploadApi, agentApi, AVAILABLE_MODELS, IMAGE_MODELS, IMAGE_PROMPTS, STATIC_BASE, type ProductDetail, type Shop, type SizeVariant } from "@/lib/api"
import { AgentWorkflow } from "@/components/agent/agent-workflow"

const APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"]

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

  // AI 修图
  const [showImageStudio, setShowImageStudio] = useState(false)
  const [imgModel, setImgModel] = useState(IMAGE_MODELS[0].value)
  const [imgPrompt, setImgPrompt] = useState(IMAGE_PROMPTS[0].prompt)
  const [generatingImg, setGeneratingImg] = useState(false)
  const [imgError, setImgError] = useState("")
  const [generatedImgs, setGeneratedImgs] = useState<string[]>([])

  const handleGenerateImage = async () => {
    if (!imgPrompt.trim()) return
    setGeneratingImg(true)
    setImgError("")
    try {
      const productContext = product
        ? `Product: ${product.title}${product.category ? `, Category: ${product.category}` : ""}. `
        : ""
      const finalPrompt = `${productContext}${imgPrompt}`
      const referenceUrl = product?.main_image && product.main_image.startsWith("http")
        ? product.main_image
        : undefined
      const res = await agentApi.generateImage(finalPrompt, imgModel, referenceUrl)
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
    setExtraImages(prev => prev.includes(url) ? prev : [...prev, url])
    setShowImageStudio(false)
    if (!showPublish) openPublish()
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

  const openPublish = async () => {
    if (product) {
      setPublishTitle(product.title)
      setPublishDesc((product as any).description || "")
      setPublishPrice(product.price?.toString() || "")
      setPublishTags(product.category || "")
    }
    setPublishResult(null)
    setExtraImages([])
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
          {/* Left: Image + Score */}
          <div className="lg:col-span-2 space-y-4">
            <div className="relative group/img aspect-square rounded-2xl bg-secondary overflow-hidden flex items-center justify-center border border-border">
              {p.main_image ? (
                <img src={p.main_image} alt={p.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
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

            {/* Score card */}
            <Card className="glow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-muted-foreground">AI 综合评分</span>
                  <span className="text-3xl font-black gradient-text">{aiScore > 0 ? aiScore : "—"}</span>
                </div>
                <Progress value={aiScore} color="bg-gradient-to-r from-blue-500 to-violet-500" />
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {[
                    { label: "趋势热度", value: p.sales_trend ? Math.min(Math.round(p.sales_trend), 100) : 0 },
                    { label: "利润空间", value: p.profit_margin_estimate ? Math.min(Math.round(p.profit_margin_estimate), 100) : 0 },
                    { label: "用户评价", value: p.review_score ? Math.round(p.review_score * 20) : 0 },
                    { label: "社媒热度", value: p.tiktok_views ? Math.min(Math.round(p.tiktok_views / 100000), 100) : 0 },
                  ].map(m => (
                    <div key={m.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{m.label}</span>
                        <span className="text-foreground">{m.value}</span>
                      </div>
                      <Progress value={m.value} className="h-1" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Extra images */}
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

          {/* Right: Info */}
          <div className="lg:col-span-3 space-y-4">
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
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-1 w-fit">
                    <ExternalLink className="w-3 h-3" /> 查看原链接
                  </a>
                )
              )}
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { icon: ShoppingCart, label: "市场价格", value: p.price ? `$${p.price}` : "—", color: "text-foreground" },
                { icon: TrendingUp, label: "销量增速", value: p.sales_trend ? `+${p.sales_trend}%` : "—", color: "text-emerald-400" },
                { icon: Target, label: "预估利润率", value: p.profit_margin_estimate ? `${p.profit_margin_estimate}%` : "—", color: "text-emerald-400" },
                { icon: Star, label: "用户评分", value: p.review_score ? `${p.review_score}${p.review_count ? ` (${formatNumber(p.review_count)})` : ""}` : "—", color: "text-amber-400" },
                { icon: Play, label: "TikTok播放", value: p.tiktok_views ? formatNumber(p.tiktok_views) : "—", color: "text-pink-400" },
                { icon: Search, label: "GMC搜索量", value: p.gmc_search_volume ? formatNumber(p.gmc_search_volume) : "—", color: "text-blue-400" },
              ].map(m => (
                <div key={m.label} className="bg-secondary rounded-xl p-3 border border-border">
                  <div className="flex items-center gap-1.5 mb-1">
                    <m.icon className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">{m.label}</span>
                  </div>
                  <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>

            {/* Description */}
            {p.description && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{p.description}</p>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <div className="space-y-2">
              <Button className="w-full gap-2 h-11" onClick={openPublish}>
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
          </div>
        </div>

        {/* Bottom: Sentiment + Pain Points */}
        {(p.sentiment_summary || (p.pain_points && p.pain_points.length > 0)) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-violet-400" />
                AI 评论情感分析
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {p.sentiment_summary && (
                <p className="text-sm text-muted-foreground leading-relaxed">{p.sentiment_summary}</p>
              )}
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

        {/* FB Ad Count */}
        {p.facebook_ad_count != null && (
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
                  <p className="text-2xl font-bold text-foreground">{p.facebook_ad_count}</p>
                </div>
                {p.etsy_favorites != null && (
                  <div className="border-l border-border pl-4 ml-4">
                    <p className="text-xs text-muted-foreground">Etsy 收藏数</p>
                    <p className="text-2xl font-bold text-foreground">{formatNumber(p.etsy_favorites)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

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
                        : <><Bot className="w-3 h-3" /> 生成 SEO 文案</>
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
          onClose={() => setShowAgentWorkflow(false)}
          onPublish={({ title, description, extraImages }) => {
            setPublishTitle(title)
            setPublishDesc(description)
            setExtraImages(extraImages)
            openPublish()
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
                            href={`http://localhost:8000${url}`}
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
