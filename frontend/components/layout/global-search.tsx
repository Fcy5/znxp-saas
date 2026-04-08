"use client"
import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, Loader2, X, Store } from "lucide-react"
import { request, type ProductCard, type Shop, STATIC_BASE, type PagedResponse, type ApiResponse } from "@/lib/api"

interface GlobalSearchProps {
  open: boolean
  onClose: () => void
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [products, setProducts] = useState<ProductCard[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [allShops, setAllShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 打开时预加载店铺列表
  useEffect(() => {
    if (open) {
      setQuery("")
      setProducts([])
      setShops([])
      setTimeout(() => inputRef.current?.focus(), 50)
      const token = localStorage.getItem("access_token")
      if (token) {
        request<ApiResponse<Shop[]>>("/shops/", { silent: true })
          .then(res => setAllShops(res.data)).catch(() => {})
      }
    }
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const doSearch = useCallback(async (kw: string) => {
    if (!kw.trim()) { setProducts([]); setShops([]); return }

    // 店铺前端过滤
    const filtered = allShops.filter(s =>
      s.name.toLowerCase().includes(kw.toLowerCase()) ||
      s.domain.toLowerCase().includes(kw.toLowerCase())
    )
    setShops(filtered)

    // 商品远程搜索（需要登录）
    const token = localStorage.getItem("access_token")
    if (!token) return
    setLoading(true)
    try {
      const res = await request<PagedResponse<ProductCard>>("/products/search", {
        method: "POST",
        body: JSON.stringify({ keyword: kw, page: 1, page_size: 6 }),
        silent: true,
      })
      setProducts(res.data)
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [allShops])

  const handleChange = (val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 300)
  }

  const go = (path: string) => {
    router.push(path)
    onClose()
  }

  const hasResults = products.length > 0 || shops.length > 0

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-xl mx-4 rounded-2xl border border-border shadow-2xl overflow-hidden"
        style={{ background: "hsl(222 47% 9%)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* 搜索输入 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          {loading
            ? <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
            : <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => handleChange(e.target.value)}
            placeholder="搜索商品、店铺..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {query && (
            <button onClick={() => { setQuery(""); setProducts([]); setShops([]) }}>
              <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
          <kbd className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* 结果 */}
        {hasResults && (
          <div className="max-h-[420px] overflow-y-auto py-2">

            {/* 店铺 */}
            {shops.length > 0 && (
              <>
                <p className="text-[10px] text-muted-foreground px-4 py-1.5 uppercase tracking-wider">店铺</p>
                {shops.map(s => (
                  <button
                    key={s.id}
                    onClick={() => go("/shops")}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-lg bg-secondary shrink-0 flex items-center justify-center">
                      <Store className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.domain}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">{s.platform || "shopify"}</span>
                  </button>
                ))}
              </>
            )}

            {/* 商品 */}
            {products.length > 0 && (
              <>
                <p className="text-[10px] text-muted-foreground px-4 py-1.5 uppercase tracking-wider">商品</p>
                {products.map(p => (
                  <button
                    key={p.id}
                    onClick={() => go(`/products/${p.id}`)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left"
                  >
                    {p.main_image ? (
                      <img
                        src={p.main_image.startsWith("http") ? p.main_image : `${STATIC_BASE}${p.main_image}`}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover shrink-0 bg-secondary"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-secondary shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{p.title}</p>
                      <p className="text-xs text-muted-foreground">{p.category} · {p.source_platform}</p>
                    </div>
                    {p.price != null && (
                      <span className="text-xs text-primary shrink-0">${p.price}</span>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* 无结果 */}
        {!loading && query && !hasResults && (
          <p className="text-center text-sm text-muted-foreground py-8">没有找到 "{query}" 相关结果</p>
        )}

        {/* 初始提示 */}
        {!query && (
          <p className="text-center text-xs text-muted-foreground py-6">输入关键词搜索商品或店铺</p>
        )}
      </div>
    </div>
  )
}
