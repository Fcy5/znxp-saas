"use client"
import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { agentApi, shopApi, type Shop, type AgentTask, VIDEO_MODELS } from "@/lib/api"
import { Drawer } from "@/components/ui/drawer"
import {
  Sparkles, Loader2, CheckCircle2, ChevronDown,
  Send, AlertCircle, RefreshCw, Zap, Search,
  ChevronLeft, ChevronRight, Clock, Tag, Package, ExternalLink, X, Video,
} from "lucide-react"

type PageStep = "idle" | "syncing" | "ready" | "optimizing" | "previewing" | "applying" | "done"
type ActionPanel = null | "seo" | "status" | "price"

interface CachedProduct {
  shopify_product_id: number
  title: string
  image_url: string
  status: string
  product_type: string
  tags: string
  price: string
  published_at: string | null
  shopify_created_at: string | null
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

function timeAgo(iso: string | null): string {
  if (!iso) return "从未"
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "刚刚"
  if (mins < 60) return `${mins} 分钟前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} 小时前`
  return `${Math.floor(hrs / 24)} 天前`
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export default function ShopifyAIPage() {
  const router = useRouter()
  const [shops, setShops] = useState<Shop[]>([])
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null)

  const [step, setStep] = useState<PageStep>("idle")
  const [products, setProducts] = useState<CachedProduct[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const [searchQ, setSearchQ] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [sortBy, setSortBy] = useState("published_at")

  const [seoProducts, setSeoProducts] = useState<SeoProduct[]>([])
  const [task, setTask] = useState<AgentTask | null>(null)
  const [applyResult, setApplyResult] = useState<{ success: number; failed: number } | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [drawerProduct, setDrawerProduct] = useState<CachedProduct | null>(null)
  const [videoTaskId, setVideoTaskId] = useState<number | null>(null)
  const [videoStatus, setVideoStatus] = useState<"idle"|"loading"|"polling"|"done"|"failed">("idle")
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoError, setVideoError] = useState("")
  const [videoModel, setVideoModel] = useState(VIDEO_MODELS[0].value)
  const [actionPanel, setActionPanel] = useState<ActionPanel>(null)
  const [statusTarget, setStatusTarget] = useState("active")
  const [priceRule, setPriceRule] = useState("decrease_pct")
  const [priceValue, setPriceValue] = useState<number>(10)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionResult, setActionResult] = useState<{ success: number; failed: number; msg: string } | null>(null)

  const videoPollerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const PER_PAGE = 20

  // 切换商品时重置视频状态
  useEffect(() => {
    if (videoPollerRef.current) clearInterval(videoPollerRef.current)
    setVideoTaskId(null)
    setVideoStatus("idle")
    setVideoUrl(null)
    setVideoError("")
  }, [drawerProduct?.shopify_product_id])

  useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (!token) { router.push("/login"); return }
    shopApi.list().then(r => {
      setShops(r.data || [])
      if (r.data?.length) setSelectedShopId(r.data[0].id)
    })
  }, [router])

  const loadProducts = useCallback(async (shopId: number, pg = 1, q = "", status = "", sort = "published_at") => {
    setLoading(true)
    try {
      const r = await agentApi.listShopifyProducts(shopId, { q, status, sort, page: pg, per_page: PER_PAGE })
      setProducts(r.data.products)
      setTotal(r.data.total)
      setPage(r.data.page)
      setLastSyncedAt(r.data.last_synced_at)
      if (r.data.total > 0) setStep("ready")
      else setStep("idle")
    } catch {
      setStep("idle")
    } finally {
      setLoading(false)
    }
  }, [])

  const handleVideoGen = async (product: CachedProduct) => {
    if (!product.image_url) { setVideoError("该商品没有图片"); return }
    setVideoStatus("loading")
    setVideoError("")
    setVideoUrl(null)
    try {
      const r = await agentApi.videoFromUrl(product.image_url, product.title, product.product_type, 5, videoModel)
      const tid = r.data.id
      setVideoTaskId(tid)
      setVideoStatus("polling")
      videoPollerRef.current = setInterval(async () => {
        try {
          const tr = await agentApi.pollTask(tid)
          if (tr.data.status === "success") {
            clearInterval(videoPollerRef.current!)
            setVideoStatus("done")
            setVideoUrl((tr.data.output_data?.video_url as string) || null)
          } else if (tr.data.status === "failed") {
            clearInterval(videoPollerRef.current!)
            setVideoStatus("failed")
            setVideoError(tr.data.error_message || "视频生成失败")
          }
        } catch {
          clearInterval(videoPollerRef.current!)
          setVideoStatus("failed")
          setVideoError("轮询失败")
        }
      }, 5000)
    } catch (e: unknown) {
      setVideoStatus("failed")
      setVideoError(e instanceof Error ? e.message : "启动失败")
    }
  }

  // 切换店铺
  const handleShopChange = (id: number) => {
    setSelectedShopId(id)
    setStep("idle")
    setProducts([])
    setSelectedIds(new Set())
    setSeoProducts([])
    setTask(null)
    setApplyResult(null)
    setError("")
    setSearchQ("")
    setFilterStatus("")
    setSortBy("published_at")
    loadProducts(id, 1, "", "", "published_at")
  }

  // 首次加载
  useEffect(() => {
    if (selectedShopId) loadProducts(selectedShopId, 1)
  }, [selectedShopId, loadProducts])

  // 搜索防抖
  const handleSearch = (val: string) => {
    setSearchQ(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      if (selectedShopId) loadProducts(selectedShopId, 1, val, filterStatus, sortBy)
    }, 400)
  }

  const handleFilterChange = (status: string) => {
    setFilterStatus(status)
    if (selectedShopId) loadProducts(selectedShopId, 1, searchQ, status, sortBy)
  }

  const handleSortChange = (sort: string) => {
    setSortBy(sort)
    if (selectedShopId) loadProducts(selectedShopId, 1, searchQ, filterStatus, sort)
  }

  const handlePageChange = (pg: number) => {
    if (selectedShopId) loadProducts(selectedShopId, pg, searchQ, filterStatus, sortBy)
  }

  // 手动同步
  const handleSync = async () => {
    if (!selectedShopId) return
    setStep("syncing")
    setError("")
    try {
      await agentApi.syncShopifyProducts(selectedShopId)
      await loadProducts(selectedShopId, 1, searchQ, filterStatus, sortBy)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "同步失败，请检查 Access Token")
      setStep(products.length > 0 ? "ready" : "idle")
    }
  }

  // 轮询优化任务
  const pollTask = useCallback((taskId: number) => {
    const interval = setInterval(async () => {
      try {
        const r = await agentApi.getTask(taskId)
        setTask(r.data)
        if (r.data.status === "success") {
          clearInterval(interval)
          const seo: SeoProduct[] = r.data.output_data?.products || []
          setSeoProducts(seo.filter(p => !p.error))
          setSelectedIds(new Set(seo.filter(p => !p.error).map(p => p.shopify_product_id)))
          setStep("previewing")
        } else if (r.data.status === "failed") {
          clearInterval(interval)
          setError(r.data.error_message || "优化失败")
          setStep("ready")
        }
      } catch {
        clearInterval(interval)
        setStep("ready")
      }
    }, 2000)
  }, [])

  const handleOptimize = async (all = false) => {
    if (!selectedShopId) return
    const ids = all ? products.map(p => p.shopify_product_id) : Array.from(selectedIds)
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
      setStep("ready")
    }
  }

  const handleBulkStatus = async () => {
    if (!selectedShopId || selectedIds.size === 0) return
    setActionLoading(true)
    setActionResult(null)
    try {
      const r = await agentApi.shopifyBulkStatus(selectedShopId, Array.from(selectedIds), statusTarget)
      setActionResult({ success: r.data.success, failed: r.data.failed, msg: r.message || "" })
      // 刷新列表
      await loadProducts(selectedShopId, page, searchQ, filterStatus, sortBy)
      setActionPanel(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "操作失败")
    } finally {
      setActionLoading(false)
    }
  }

  const handleBulkPrice = async () => {
    if (!selectedShopId || selectedIds.size === 0 || !priceValue) return
    setActionLoading(true)
    setActionResult(null)
    try {
      const r = await agentApi.shopifyBulkPrice(selectedShopId, Array.from(selectedIds), priceRule, priceValue)
      setActionResult({ success: r.data.success, failed: r.data.failed, msg: r.message || "" })
      await loadProducts(selectedShopId, page, searchQ, filterStatus, sortBy)
      setActionPanel(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "操作失败")
    } finally {
      setActionLoading(false)
    }
  }

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

  const toggleAll = (list: { shopify_product_id: number }[]) => {
    if (selectedIds.size === list.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(list.map(p => p.shopify_product_id)))
  }
  const toggleOne = (id: number) => {
    const next = new Set(selectedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedIds(next)
  }

  const totalPages = Math.ceil(total / PER_PAGE)
  const isSyncing = step === "syncing"
  const isOptimizing = step === "optimizing"
  const showProducts = ["ready", "optimizing"].includes(step)
  const showPreview = ["previewing", "applying", "done"].includes(step)

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--color-bg)" }}>
      <Header title="Shopify AI 优化" subtitle="批量优化 SEO 标题、Meta 描述、图片 Alt、结构化数据" />

      <main className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* ── 顶部控制栏 ── */}
        <div className="rounded-xl p-4 border flex flex-wrap items-center gap-3"
          style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>

          {/* 店铺选择 */}
          <div className="relative">
            <select value={selectedShopId ?? ""} onChange={e => handleShopChange(Number(e.target.value))}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm border text-white cursor-pointer"
              style={{ background: "var(--color-sidebar)", borderColor: "var(--color-border)" }}>
              {shops.map(s => <option key={s.id} value={s.id}>{s.name || s.domain}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          {/* 同步状态 */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5" />
            上次同步：{timeAgo(lastSyncedAt)}
          </div>

          <Button onClick={handleSync} disabled={isSyncing} variant="outline"
            className="gap-2 border-slate-600 text-slate-300 hover:text-white hover:border-slate-400">
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isSyncing ? "同步中..." : "重新同步"}
          </Button>

          {/* 操作按钮（商品列表阶段）*/}
          {showProducts && !isOptimizing && (
            <>
              <div className="text-sm text-slate-400 ml-2">
                已选 <span className="text-white font-medium">{selectedIds.size}</span> 件
              </div>
              <Button onClick={() => setActionPanel(actionPanel === "seo" ? null : "seo")}
                disabled={selectedIds.size === 0}
                className={`gap-2 ${actionPanel === "seo" ? "bg-blue-700" : "bg-blue-600 hover:bg-blue-700"} text-white`}>
                <Sparkles className="w-4 h-4" />SEO 优化
              </Button>
              <Button onClick={() => setActionPanel(actionPanel === "price" ? null : "price")}
                disabled={selectedIds.size === 0}
                className={`gap-2 ${actionPanel === "price" ? "bg-amber-700" : "bg-amber-600 hover:bg-amber-700"} text-white`}>
                改价
              </Button>
              <Button onClick={() => setActionPanel(actionPanel === "status" ? null : "status")}
                disabled={selectedIds.size === 0}
                className={`gap-2 ${actionPanel === "status" ? "bg-slate-600" : "bg-slate-700 hover:bg-slate-600"} text-white`}>
                上下架
              </Button>
              <Button onClick={() => handleOptimize(true)} variant="outline"
                className="gap-2 border-slate-600 text-slate-400 hover:text-white ml-auto">
                <Zap className="w-4 h-4" />一键全部 ({total})
              </Button>
            </>
          )}

          {/* 预览阶段 */}
          {showPreview && (
            <>
              <Button variant="outline" onClick={() => { setStep("ready"); setSeoProducts([]) }}
                className="gap-2 border-slate-600 text-slate-300 hover:text-white">
                重新选择
              </Button>
              <div className="text-sm text-slate-400 ml-auto">
                已选 <span className="text-white font-medium">{selectedIds.size}</span> / {seoProducts.length} 件
              </div>
              {step === "previewing" && (
                <Button onClick={handleApply} disabled={selectedIds.size === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                  <Send className="w-4 h-4" />
                  确认写入 Shopify ({selectedIds.size})
                </Button>
              )}
              {step === "applying" && (
                <Button disabled className="bg-emerald-600 text-white gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />写入中...
                </Button>
              )}
            </>
          )}
        </div>

        {/* ── 搜索 + 筛选栏（商品列表阶段）── */}
        {(showProducts || step === "idle") && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input value={searchQ} onChange={e => handleSearch(e.target.value)}
                placeholder="搜索商品名称..."
                className="pl-9 bg-transparent border-slate-700 text-white placeholder:text-slate-500" />
            </div>

            <div className="relative">
              <select value={filterStatus} onChange={e => handleFilterChange(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm border text-slate-300 cursor-pointer"
                style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
                <option value="">全部状态</option>
                <option value="active">上架</option>
                <option value="draft">草稿</option>
                <option value="archived">已归档</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>

            <div className="relative">
              <select value={sortBy} onChange={e => handleSortChange(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm border text-slate-300 cursor-pointer"
                style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
                <option value="published_at">上架时间↓</option>
                <option value="shopify_created_at">创建时间↓</option>
                <option value="title">名称 A-Z</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>

            {total > 0 && (
              <span className="text-xs text-slate-500 ml-auto">共 {total} 件</span>
            )}
          </div>
        )}

        {/* ── SEO 操作面板 ── */}
        {actionPanel === "seo" && showProducts && (
          <div className="rounded-xl p-4 border space-y-3"
            style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
            <p className="text-sm font-medium text-white">SEO 优化 · 已选 {selectedIds.size} 件</p>
            <p className="text-xs text-slate-400">AI 将生成 SEO 标题、Meta 描述、Alt 文本、Product Schema，预览后确认写入</p>
            <div className="flex gap-2">
              <Button onClick={() => { setActionPanel(null); handleOptimize(false) }}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                <Sparkles className="w-4 h-4" />开始优化 ({selectedIds.size} 件)
              </Button>
              <Button variant="outline" onClick={() => setActionPanel(null)}
                className="border-slate-600 text-slate-400 hover:text-white">取消</Button>
            </div>
          </div>
        )}

        {/* ── 改价操作面板 ── */}
        {actionPanel === "price" && showProducts && (
          <div className="rounded-xl p-4 border space-y-4"
            style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
            <p className="text-sm font-medium text-white">批量改价 · 已选 {selectedIds.size} 件</p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <select value={priceRule} onChange={e => setPriceRule(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm border text-white cursor-pointer"
                  style={{ background: "var(--color-sidebar)", borderColor: "var(--color-border)" }}>
                  <option value="decrease_pct">降价 %</option>
                  <option value="increase_pct">涨价 %</option>
                  <option value="fixed">固定价格 $</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
              <div className="flex items-center gap-1">
                <Input type="number" min={0} step={priceRule === "fixed" ? 0.01 : 1}
                  value={priceValue} onChange={e => setPriceValue(Number(e.target.value))}
                  className="w-24 bg-transparent border-slate-700 text-white text-sm" />
                <span className="text-slate-400 text-sm">{priceRule === "fixed" ? "USD" : "%"}</span>
              </div>
              {priceRule !== "fixed" && priceValue > 0 && (
                <span className="text-xs text-slate-500">
                  例：$100 → ${priceRule === "decrease_pct" ? (100 * (1 - priceValue / 100)).toFixed(2) : (100 * (1 + priceValue / 100)).toFixed(2)}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleBulkPrice} disabled={actionLoading || !priceValue}
                className="bg-amber-600 hover:bg-amber-700 text-white gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                确认改价 ({selectedIds.size} 件)
              </Button>
              <Button variant="outline" onClick={() => setActionPanel(null)}
                className="border-slate-600 text-slate-400 hover:text-white">取消</Button>
            </div>
          </div>
        )}

        {/* ── 上下架操作面板 ── */}
        {actionPanel === "status" && showProducts && (
          <div className="rounded-xl p-4 border space-y-4"
            style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
            <p className="text-sm font-medium text-white">批量上下架 · 已选 {selectedIds.size} 件</p>
            <div className="flex gap-2">
              {[
                { value: "active", label: "上架", color: "bg-emerald-600 hover:bg-emerald-700" },
                { value: "draft", label: "下架（草稿）", color: "bg-slate-600 hover:bg-slate-500" },
                { value: "archived", label: "归档", color: "bg-red-800 hover:bg-red-700" },
              ].map(opt => (
                <button key={opt.value} onClick={() => setStatusTarget(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm text-white transition-colors border-2 ${opt.color} ${statusTarget === opt.value ? "border-white" : "border-transparent"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleBulkStatus} disabled={actionLoading}
                className="bg-slate-700 hover:bg-slate-600 text-white gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                确认执行 ({selectedIds.size} 件)
              </Button>
              <Button variant="outline" onClick={() => setActionPanel(null)}
                className="border-slate-600 text-slate-400 hover:text-white">取消</Button>
            </div>
          </div>
        )}

        {/* 操作结果提示 */}
        {actionResult && (
          <div className={`rounded-xl p-4 border flex items-center gap-3 text-sm ${
            actionResult.failed === 0
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-amber-500/30 bg-amber-500/10 text-amber-400"
          }`}>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {actionResult.msg || `成功 ${actionResult.success} 件${actionResult.failed > 0 ? `，${actionResult.failed} 件失败` : ""}`}
            <button onClick={() => setActionResult(null)} className="ml-auto text-slate-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 进度条（AI 优化中） */}
        {isOptimizing && task && (
          <div className="rounded-xl p-5 border space-y-3"
            style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
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
            <AlertCircle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {/* 写入成功 */}
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

        {/* ── 商品列表表格 ── */}
        {showProducts && (
          <div className="rounded-xl border overflow-hidden"
            style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
            <div className="grid grid-cols-[40px_56px_1fr_90px_100px_90px] gap-3 px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b"
              style={{ borderColor: "var(--color-border)" }}>
              <div className="flex items-center justify-center">
                <input type="checkbox"
                  checked={selectedIds.size === products.length && products.length > 0}
                  onChange={() => toggleAll(products)}
                  className="w-4 h-4 accent-blue-500 cursor-pointer" />
              </div>
              <div>图片</div>
              <div>商品名</div>
              <div>状态</div>
              <div>上架时间</div>
              <div>价格</div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />加载中...
              </div>
            ) : products.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
                {searchQ ? `没有找到"${searchQ}"相关商品` : "暂无商品"}
              </div>
            ) : (
              products.map(p => (
                <div key={p.shopify_product_id}
                  onClick={() => setDrawerProduct(p)}
                  className="grid grid-cols-[40px_56px_1fr_90px_100px_90px] gap-3 px-4 py-3 border-b cursor-pointer transition-colors hover:bg-white/5"
                  style={{
                    borderColor: "var(--color-border)",
                    background: selectedIds.has(p.shopify_product_id) ? "rgba(59,130,246,0.06)" : undefined,
                  }}>
                  <div className="flex items-center justify-center" onClick={e => { e.stopPropagation(); toggleOne(p.shopify_product_id) }}>
                    <input type="checkbox" checked={selectedIds.has(p.shopify_product_id)}
                      onChange={() => toggleOne(p.shopify_product_id)}
                      className="w-4 h-4 accent-blue-500 cursor-pointer" />
                  </div>
                  <div className="flex items-center">
                    {p.image_url
                      ? <img src={p.image_url} alt={p.title} className="w-10 h-10 rounded object-cover" />
                      : <div className="w-10 h-10 rounded bg-slate-700 flex items-center justify-center text-slate-500 text-xs">—</div>
                    }
                  </div>
                  <div className="flex flex-col justify-center gap-0.5 min-w-0">
                    <span className="text-sm text-white line-clamp-1">{p.title}</span>
                    {p.product_type && <span className="text-xs text-slate-500 line-clamp-1">{p.product_type}</span>}
                  </div>
                  <div className="flex items-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      p.status === "active" ? "bg-emerald-500/20 text-emerald-400" :
                      p.status === "draft" ? "bg-amber-500/20 text-amber-400" :
                      "bg-slate-600/40 text-slate-400"
                    }`}>
                      {p.status === "active" ? "上架" : p.status === "draft" ? "草稿" : p.status}
                    </span>
                  </div>
                  <div className="flex items-center text-xs text-slate-400">
                    {formatDate(p.published_at)}
                  </div>
                  <div className="flex items-center text-xs text-slate-300">
                    {p.price ? `$${p.price}` : "—"}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 分页 */}
        {showProducts && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handlePageChange(page - 1)} disabled={page <= 1}
              className="border-slate-700 text-slate-400 hover:text-white h-8 w-8 p-0">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-slate-400">第 {page} / {totalPages} 页</span>
            <Button variant="outline" size="sm" onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages}
              className="border-slate-700 text-slate-400 hover:text-white h-8 w-8 p-0">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* ── SEO 预览表格 ── */}
        {showPreview && seoProducts.length > 0 && (
          <div className="rounded-xl border overflow-hidden"
            style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
            <div className="grid grid-cols-[40px_56px_1fr_1fr_1fr_60px] gap-4 px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b"
              style={{ borderColor: "var(--color-border)" }}>
              <div className="flex items-center justify-center">
                <input type="checkbox"
                  checked={selectedIds.size === seoProducts.length && seoProducts.length > 0}
                  onChange={() => toggleAll(seoProducts)}
                  className="w-4 h-4 accent-blue-500 cursor-pointer"
                  disabled={step !== "previewing"} />
              </div>
              <div>图片</div>
              <div>商品名</div>
              <div>新 SEO 标题</div>
              <div>新 Meta 描述</div>
              <div>Schema</div>
            </div>
            {seoProducts.map(p => (
              <div key={p.shopify_product_id}
                onClick={() => step === "previewing" && toggleOne(p.shopify_product_id)}
                className="grid grid-cols-[40px_56px_1fr_1fr_1fr_60px] gap-4 px-4 py-3 border-b transition-colors hover:bg-white/5"
                style={{
                  borderColor: "var(--color-border)",
                  cursor: step === "previewing" ? "pointer" : "default",
                  background: selectedIds.has(p.shopify_product_id) ? "rgba(59,130,246,0.06)" : undefined,
                }}>
                <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedIds.has(p.shopify_product_id)}
                    onChange={() => toggleOne(p.shopify_product_id)}
                    className="w-4 h-4 accent-blue-500 cursor-pointer"
                    disabled={step !== "previewing"} />
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

        {/* ── 商品详情 Drawer ── */}
        <Drawer
          open={!!drawerProduct}
          onClose={() => setDrawerProduct(null)}
          title="商品详情"
          width="w-[420px]"
        >
          {drawerProduct && (
            <div className="p-5 space-y-5">
              {/* 主图 */}
              {drawerProduct.image_url ? (
                <img src={drawerProduct.image_url} alt={drawerProduct.title}
                  className="w-full aspect-square object-cover rounded-xl" />
              ) : (
                <div className="w-full aspect-square rounded-xl bg-slate-800 flex items-center justify-center text-slate-600">
                  <Package className="w-16 h-16" />
                </div>
              )}

              {/* 标题 + 外链 */}
              <div className="space-y-1">
                <div className="flex items-start gap-2">
                  <h2 className="text-base font-semibold text-white flex-1 leading-snug">{drawerProduct.title}</h2>
                  <a
                    href={`https://${shops.find(s => s.id === selectedShopId)?.domain}/products`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-slate-500 hover:text-blue-400 mt-0.5 shrink-0"
                    onClick={e => e.stopPropagation()}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* 基本信息 */}
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: "var(--color-border)" }}>
                  <span className="text-slate-400">状态</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    drawerProduct.status === "active" ? "bg-emerald-500/20 text-emerald-400" :
                    drawerProduct.status === "draft" ? "bg-amber-500/20 text-amber-400" :
                    "bg-slate-600/40 text-slate-400"
                  }`}>
                    {drawerProduct.status === "active" ? "上架" : drawerProduct.status === "draft" ? "草稿" : drawerProduct.status}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: "var(--color-border)" }}>
                  <span className="text-slate-400">价格</span>
                  <span className="text-white font-medium">{drawerProduct.price ? `$${drawerProduct.price}` : "—"}</span>
                </div>

                <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: "var(--color-border)" }}>
                  <span className="text-slate-400">上架时间</span>
                  <span className="text-white">{formatDate(drawerProduct.published_at)}</span>
                </div>

                <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: "var(--color-border)" }}>
                  <span className="text-slate-400">创建时间</span>
                  <span className="text-white">{formatDate(drawerProduct.shopify_created_at)}</span>
                </div>

                {drawerProduct.product_type && (
                  <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: "var(--color-border)" }}>
                    <span className="text-slate-400">商品类型</span>
                    <span className="text-white">{drawerProduct.product_type}</span>
                  </div>
                )}

                {drawerProduct.tags && (
                  <div className="py-2">
                    <p className="text-slate-400 mb-2 flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" />标签</p>
                    <div className="flex flex-wrap gap-1.5">
                      {drawerProduct.tags.split(",").filter(Boolean).map(tag => (
                        <span key={tag.trim()} className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                          {tag.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="pt-2 flex gap-2">
                <Button
                  onClick={() => { toggleOne(drawerProduct.shopify_product_id); setDrawerProduct(null) }}
                  variant="outline"
                  className="flex-1 border-slate-600 text-slate-300 hover:text-white"
                >
                  {selectedIds.has(drawerProduct.shopify_product_id) ? "取消选中" : "加入优化"}
                </Button>
                <Button
                  onClick={() => {
                    if (!selectedIds.has(drawerProduct.shopify_product_id)) {
                      toggleOne(drawerProduct.shopify_product_id)
                    }
                    setDrawerProduct(null)
                    handleOptimize(false)
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />单独优化
                </Button>
              </div>

              {/* ── 视频生成区域 ── */}
              <div className="border-t pt-4 space-y-3" style={{ borderColor: "var(--color-border)" }}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5" />AI 视频 & 社媒素材
                </p>

                {videoStatus === "idle" && (
                  <div className="space-y-2">
                    <select
                      className="w-full text-xs bg-secondary border border-border rounded px-2 py-1.5 text-foreground"
                      value={videoModel}
                      onChange={e => setVideoModel(e.target.value)}
                    >
                      {VIDEO_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <Button
                      onClick={() => handleVideoGen(drawerProduct)}
                      disabled={!drawerProduct.image_url}
                      className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2"
                    >
                      <Video className="w-4 h-4" />生成视频 & 社媒素材
                    </Button>
                  </div>
                )}

                {(videoStatus === "loading" || videoStatus === "polling") && (
                  <div className="rounded-lg p-4 border border-violet-500/30 bg-violet-500/10 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-violet-300">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {videoStatus === "loading" ? "正在提交任务..." : "AI 生成中，约 60-120 秒..."}
                    </div>
                    <Progress value={videoStatus === "loading" ? 5 : 40} className="h-1.5" />
                    <p className="text-xs text-slate-500">{VIDEO_MODELS.find(m => m.value === videoModel)?.label ?? videoModel}</p>
                  </div>
                )}

                {videoStatus === "failed" && (
                  <div className="rounded-lg p-3 border border-red-500/30 bg-red-500/10 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-red-400">{videoError || "生成失败"}</p>
                      <button onClick={() => setVideoStatus("idle")} className="text-xs text-slate-400 hover:text-white mt-1 underline">
                        重试
                      </button>
                    </div>
                  </div>
                )}

                {videoStatus === "done" && videoUrl && (
                  <div className="space-y-3">
                    <div className="rounded-xl overflow-hidden border border-violet-500/30">
                      <video
                        src={videoUrl.startsWith("http") ? videoUrl : `${typeof window !== "undefined" ? window.location.origin : ""}${videoUrl}`}
                        controls
                        autoPlay
                        loop
                        muted
                        className="w-full"
                        style={{ maxHeight: 240 }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={videoUrl.startsWith("http") ? videoUrl : `${typeof window !== "undefined" ? window.location.origin : ""}${videoUrl}`}
                        download
                        className="flex-1 text-center text-xs py-2 rounded-lg border border-violet-500/40 text-violet-300 hover:bg-violet-500/10 transition-colors"
                      >
                        下载视频
                      </a>
                      <button
                        onClick={() => setVideoStatus("idle")}
                        className="flex-1 text-xs py-2 rounded-lg border border-slate-600 text-slate-400 hover:text-white transition-colors"
                      >
                        重新生成
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 text-center">可直接发布到 TikTok / Instagram Reels / Facebook</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </Drawer>

        {/* 空状态 */}
        {step === "idle" && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500 space-y-3">
            <Sparkles className="w-12 h-12 text-slate-600" />
            <p className="text-sm">点击「重新同步」从 Shopify 拉取商品</p>
            <p className="text-xs text-slate-600">同步后数据保存在本地，下次打开秒加载</p>
          </div>
        )}

      </main>
    </div>
  )
}
