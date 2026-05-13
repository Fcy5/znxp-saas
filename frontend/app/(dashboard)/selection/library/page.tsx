"use client"
import { useEffect, useState, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { productApi, shopApi, type LibraryProductCard, type PageInfo, type Shop } from "@/lib/api"
import { ProductCard as ProductCardComponent } from "@/components/product/product-card"
import { Badge } from "@/components/ui/badge"
import { Bookmark, Loader2, PackageOpen, X, Store } from "lucide-react"
import { Button } from "@/components/ui/button"

const STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "candidate", label: "候选" },
  { value: "shortlisted", label: "重点" },
  { value: "featured", label: "主推" },
  { value: "rejected", label: "淘汰" },
]

const CAMPAIGN_OPTIONS = [
  { value: "all", label: "全部专题" },
  { value: "Memorial Day", label: "Memorial Day" },
  { value: "Father's Day", label: "Father's Day" },
  { value: "Mother's Day", label: "Mother's Day" },
  { value: "Graduation", label: "Graduation" },
  { value: "Summer", label: "Summer" },
  { value: "Valentine's Day", label: "Valentine's Day" },
  { value: "Evergreen Gifts", label: "Evergreen Gifts" },
]

function LibraryContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const shopIdParam = searchParams.get("shop_id")
  const activeShopId = shopIdParam ? Number(shopIdParam) : undefined

  const [products, setProducts] = useState<LibraryProductCard[]>([])
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<number | null>(null)
  const [shops, setShops] = useState<Shop[]>([])
  const [statusFilter, setStatusFilter] = useState("all")
  const [campaignFilter, setCampaignFilter] = useState("all")

  useEffect(() => {
    shopApi.list().then(r => setShops(r.data || [])).catch(() => {})
  }, [])

  const handleRemove = async (id: number) => {
    setRemoving(id)
    try {
      await productApi.unsave(id)
      setProducts(prev => prev.filter(p => p.id !== id))
      setPageInfo(prev => prev ? { ...prev, total: prev.total - 1 } : prev)
    } finally {
      setRemoving(null)
    }
  }

  const load = useCallback(async (p: number, shopId?: number) => {
    setLoading(true)
    try {
      const res = await productApi.myLibrary(p, 20, undefined, shopId)
      setProducts(res.data || [])
      setPageInfo(res.page_info || null)
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setPage(1)
    load(1, activeShopId)
  }, [activeShopId, load])

  useEffect(() => {
    load(page, activeShopId)
  }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  const setShopFilter = (shopId?: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (shopId) params.set("shop_id", String(shopId))
    else params.delete("shop_id")
    router.push(`/library?${params.toString()}`)
  }

  const activeShop = shops.find(s => s.id === activeShopId)
  const visibleProducts = products.filter(p => {
    const statusOk = statusFilter === "all" || p.selection_status === statusFilter
    const campaignOk = campaignFilter === "all" || p.weekly_campaign === campaignFilter
    return statusOk && campaignOk
  })
  const statusTone = (value?: string) => {
    if (value === "featured") return "warning"
    if (value === "shortlisted") return "info"
    if (value === "rejected") return "default"
    return "success"
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Bookmark className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">我的选品库</h1>
            <p className="text-xs text-muted-foreground">
              {pageInfo ? `共 ${pageInfo.total} 件商品` : "已收藏的商品"}
              {activeShop ? ` · ${activeShop.name}` : ""}
            </p>
          </div>
        </div>

        {/* Shop filter tabs */}
        {shops.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShopFilter(undefined)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                !activeShopId
                  ? "bg-primary/10 border-primary/30 text-primary font-medium"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
            >
              全部
            </button>
            {shops.map(shop => (
              <button
                key={shop.id}
                onClick={() => setShopFilter(shop.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                  activeShopId === shop.id
                    ? "bg-primary/10 border-primary/30 text-primary font-medium"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                }`}
              >
                <Store className="w-3 h-3" />
                {shop.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_OPTIONS.map(option => (
          <button
            key={option.value}
            onClick={() => setStatusFilter(option.value)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
              statusFilter === option.value
                ? "bg-primary/10 border-primary/30 text-primary font-medium"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {CAMPAIGN_OPTIONS.map(option => (
          <button
            key={option.value}
            onClick={() => setCampaignFilter(option.value)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
              campaignFilter === option.value
                ? "bg-violet-500/10 border-violet-500/30 text-violet-300 font-medium"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : visibleProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <PackageOpen className="w-12 h-12 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium text-foreground">当前筛选下暂无商品</p>
            <p className="text-xs text-muted-foreground mt-1">
              {activeShopId
                ? "该店铺下暂无推品，可前往 AI 运营工作台运行智能推品"
                : "在选品大厅点击商品卡片上的 + 按钮即可加入库"}
            </p>
          </div>
          <div className="flex gap-2">
            {activeShopId && (
              <Button variant="outline" size="sm" onClick={() => router.push("/operations/agent")}>
                AI 运营推品
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => router.push("/products")}>
              前往选品大厅
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {visibleProducts.map((p) => (
              <div key={p.id} className="relative group/card">
                <ProductCardComponent product={p} />
                <div className="absolute left-2 top-2 z-10 flex flex-col gap-1 max-w-[75%]">
                  {p.selection_status && (
                    <Badge variant={statusTone(p.selection_status) as "warning" | "info" | "default" | "success"} className="text-[10px] px-1.5 py-0.5">
                      {p.selection_status}
                    </Badge>
                  )}
                  {p.weekly_campaign && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 truncate">
                      {p.weekly_campaign}
                    </Badge>
                  )}
                </div>
                <button
                  onClick={() => handleRemove(p.id)}
                  disabled={removing === p.id}
                  className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-black/60 border border-white/10 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-destructive/80 disabled:cursor-not-allowed"
                  title="从选品库移除"
                >
                  {removing === p.id
                    ? <Loader2 className="w-3 h-3 text-white animate-spin" />
                    : <X className="w-3 h-3 text-white" />}
                </button>
              </div>
            ))}
          </div>

          {pageInfo && pageInfo.total_pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
              <span className="text-xs text-muted-foreground px-3">{page} / {pageInfo.total_pages}</span>
              <Button variant="outline" size="sm" disabled={page >= pageInfo.total_pages} onClick={() => setPage(p => p + 1)}>下一页</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
      <LibraryContent />
    </Suspense>
  )
}
