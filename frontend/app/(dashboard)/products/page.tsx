"use client"
import { useEffect, useState, useCallback } from "react"
import { Header } from "@/components/layout/header"
import { ProductCard } from "@/components/product/product-card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Search, Sparkles, Filter, Loader2, ChevronLeft, ChevronRight, CheckSquare, Square, Plus, X } from "lucide-react"
import { productApi, type ProductCard as ProductCardType } from "@/lib/api"
import { Button } from "@/components/ui/button"

const categories = ["全部", "Apparel", "Accessories", "Gifts", "Home Decor", "Baby", "Kitchen", "Wedding", "Stationery", "Other"]
const platforms = ["全部", "amazon", "etsy", "shopify", "google", "tiktok"]
const shopifyBrands = [
  "全部",
  "foryourcustom", "couplehoodies", "giantbighands", "petieisland",
  "presentMalls", "loversdovey", "petfiestas", "Embroly", "Nowzent",
  "nowzen", "The Urban Walks", "printerval", "pawaviva", "custommybuddy",
  "Present Malls", "theurbanwalks",
]
const sortOptions = [
  { label: "AI 评分", value: "ai_score" },
  { label: "销量增速", value: "sales_trend" },
  { label: "TikTok 热度", value: "tiktok_views" },
  { label: "利润率", value: "profit_margin_estimate" },
]

export default function ProductsPage() {
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [category, setCategory] = useState("全部")
  const [platform, setPlatform] = useState("全部")
  const [shopifyBrand, setShopifyBrand] = useState("全部")
  const [sort, setSort] = useState("ai_score")
  const [page, setPage] = useState(1)

  const [products, setProducts] = useState<ProductCardType[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)

  // 批量操作
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchSaving, setBatchSaving] = useState(false)
  const [batchMsg, setBatchMsg] = useState("")

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await productApi.search({
        page,
        page_size: 12,
        category: category === "全部" ? null : category,
        source_platform: platform === "全部" ? null : platform,
        brand: (platform === "shopify" && shopifyBrand !== "全部") ? shopifyBrand : null,
        keyword: search || null,
        sort_by: sort,
        sort_order: "desc",
      })
      setProducts(res.data)
      setTotal(res.page_info.total)
      setTotalPages(res.page_info.total_pages)
    } catch (e) {
      console.error("Failed to fetch products:", e)
    } finally {
      setLoading(false)
    }
  }, [page, category, platform, shopifyBrand, search, sort])

  useEffect(() => { fetchProducts() }, [fetchProducts])
  useEffect(() => { setPage(1) }, [category, platform, shopifyBrand, search, sort])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(products.map(p => p.id)))
  const clearSelect = () => setSelectedIds(new Set())

  const handleBatchSave = async () => {
    if (selectedIds.size === 0) return
    setBatchSaving(true); setBatchMsg("")
    try {
      const res = await productApi.batchSave([...selectedIds])
      setBatchMsg(res.message || "批量保存成功")
      clearSelect()
      setTimeout(() => setBatchMsg(""), 3000)
    } catch (e: unknown) {
      setBatchMsg(e instanceof Error ? e.message : "保存失败")
    } finally {
      setBatchSaving(false)
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <Header title="选品大厅" />

      {/* 批量操作浮动栏 */}
      {batchMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl bg-card border border-border shadow-2xl shadow-black/40">
          <span className="text-sm text-foreground font-medium">
            已选 <span className="text-primary font-bold">{selectedIds.size}</span> 件
          </span>
          <button onClick={selectAll} className="text-xs text-muted-foreground hover:text-foreground transition-colors">全选本页</button>
          <button onClick={clearSelect} className="text-xs text-muted-foreground hover:text-foreground transition-colors">清空</button>
          <div className="w-px h-4 bg-border" />
          <Button size="sm" onClick={handleBatchSave} disabled={batchSaving || selectedIds.size === 0} className="gap-1.5">
            {batchSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            批量加入选品库
          </Button>
          {batchMsg && <span className="text-xs text-emerald-400">{batchMsg}</span>}
          <button onClick={() => { setBatchMode(false); clearSelect() }} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="flex-1 p-6">
        <div className="flex gap-6">

          {/* Sidebar — 平台 + Shopify店铺 */}
          <div className="w-44 shrink-0 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-xs">
                  <Filter className="w-3.5 h-3.5" />
                  平台
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                {platforms.map(p => (
                  <button
                    key={p}
                    onClick={() => { setPlatform(p); setShopifyBrand("全部") }}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors capitalize ${platform === p ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
                  >
                    {p}
                  </button>
                ))}
              </CardContent>
            </Card>

            {platform === "shopify" && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs">Shopify 店铺</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 pt-0">
                  {shopifyBrands.map(b => (
                    <button
                      key={b}
                      onClick={() => setShopifyBrand(b)}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${shopifyBrand === b ? "bg-purple-500/10 text-purple-400" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
                    >
                      {b}
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Main */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* 商品种类 tabs */}
            <div className="flex items-center gap-2 flex-wrap">
              {categories.map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors shrink-0 ${
                    category === c
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* 搜索 + 排序 */}
            <div className="flex items-center gap-3">
              <form onSubmit={handleSearch} className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="搜索商品标题、关键词..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                />
              </form>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">排序：</span>
                {sortOptions.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setSort(o.value)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors shrink-0 ${sort === o.value ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {o.label}
                  </button>
                ))}
                <button
                  onClick={() => { setBatchMode(v => !v); clearSelect() }}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors shrink-0 ${batchMode ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {batchMode ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  多选
                </button>
              </div>
            </div>

            {/* 结果数 */}
            <div className="flex items-center gap-2">
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-xs text-muted-foreground">
                  共 <span className="text-foreground font-medium">{total}</span> 件商品
                </p>
              )}
              <Badge variant="success" className="text-[10px]">
                <Sparkles className="w-2.5 h-2.5" />
                AI 评分排序
              </Badge>
            </div>

            {/* Grid */}
            {loading ? (
              <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card animate-pulse">
                    <div className="aspect-square bg-secondary rounded-t-xl" />
                    <div className="p-3.5 space-y-2">
                      <div className="h-3 bg-secondary rounded w-3/4" />
                      <div className="h-3 bg-secondary rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {products.map(p => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    selectable={batchMode}
                    selected={selectedIds.has(p.id)}
                    onSelect={toggleSelect}
                  />
                ))}
                {products.length === 0 && (
                  <div className="col-span-full text-center py-16 text-muted-foreground text-sm">
                    没有找到匹配的商品
                  </div>
                )}
              </div>
            )}

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs text-muted-foreground">第 {page} / {totalPages} 页</span>
                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
