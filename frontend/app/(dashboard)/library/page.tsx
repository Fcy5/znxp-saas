"use client"
import { useEffect, useState, useCallback } from "react"
import { productApi, type ProductCard, type PageInfo } from "@/lib/api"
import { ProductCard as ProductCardComponent } from "@/components/product/product-card"
import { Bookmark, Loader2, PackageOpen, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function LibraryPage() {
  const [products, setProducts] = useState<ProductCard[]>([])
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<number | null>(null)

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

  const load = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res = await productApi.myLibrary(p, 20)
      setProducts(res.data || [])
      setPageInfo(res.page_info || null)
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(page)
  }, [page, load])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Bookmark className="w-4.5 h-4.5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">我的选品库</h1>
            <p className="text-xs text-muted-foreground">
              {pageInfo ? `共 ${pageInfo.total} 件商品` : "已收藏的商品"}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <PackageOpen className="w-12 h-12 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium text-foreground">库中暂无商品</p>
            <p className="text-xs text-muted-foreground mt-1">
              在选品大厅点击商品卡片上的 <span className="text-primary">+</span> 按钮即可加入库
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.location.href = '/products'}>
            前往选品大厅
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {products.map((p) => (
              <div key={p.id} className="relative group/card">
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
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pageInfo && pageInfo.total_pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline" size="sm"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >上一页</Button>
              <span className="text-xs text-muted-foreground px-3">
                {page} / {pageInfo.total_pages}
              </span>
              <Button
                variant="outline" size="sm"
                disabled={page >= pageInfo.total_pages}
                onClick={() => setPage(p => p + 1)}
              >下一页</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
