"use client"
import { useState } from "react"
import { STATIC_BASE } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNumber } from "@/lib/utils"
import { TrendingUp, Star, Play, BarChart2, Plus, Bot, ExternalLink, Rocket, Loader2, AlertCircle, CheckCircle2, Check } from "lucide-react"
import Link from "next/link"
import { shopApi, publishApi, productApi, type Shop } from "@/lib/api"

interface Product {
  id: number
  title: string
  source_platform: string
  source_url?: string
  main_image?: string
  price?: number
  sales_trend?: number
  review_score?: number
  review_count?: number
  tiktok_views?: number
  facebook_ad_count?: number
  ai_score?: number
  profit_margin_estimate?: number
  category?: string
  description?: string
}

const platformColors: Record<string, string> = {
  amazon: "warning",
  etsy: "info",
  tiktok: "danger",
  facebook: "default",
}

export function ProductCard({
  product,
  selectable = false,
  selected = false,
  onSelect,
}: {
  product: Product
  selectable?: boolean
  selected?: boolean
  onSelect?: (id: number) => void
}) {
  const [showPublish, setShowPublish] = useState(false)
  const [shops, setShops] = useState<Shop[]>([])
  const [shopsLoading, setShopsLoading] = useState(false)
  const [selectedShop, setSelectedShop] = useState<number | null>(null)
  const [title, setTitle] = useState(product.title)
  const [price, setPrice] = useState(product.price?.toString() || "")
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<{ url?: string; error?: string } | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (saved || saving) return
    setSaving(true)
    try {
      await productApi.save(product.id)
      setSaved(true)
    } catch {
      // already saved or error - show saved anyway
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const openPublish = async () => {
    setShowPublish(true)
    setPublishResult(null)
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

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedShop) return
    setPublishing(true)
    try {
      const res = await publishApi.publish({
        product_id: product.id,
        shop_id: selectedShop,
        title,
        price: price ? parseFloat(price) : undefined,
      })
      setPublishResult({ url: res.data?.shopify_product_url || "" })
    } catch (err: unknown) {
      setPublishResult({ error: err instanceof Error ? err.message : "上架失败" })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <>
      <div
        className={`group relative rounded-xl border bg-card overflow-hidden card-hover flex flex-col transition-all ${selected ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
        onClick={selectable ? (e) => { e.preventDefault(); onSelect?.(product.id) } : undefined}
      >
        {/* Checkbox overlay in batch mode */}
        {selectable && (
          <div className={`absolute top-2.5 left-2.5 z-10 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer ${selected ? "bg-primary border-primary" : "bg-black/40 border-white/60"}`}
            onClick={e => { e.preventDefault(); e.stopPropagation(); onSelect?.(product.id) }}>
            {selected && <Check className="w-3 h-3 text-white" />}
          </div>
        )}
        {/* Image — 点击跳详情 */}
        <Link href={`/products/${product.id}`} className="block" onClick={selectable ? e => e.preventDefault() : undefined}>
        <div className="relative aspect-square bg-secondary overflow-hidden">
          {product.main_image ? (
            <img
              src={product.main_image.startsWith('/') ? `${STATIC_BASE}${product.main_image}` : product.main_image}
              alt={product.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-5xl">🛍️</div>
          )}

          {/* AI Score */}
          {product.ai_score && (
            <div className="absolute top-2.5 right-2.5 flex items-center gap-1 bg-black/70 backdrop-blur px-2 py-1 rounded-lg border border-white/10">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-bold text-white">AI {Math.round(product.ai_score)}</span>
            </div>
          )}

          {/* Platform */}
          {!selectable && (
            <div className="absolute top-2.5 left-2.5">
              <Badge variant={(platformColors[product.source_platform] as "warning" | "info" | "danger" | "default") || "outline"} className="capitalize text-[10px]">
                {product.source_platform}
              </Badge>
            </div>
          )}

          {/* Trend overlay on hover */}
          {product.sales_trend && product.sales_trend > 0 && (
            <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 bg-emerald-500/90 px-2 py-0.5 rounded-md">
              <TrendingUp className="w-2.5 h-2.5 text-white" />
              <span className="text-[10px] font-bold text-white">+{product.sales_trend.toFixed(0)}%</span>
            </div>
          )}

          {/* TikTok play button */}
          {product.source_platform === "tiktok" && product.source_url && (
            <a
              href={product.source_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur border border-white/40 flex items-center justify-center">
                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
              </div>
            </a>
          )}
        </div>
        </Link>

        {/* Content */}
        <Link href={`/products/${product.id}`} className="flex flex-col flex-1 p-3.5 hover:bg-accent/20 transition-colors" onClick={selectable ? e => e.preventDefault() : undefined}>
          <h3 className="text-xs font-medium text-foreground line-clamp-2 mb-3 leading-relaxed">{product.title}</h3>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {product.review_score && (
              <div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2 py-1.5">
                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                <span className="text-xs text-foreground font-medium">{product.review_score}</span>
                {product.review_count && <span className="text-[10px] text-muted-foreground">({formatNumber(product.review_count)})</span>}
              </div>
            )}
            {product.tiktok_views && (
              <div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2 py-1.5">
                <Play className="w-3 h-3 text-pink-400 fill-pink-400" />
                <span className="text-xs text-foreground font-medium">{formatNumber(product.tiktok_views)}</span>
              </div>
            )}
            {product.facebook_ad_count && (
              <div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2 py-1.5">
                <BarChart2 className="w-3 h-3 text-blue-400" />
                <span className="text-xs text-foreground font-medium">{product.facebook_ad_count} 广告</span>
              </div>
            )}
            {product.profit_margin_estimate && (
              <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1.5">
                <span className="text-xs text-emerald-400 font-semibold">{product.profit_margin_estimate.toFixed(0)}% 利润</span>
              </div>
            )}
          </div>

          {/* Price */}
          <div className="mt-auto pt-2 border-t border-border">
            <span className="text-sm font-bold text-foreground">US${product.price?.toFixed(2) ?? "--"}</span>
          </div>
        </Link>

        {/* Actions — outside Link to avoid nested click conflicts */}
        <div className="flex gap-1.5 px-3.5 pb-3">
          <Button size="icon" variant="ghost" className={`w-7 h-7 ${saved ? "text-emerald-400" : ""}`} title="加入库" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          </Button>
          <Button size="icon" variant="ghost" className="w-7 h-7 text-primary hover:text-primary" title="改款上架" onClick={openPublish}>
            <Rocket className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Publish Dialog */}
      {showPublish && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowPublish(false)}>
          <Card className="w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Rocket className="w-4 h-4 text-primary" />
                改款上架到 Shopify
              </CardTitle>
            </CardHeader>
            <CardContent>
              {publishResult ? (
                <div className="text-center py-4 space-y-3">
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
                        <a href={publishResult.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                          在 Shopify 查看
                        </a>
                      )}
                      <Button size="sm" className="w-full mt-2" onClick={() => setShowPublish(false)}>关闭</Button>
                    </>
                  )}
                </div>
              ) : (
                <form onSubmit={handlePublish} className="space-y-4">
                  {/* Shop selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">目标店铺</label>
                    {shopsLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 加载店铺...
                      </div>
                    ) : shops.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        尚未绑定店铺，请先前往{" "}
                        <Link href="/shops" className="text-primary underline" onClick={() => setShowPublish(false)}>
                          店铺管理
                        </Link>{" "}
                        绑定
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {shops.map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSelectedShop(s.id)}
                            className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors ${
                              selectedShop === s.id
                                ? "border-primary/50 bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {s.name} <span className="text-muted-foreground">({s.domain})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Title override */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">商品标题（可修改）</label>
                    <Input value={title} onChange={e => setTitle(e.target.value)} className="text-xs" />
                  </div>

                  {/* Price override */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">售价 USD（可修改）</label>
                    <Input
                      type="number" step="0.01" min="0.01"
                      value={price} onChange={e => setPrice(e.target.value)}
                      className="text-xs"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button type="submit" className="flex-1 gap-1.5" disabled={publishing || !selectedShop}>
                      {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                      立即上架
                    </Button>
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setShowPublish(false)}>取消</Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
