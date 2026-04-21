"use client"
import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { agentApi, shopApi, type Shop, type AgentTask } from "@/lib/api"
import {
  Sparkles, Loader2, CheckCircle2, ChevronDown,
  Send, AlertCircle, Download, Zap,
} from "lucide-react"

type PageStep = "idle" | "fetching" | "fetched" | "optimizing" | "previewing" | "applying" | "done"

interface RawProduct {
  shopify_product_id: number
  title: string
  image_url: string
  status: string
}

interface SeoProduct {
  shopify_product_id: number
  title: string
  image_url: string
  new_seo_title: string
  new_meta_desc: string
  new_alt_text: string
  structured_data?: object
  error?: string
}

export default function ShopifyAIPage() {
  const router = useRouter()
  const [shops, setShops] = useState<Shop[]>([])
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null)

  const [step, setStep] = useState<PageStep>("idle")
  const [rawProducts, setRawProducts] = useState<RawProduct[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [seoProducts, setSeoProducts] = useState<SeoProduct[]>([])
  const [task, setTask] = useState<AgentTask | null>(null)
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

  // 切换店铺时重置状态
  const handleShopChange = (id: number) => {
    setSelectedShopId(id)
    setStep("idle")
    setRawProducts([])
    setSelectedIds(new Set())
    setSeoProducts([])
    setTask(null)
    setApplyResult(null)
    setError("")
  }

  // 第一步：拉取商品列表
  const handleFetch = async () => {
    if (!selectedShopId) return
    setStep("fetching")
    setError("")
    setRawProducts([])
    setSelectedIds(new Set())
    setSeoProducts([])
    setTask(null)
    setApplyResult(null)
    try {
      const r = await agentApi.listShopifyProducts(selectedShopId)
      setRawProducts(r.data || [])
      setSelectedIds(new Set((r.data || []).map((p: RawProduct) => p.shopify_product_id)))
      setStep("fetched")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "拉取失败，请检查 Access Token")
      setStep("idle")
    }
  }

  // 轮询任务
  const pollTask = useCallback((taskId: number) => {
    const interval = setInterval(async () => {
      try {
        const r = await agentApi.getTask(taskId)
        setTask(r.data)
        if (r.data.status === "success") {
          clearInterval(interval)
          const products: SeoProduct[] = r.data.output_data?.products || []
          setSeoProducts(products.filter(p => !p.error))
          setSelectedIds(new Set(products.filter(p => !p.error).map(p => p.shopify_product_id)))
          setStep("previewing")
        } else if (r.data.status === "failed") {
          clearInterval(interval)
          setError(r.data.error_message || "优化失败")
          setStep("fetched")
        }
      } catch {
        clearInterval(interval)
        setStep("fetched")
      }
    }, 2000)
  }, [])

  // 第二步：AI 优化选中商品
  const handleOptimize = async (optimizeAll = false) => {
    if (!selectedShopId) return
    const ids = optimizeAll
      ? rawProducts.map(p => p.shopify_product_id)
      : Array.from(selectedIds)
    if (ids.length === 0) return

    setStep("optimizing")
    setError("")
    setSeoProducts([])
    try {
      const r = await agentApi.shopifySeoOptimize(selectedShopId, ids)
      setTask(r.data)
      pollTask(r.data.id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "启动失败")
      setStep("fetched")
    }
  }

  // 第三步：写入 Shopify
  const handleApply = async () => {
    if (!selectedShopId || !task || selectedIds.size === 0) return
    setStep("applying")
    setError("")
    try {
      const r = await agentApi.shopifySeoApply(selectedShopId, task.id, Array.from(selectedIds))
      setApplyResult({ success: r.data.success, failed: r.data.failed })
      setStep("done")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "写入失败")
      setStep("previewing")
    }
  }

  const toggleAll = (products: { shopify_product_id: number }[]) => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(products.map(p => p.shopify_product_id)))
    }
  }

  const toggleOne = (id: number) => {
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedIds(next)
  }

  const isOptimizing = step === "optimizing"
  const isFetching = step === "fetching"

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--color-bg)" }}>
      <Header title="Shopify AI 优化" subtitle="批量优化 SEO 标题、Meta 描述、图片 Alt 文本" />

      <main className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* 顶部控制栏 */}
        <div
          className="rounded-xl p-4 border flex flex-wrap items-center gap-3"
          style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}
        >
          {/* 店铺选择 */}
          <div className="relative">
            <select
              value={selectedShopId ?? ""}
              onChange={e => handleShopChange(Number(e.target.value))}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm border text-white cursor-pointer"
              style={{ background: "var(--color-sidebar)", borderColor: "var(--color-border)" }}
            >
              {shops.map(s => (
                <option key={s.id} value={s.id}>{s.name || s.domain}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          {/* 第一步按钮：拉取商品 */}
          {(step === "idle" || step === "fetched") && (
            <Button
              onClick={handleFetch}
              disabled={!selectedShopId || isFetching}
              variant="outline"
              className="gap-2 border-slate-600 text-slate-300 hover:text-white hover:border-slate-400"
            >
              {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {step === "fetched" ? "重新拉取" : "拉取商品"}
            </Button>
          )}

          {/* 第二步按钮：仅在拉取完成后显示 */}
          {step === "fetched" && rawProducts.length > 0 && (
            <>
              <div className="text-sm text-slate-400">
                已选 <span className="text-white font-medium">{selectedIds.size}</span> / {rawProducts.length} 件
              </div>
              <Button
                onClick={() => handleOptimize(false)}
                disabled={selectedIds.size === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
              >
                <Sparkles className="w-4 h-4" />
                优化选中 ({selectedIds.size})
              </Button>
              <Button
                onClick={() => handleOptimize(true)}
                className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
              >
                <Zap className="w-4 h-4" />
                一键全部优化 ({rawProducts.length})
              </Button>
            </>
          )}

          {/* 预览阶段：确认写入 */}
          {step === "previewing" && (
            <>
              <Button
                variant="outline"
                onClick={() => setStep("fetched")}
                className="gap-2 border-slate-600 text-slate-300 hover:text-white"
              >
                重新选择
              </Button>
              <div className="text-sm text-slate-400 ml-auto">
                已选 <span className="text-white font-medium">{selectedIds.size}</span> / {seoProducts.length} 件
              </div>
              <Button
                onClick={handleApply}
                disabled={selectedIds.size === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                <Send className="w-4 h-4" />
                确认写入 Shopify ({selectedIds.size})
              </Button>
            </>
          )}

          {step === "applying" && (
            <Button disabled className="bg-emerald-600 text-white gap-2 ml-auto">
              <Loader2 className="w-4 h-4 animate-spin" />
              写入中...
            </Button>
          )}

          {step === "done" && (
            <Button
              onClick={handleFetch}
              variant="outline"
              className="gap-2 border-slate-600 text-slate-300 hover:text-white ml-auto"
            >
              <Download className="w-4 h-4" />
              重新拉取
            </Button>
          )}
        </div>

        {/* 进度条（AI 优化中） */}
        {isOptimizing && task && (
          <div
            className="rounded-xl p-5 border space-y-3"
            style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}
          >
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-300 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                AI 正在生成 SEO 优化方案...
              </span>
              <span className="text-slate-400">{task.progress}%</span>
            </div>
            <Progress value={task.progress} className="h-2" />
            <p className="text-xs text-slate-500">正在处理 {selectedIds.size} 件商品，请稍候</p>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="rounded-xl p-4 border border-red-500/30 bg-red-500/10 flex items-center gap-3 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* 写入成功结果 */}
        {step === "done" && applyResult && (
          <div className={`rounded-xl p-4 border flex items-center gap-3 text-sm ${
            applyResult.failed === 0
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-amber-500/30 bg-amber-500/10 text-amber-400"
          }`}>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            已成功写入 {applyResult.success} 件商品 SEO
            {applyResult.failed > 0 && `，${applyResult.failed} 件失败`}
          </div>
        )}

        {/* ── 第一步：原始商品列表（勾选阶段）── */}
        {step === "fetched" && rawProducts.length > 0 && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}
          >
            <div
              className="grid grid-cols-[40px_56px_1fr_80px] gap-4 px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={selectedIds.size === rawProducts.length && rawProducts.length > 0}
                  onChange={() => toggleAll(rawProducts)}
                  className="w-4 h-4 accent-blue-500 cursor-pointer"
                />
              </div>
              <div>图片</div>
              <div>商品名</div>
              <div>状态</div>
            </div>
            {rawProducts.map(p => (
              <div
                key={p.shopify_product_id}
                onClick={() => toggleOne(p.shopify_product_id)}
                className="grid grid-cols-[40px_56px_1fr_80px] gap-4 px-4 py-3 border-b cursor-pointer transition-colors hover:bg-white/5"
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
                  {p.image_url
                    ? <img src={p.image_url} alt={p.title} className="w-10 h-10 rounded object-cover" />
                    : <div className="w-10 h-10 rounded bg-slate-700 flex items-center justify-center text-slate-500 text-xs">—</div>
                  }
                </div>
                <div className="flex items-center">
                  <span className="text-sm text-white line-clamp-2">{p.title}</span>
                </div>
                <div className="flex items-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    p.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-600/40 text-slate-400"
                  }`}>
                    {p.status === "active" ? "上架" : p.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── 第二步：SEO 预览表（确认阶段）── */}
        {(step === "previewing" || step === "applying" || step === "done") && seoProducts.length > 0 && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}
          >
            <div
              className="grid grid-cols-[40px_56px_1fr_1fr_1fr_60px] gap-4 px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={selectedIds.size === seoProducts.length && seoProducts.length > 0}
                  onChange={() => toggleAll(seoProducts)}
                  className="w-4 h-4 accent-blue-500 cursor-pointer"
                  disabled={step !== "previewing"}
                />
              </div>
              <div>图片</div>
              <div>商品名</div>
              <div>新 SEO 标题</div>
              <div>新 Meta 描述</div>
              <div>Schema</div>
            </div>
            {seoProducts.map(p => (
              <div
                key={p.shopify_product_id}
                onClick={() => step === "previewing" && toggleOne(p.shopify_product_id)}
                className="grid grid-cols-[40px_56px_1fr_1fr_1fr_60px] gap-4 px-4 py-3 border-b transition-colors hover:bg-white/5"
                style={{
                  borderColor: "var(--color-border)",
                  cursor: step === "previewing" ? "pointer" : "default",
                  background: selectedIds.has(p.shopify_product_id) ? "rgba(59,130,246,0.06)" : undefined,
                }}
              >
                <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.shopify_product_id)}
                    onChange={() => toggleOne(p.shopify_product_id)}
                    className="w-4 h-4 accent-blue-500 cursor-pointer"
                    disabled={step !== "previewing"}
                  />
                </div>
                <div className="flex items-center">
                  {p.image_url
                    ? <img src={p.image_url} alt={p.title} className="w-10 h-10 rounded object-cover" />
                    : <div className="w-10 h-10 rounded bg-slate-700 flex items-center justify-center text-slate-500 text-xs">—</div>
                  }
                </div>
                <div className="flex items-center">
                  <span className="text-sm text-white line-clamp-2">{p.title}</span>
                </div>
                <div className="flex items-start py-1">
                  <p className="text-xs text-emerald-400 line-clamp-2">{p.new_seo_title}</p>
                </div>
                <div className="flex items-start py-1">
                  <p className="text-xs text-blue-300 line-clamp-3">{p.new_meta_desc}</p>
                </div>
                <div className="flex items-center">
                  {p.structured_data
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 font-medium">✓ JSON-LD</span>
                    : <span className="text-[10px] text-slate-600">—</span>
                  }
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 空状态 */}
        {step === "idle" && !error && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500 space-y-3">
            <Sparkles className="w-12 h-12 text-slate-600" />
            <p className="text-sm">选择店铺，点击「拉取商品」开始</p>
            <p className="text-xs text-slate-600">拉取后可手动勾选，再一键 AI 优化 SEO</p>
          </div>
        )}

        {/* 拉取中空状态 */}
        {step === "fetching" && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500 space-y-3">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
            <p className="text-sm">正在从 Shopify 拉取商品...</p>
          </div>
        )}

      </main>
    </div>
  )
}
