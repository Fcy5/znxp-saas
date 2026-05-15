"use client"
import { useEffect, useState, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { productApi, shopApi, type LibraryProductCard, type PageInfo, type Shop } from "@/lib/api"
import { WEEKLY_CAMPAIGNS } from "@/lib/selection"
import { ProductCard as ProductCardComponent } from "@/components/product/product-card"
import { AlertTriangle, Bookmark, CheckSquare, Loader2, PackageOpen, Square, Store, X } from "lucide-react"
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
  ...WEEKLY_CAMPAIGNS.map(campaign => ({ value: campaign, label: campaign })),
]

const SCORE_OPTIONS = [
  { value: "all", label: "全部分数" },
  { value: "80", label: "80+" },
  { value: "60", label: "60+" },
  { value: "40", label: "40+" },
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
  const [scoreFilter, setScoreFilter] = useState("all")
  const [reviewFilter, setReviewFilter] = useState("all")
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchMsg, setBatchMsg] = useState("")

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

  const clearSelection = () => setSelectedIds(new Set())

  const toggleSelected = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runBatchUpdate = async (body: { selection_status?: string; manual_review_flag?: boolean }) => {
    if (selectedIds.size === 0) return
    setBatchLoading(true)
    setBatchMsg("")
    try {
      const res = await productApi.batchUpdateSelection({
        product_ids: [...selectedIds],
        ...body,
      })
      setBatchMsg(res.message || "批量更新成功")
      clearSelection()
      await load(page, activeShopId)
    } catch (err: unknown) {
      setBatchMsg(err instanceof Error ? err.message : "批量更新失败")
    } finally {
      setBatchLoading(false)
    }
  }

  const load = useCallback(async (p: number, shopId?: number) => {
    setLoading(true)
    try {
      const res = await productApi.myLibrary(p, 20, undefined, shopId, true)
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
    router.push(`/selection/library?${params.toString()}`)
  }

  const activeShop = shops.find(s => s.id === activeShopId)
  const visibleProducts = products.filter(p => {
    const statusOk = statusFilter === "all" || p.selection_status === statusFilter
    const campaignOk = campaignFilter === "all" || p.weekly_campaign === campaignFilter
    const scoreOk = scoreFilter === "all" || (p.final_selection_score || 0) >= Number(scoreFilter)
    const reviewOk =
      reviewFilter === "all" ||
      (reviewFilter === "needs_review" && !!p.manual_review_flag) ||
      (reviewFilter === "reviewed" && !p.manual_review_flag)
    return statusOk && campaignOk && scoreOk && reviewOk
  })
  const statusLabel = (value?: string) => {
    if (value === "featured") return "主推"
    if (value === "shortlisted") return "重点"
    if (value === "rejected") return "淘汰"
    if (value === "candidate") return "候选"
    return value || ""
  }
  const statusDot = (value?: string) => {
    if (value === "featured") return "bg-amber-400"
    if (value === "shortlisted") return "bg-sky-400"
    if (value === "rejected") return "bg-zinc-400"
    return "bg-emerald-400"
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
              {pageInfo ? `本周视图共 ${pageInfo.total} 件商品` : "本周选品库"}
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

      <div className="flex items-center gap-2 flex-wrap">
        {SCORE_OPTIONS.map(option => (
          <button
            key={option.value}
            onClick={() => setScoreFilter(option.value)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
              scoreFilter === option.value
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-medium"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {[
          { value: "all", label: "全部复核" },
          { value: "needs_review", label: "待复核" },
          { value: "reviewed", label: "已复核" },
        ].map(option => (
          <button
            key={option.value}
            onClick={() => setReviewFilter(option.value)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
              reviewFilter === option.value
                ? "bg-amber-500/10 border-amber-500/30 text-amber-300 font-medium"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setBatchMode(v => !v); clearSelection(); setBatchMsg("") }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${
              batchMode
                ? "bg-primary/10 border-primary/30 text-primary font-medium"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
            {batchMode ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
            批量模式
          </button>
          {batchMode && <span className="text-xs text-muted-foreground">已选 {selectedIds.size} 件</span>}
        </div>

        {batchMode && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" disabled={batchLoading || selectedIds.size === 0} onClick={() => runBatchUpdate({ selection_status: "shortlisted" })}>设为重点</Button>
            <Button size="sm" variant="outline" disabled={batchLoading || selectedIds.size === 0} onClick={() => runBatchUpdate({ selection_status: "featured" })}>设为主推</Button>
            <Button size="sm" variant="outline" disabled={batchLoading || selectedIds.size === 0} onClick={() => runBatchUpdate({ selection_status: "rejected" })}>设为淘汰</Button>
            <Button size="sm" variant="outline" disabled={batchLoading || selectedIds.size === 0} onClick={() => runBatchUpdate({ manual_review_flag: true })}>标记复核</Button>
            <Button size="sm" variant="outline" disabled={batchLoading || selectedIds.size === 0} onClick={() => runBatchUpdate({ manual_review_flag: false })}>完成复核</Button>
          </div>
        )}
      </div>

      {batchMsg && (
        <div className="text-xs text-muted-foreground">{batchMsg}</div>
      )}

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
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
            {visibleProducts.map((p) => (
              <div key={p.id} className="relative group/card flex flex-col gap-2">
                {batchMode && (
                  <button
                    onClick={() => toggleSelected(p.id)}
                    className={`absolute left-2 bottom-2 z-20 w-6 h-6 rounded-md border flex items-center justify-center ${
                      selectedIds.has(p.id)
                        ? "bg-primary border-primary text-white"
                        : "bg-black/60 border-white/20 text-white"
                    }`}
                  >
                    {selectedIds.has(p.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  </button>
                )}
                <ProductCardComponent product={p} />
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
                {(p.selection_status || p.weekly_campaign || p.manual_review_flag) && (
                  <div className="min-h-[3rem] rounded-xl border border-border bg-card/70 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      {p.selection_status && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-foreground">
                          <span className={`h-1.5 w-1.5 rounded-full ${statusDot(p.selection_status)}`} />
                          {statusLabel(p.selection_status)}
                        </span>
                      )}
                      {p.weekly_campaign && (
                        <span className="inline-flex items-center rounded-full bg-secondary px-2 py-1 text-foreground">
                          {p.weekly_campaign}
                        </span>
                      )}
                      {p.manual_review_flag && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-amber-300 border border-amber-500/20">
                          <AlertTriangle className="h-3 w-3" />
                          待复核
                        </span>
                      )}
                    </div>
                  </div>
                )}
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
