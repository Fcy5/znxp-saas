"use client"
import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { agentApi, shopApi, type Shop, type AgentTask } from "@/lib/api"
import {
  Sparkles, Loader2, CheckCircle2, XCircle, ChevronDown,
  RefreshCw, Send, AlertCircle,
} from "lucide-react"

interface SeoProduct {
  shopify_product_id: number
  title: string
  image_url: string
  current_seo_title: string
  current_meta_desc: string
  new_seo_title: string
  new_meta_desc: string
  new_alt_text: string
  error?: string
}

export default function ShopifyAIPage() {
  const router = useRouter()
  const [shops, setShops] = useState<Shop[]>([])
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null)
  const [shopifyProducts, setShopifyProducts] = useState<SeoProduct[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [task, setTask] = useState<AgentTask | null>(null)
  const [polling, setPolling] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<{ success: number; failed: number } | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (!token) { router.push("/login"); return }
    shopApi.list().then(r => {
      setShops(r.data || [])
      if (r.data?.length) setSelectedShopId(r.data[0].id)
    }).catch(() => {})
  }, [router])

  // Poll task progress
  const pollTask = useCallback((taskId: number) => {
    setPolling(true)
    const interval = setInterval(async () => {
      try {
        const r = await agentApi.getTask(taskId)
        setTask(r.data)
        if (r.data.status === "success") {
          clearInterval(interval)
          setPolling(false)
          const products: SeoProduct[] = r.data.output_data?.products || []
          setShopifyProducts(products.filter(p => !p.error))
          // 默认全选
          setSelectedIds(new Set(products.filter(p => !p.error).map(p => p.shopify_product_id)))
        } else if (r.data.status === "failed") {
          clearInterval(interval)
          setPolling(false)
          setError(r.data.error_message || "优化分析失败")
        }
      } catch {
        clearInterval(interval)
        setPolling(false)
      }
    }, 2000)
  }, [])

  const handleOptimize = async () => {
    if (!selectedShopId) return
    setError("")
    setShopifyProducts([])
    setSelectedIds(new Set())
    setApplyResult(null)
    setTask(null)
    try {
      const r = await agentApi.shopifySeoOptimize(selectedShopId)
      setTask(r.data)
      pollTask(r.data.id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "启动失败")
    }
  }

  const handleApply = async () => {
    if (!selectedShopId || !task || selectedIds.size === 0) return
    setApplying(true)
    setError("")
    try {
      const r = await agentApi.shopifySeoApply(selectedShopId, task.id, Array.from(selectedIds))
      setApplyResult({ success: r.data.success, failed: r.data.failed })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "提交失败")
    } finally {
      setApplying(false)
    }
  }

  const toggleAll = () => {
    if (selectedIds.size === shopifyProducts.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(shopifyProducts.map(p => p.shopify_product_id)))
    }
  }

  const toggleOne = (id: number) => {
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedIds(next)
  }

  const selectedShop = shops.find(s => s.id === selectedShopId)
  const isRunning = polling || task?.status === "running"
  const isDone = task?.status === "success" && shopifyProducts.length > 0

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--color-bg)" }}>
      <Header title="Shopify AI 优化" subtitle="AI 批量优化 SEO 标题、Meta 描述、图片 Alt 文本" />

      <main className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* 控制栏 */}
        <div
          className="rounded-xl p-5 border flex flex-wrap items-center gap-4"
          style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}
        >
          {/* 店铺选择 */}
          <div className="relative">
            <select
              value={selectedShopId ?? ""}
              onChange={e => setSelectedShopId(Number(e.target.value))}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm border text-white cursor-pointer"
              style={{ background: "var(--color-sidebar)", borderColor: "var(--color-border)" }}
            >
              {shops.map(s => (
                <option key={s.id} value={s.id}>{s.name || s.domain}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          <Button
            onClick={handleOptimize}
            disabled={!selectedShopId || isRunning}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isRunning ? "分析中..." : "拉取并分析 SEO"}
          </Button>

          {isDone && (
            <>
              <span className="text-sm text-slate-400">
                已选 <span className="text-white font-medium">{selectedIds.size}</span> / {shopifyProducts.length} 件
              </span>
              <Button
                onClick={handleApply}
                disabled={applying || selectedIds.size === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 ml-auto"
              >
                {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {applying ? "提交中..." : `确认写入 Shopify (${selectedIds.size})`}
              </Button>
            </>
          )}
        </div>

        {/* 进度条 */}
        {task && (task.status === "running" || task.status === "pending") && (
          <div
            className="rounded-xl p-5 border space-y-3"
            style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}
          >
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-300 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                正在分析商品 SEO...
              </span>
              <span className="text-slate-400">{task.progress}%</span>
            </div>
            <Progress value={task.progress} className="h-2" />
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="rounded-xl p-4 border border-red-500/30 bg-red-500/10 flex items-center gap-3 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* 写入结果 */}
        {applyResult && (
          <div className={`rounded-xl p-4 border flex items-center gap-3 text-sm ${
            applyResult.failed === 0
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-amber-500/30 bg-amber-500/10 text-amber-400"
          }`}>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            成功写入 {applyResult.success} 件{applyResult.failed > 0 ? `，${applyResult.failed} 件失败` : ""}
          </div>
        )}

        {/* 商品预览表 */}
        {isDone && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}
          >
            {/* 表头 */}
            <div
              className="grid grid-cols-[40px_60px_1fr_1fr_1fr] gap-4 px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={selectedIds.size === shopifyProducts.length && shopifyProducts.length > 0}
                  onChange={toggleAll}
                  className="w-4 h-4 accent-blue-500 cursor-pointer"
                />
              </div>
              <div>图片</div>
              <div>商品名</div>
              <div>新 SEO 标题</div>
              <div>新 Meta 描述</div>
            </div>

            {/* 商品行 */}
            {shopifyProducts.map(p => (
              <div
                key={p.shopify_product_id}
                onClick={() => toggleOne(p.shopify_product_id)}
                className="grid grid-cols-[40px_60px_1fr_1fr_1fr] gap-4 px-4 py-3 border-b cursor-pointer transition-colors hover:bg-white/5"
                style={{
                  borderColor: "var(--color-border)",
                  background: selectedIds.has(p.shopify_product_id) ? "rgba(59,130,246,0.06)" : undefined,
                }}
              >
                <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.shopify_product_id)}
                    onChange={() => toggleOne(p.shopify_product_id)}
                    className="w-4 h-4 accent-blue-500 cursor-pointer"
                  />
                </div>
                <div className="flex items-center">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.title} className="w-10 h-10 rounded object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-slate-700 flex items-center justify-center text-slate-500 text-xs">—</div>
                  )}
                </div>
                <div className="flex items-center">
                  <span className="text-sm text-white line-clamp-2">{p.title}</span>
                </div>
                <div className="flex items-start py-1">
                  <div className="space-y-1 w-full">
                    {p.current_seo_title && (
                      <p className="text-xs text-slate-500 line-through line-clamp-1">{p.current_seo_title}</p>
                    )}
                    <p className="text-xs text-emerald-400 line-clamp-2">{p.new_seo_title}</p>
                  </div>
                </div>
                <div className="flex items-start py-1">
                  <p className="text-xs text-blue-300 line-clamp-3">{p.new_meta_desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 空状态 */}
        {!task && !error && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500 space-y-3">
            <Sparkles className="w-12 h-12 text-slate-600" />
            <p className="text-sm">选择店铺，点击「拉取并分析 SEO」开始</p>
            <p className="text-xs text-slate-600">AI 将读取你的 Shopify 商品，生成优化后的 SEO 标题和描述</p>
          </div>
        )}

      </main>
    </div>
  )
}
