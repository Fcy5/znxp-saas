"use client"
import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { request, shopApi, type Shop } from "@/lib/api"
import {
  ShoppingCart, Link2, RefreshCw, Search, ChevronLeft, ChevronRight,
  CheckCircle2, Clock, XCircle, Loader2, AlertCircle, ExternalLink,
} from "lucide-react"

interface GmcProduct {
  shopify_product_id: number
  title: string
  image_url: string
  status: string
  price: string
  handle: string
  gmc_product_id: string | null
  gmc_status: string
  published_at: string | null
}

type GmcFilter = "all" | "pushed" | "not_pushed"

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  not_pushed: { label: "未推送", color: "text-slate-400 bg-slate-700/40", icon: null },
  pending:    { label: "审核中", color: "text-amber-400 bg-amber-500/10", icon: <Clock className="w-3 h-3" /> },
  approved:   { label: "已批准", color: "text-emerald-400 bg-emerald-500/10", icon: <CheckCircle2 className="w-3 h-3" /> },
  disapproved:{ label: "已拒绝", color: "text-red-400 bg-red-500/10", icon: <XCircle className="w-3 h-3" /> },
}

export default function GmcPage() {
  const searchParams = useSearchParams()
  const [shops, setShops] = useState<Shop[]>([])
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null)
  const [connected, setConnected] = useState(false)
  const [datasourceReady, setDatasourceReady] = useState(false)
  const [products, setProducts] = useState<GmcProduct[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<GmcFilter>("all")
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [setupLoading, setSetupLoading] = useState(false)
  const [msg, setMsg] = useState("")
  const [msgType, setMsgType] = useState<"ok" | "err">("ok")
  const PER_PAGE = 20

  const showMsg = (text: string, type: "ok" | "err" = "ok") => {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(""), 4000)
  }

  // OAuth 回调提示
  useEffect(() => {
    if (searchParams.get("connected") === "1") showMsg("Google 账号连接成功！")
    if (searchParams.get("error")) showMsg("Google 授权失败，请重试", "err")
  }, [searchParams])

  // 加载店铺 + 连接状态
  useEffect(() => {
    shopApi.list().then(res => {
      const list = res.data || []
      setShops(list)
      if (list.length > 0) setSelectedShopId(list[0].id)
    })
    request<any>("/gmc/status").then(res => {
      setConnected(res.data?.connected || false)
      setDatasourceReady(res.data?.datasource_ready || false)
    }).catch(() => {})
  }, [])

  const loadProducts = useCallback(async () => {
    if (!selectedShopId) return
    setLoading(true)
    try {
      const res = await request<any>(
        `/gmc/products?shop_id=${selectedShopId}&q=${encodeURIComponent(q)}&gmc_status=${filter === "all" ? "" : filter}&page=${page}&per_page=${PER_PAGE}`
      )
      setProducts(res.data?.products || [])
      setTotal(res.data?.total || 0)
    } catch (e: any) {
      showMsg(e.message || "加载失败", "err")
    } finally {
      setLoading(false)
    }
  }, [selectedShopId, q, filter, page])

  useEffect(() => { loadProducts() }, [loadProducts])

  const handleConnect = async () => {
    const res = await request<any>("/gmc/oauth/url")
    window.location.href = res.data?.url
  }

  const handleSetupDatasource = async () => {
    setSetupLoading(true)
    try {
      const res = await request<any>("/gmc/setup-datasource", { method: "POST", body: JSON.stringify({}) })
      setDatasourceReady(true)
      showMsg(res.message || "Data Source 初始化成功")
    } catch (e: any) {
      showMsg(e.message || "初始化失败", "err")
    } finally {
      setSetupLoading(false)
    }
  }

  const handlePush = async () => {
    if (selectedIds.size === 0) return showMsg("请先选择商品", "err")
    setPushing(true)
    try {
      const res = await request<any>("/gmc/push", {
        method: "POST",
        body: JSON.stringify({
          shop_id: selectedShopId,
          shopify_product_ids: Array.from(selectedIds).map(String),
        }),
      })
      showMsg(res.message || "推送完成")
      setSelectedIds(new Set())
      loadProducts()
    } catch (e: any) {
      showMsg(e.message || "推送失败", "err")
    } finally {
      setPushing(false)
    }
  }

  const handleSyncStatus = async () => {
    setSyncing(true)
    try {
      const res = await request<any>("/gmc/sync-status", {
        method: "POST",
        body: JSON.stringify({ shop_id: selectedShopId }),
      })
      showMsg(res.message || "同步完成")
      loadProducts()
    } catch (e: any) {
      showMsg(e.message || "同步失败", "err")
    } finally {
      setSyncing(false)
    }
  }

  const toggleSelect = (pid: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(pid) ? next.delete(pid) : next.add(pid)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(products.map(p => p.shopify_product_id)))
    }
  }

  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--color-bg)" }}>
      <Header title="Google 购物广告" />

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

        {/* 消息提示 */}
        {msg && (
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${msgType === "ok" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
            {msgType === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {msg}
          </div>
        )}

        {/* 连接状态卡片 */}
        <div className="rounded-xl border p-4 flex items-center gap-4" style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${connected ? "bg-emerald-500/10" : "bg-slate-700"}`}>
            <ShoppingCart className={`w-5 h-5 ${connected ? "text-emerald-400" : "text-slate-500"}`} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">
              {connected ? "已连接 Google 账号" : "未连接 Google 账号"}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {connected
                ? datasourceReady ? "Data Source 已就绪，可以推送商品" : "需要初始化 Data Source"
                : "连接后可将 Shopify 商品一键推送到 GMC 购物广告"}
            </p>
          </div>
          <div className="flex gap-2">
            {!connected && (
              <Button onClick={handleConnect} className="bg-blue-600 hover:bg-blue-700 text-white gap-2 text-sm">
                <Link2 className="w-4 h-4" />连接 Google
              </Button>
            )}
            {connected && !datasourceReady && (
              <Button onClick={handleSetupDatasource} disabled={setupLoading} className="bg-blue-600 hover:bg-blue-700 text-white gap-2 text-sm">
                {setupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                初始化 Data Source
              </Button>
            )}
            {connected && datasourceReady && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium px-3 py-1.5 rounded-lg bg-emerald-500/10">
                <CheckCircle2 className="w-3.5 h-3.5" />就绪
              </span>
            )}
          </div>
        </div>

        {/* 工具栏 */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* 店铺选择 */}
          <select
            value={selectedShopId || ""}
            onChange={e => { setSelectedShopId(Number(e.target.value)); setPage(1) }}
            className="text-sm bg-[var(--color-card)] border border-[var(--color-border)] text-white rounded-lg px-3 py-2 outline-none"
          >
            {shops.map(s => <option key={s.id} value={s.id}>{s.name || s.domain}</option>)}
          </select>

          {/* 搜索 */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1) }}
              placeholder="搜索商品..."
              className="pl-9 text-sm bg-[var(--color-card)] border-[var(--color-border)] text-white"
            />
          </div>

          {/* GMC 状态筛选 */}
          <div className="flex gap-1">
            {(["all", "not_pushed", "pushed"] as const).map(f => (
              <button
                key={f}
                onClick={() => { setFilter(f); setPage(1) }}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${filter === f ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white bg-[var(--color-card)] border border-[var(--color-border)]"}`}
              >
                {f === "all" ? "全部" : f === "not_pushed" ? "未推送" : "已推送"}
              </button>
            ))}
          </div>

          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncStatus}
              disabled={syncing || !connected}
              className="gap-1.5 text-xs border-[var(--color-border)] text-slate-300"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              同步状态
            </Button>
            <Button
              size="sm"
              onClick={handlePush}
              disabled={pushing || selectedIds.size === 0 || !datasourceReady}
              className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white"
            >
              {pushing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
              推送到 GMC {selectedIds.size > 0 && `(${selectedIds.size})`}
            </Button>
          </div>
        </div>

        {/* 商品列表 */}
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
          {/* 表头 */}
          <div className="grid grid-cols-[40px_56px_1fr_80px_80px_110px_40px] gap-3 px-4 py-2.5 text-xs text-slate-500 font-medium border-b" style={{ background: "var(--color-card-header)", borderColor: "var(--color-border)" }}>
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={products.length > 0 && selectedIds.size === products.length}
                onChange={toggleAll}
                className="w-3.5 h-3.5 accent-blue-500"
              />
            </div>
            <div />
            <div>商品名称</div>
            <div>价格</div>
            <div>状态</div>
            <div>GMC 状态</div>
            <div />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />加载中...
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-slate-500 gap-2">
              <ShoppingCart className="w-8 h-8 opacity-30" />
              <p className="text-sm">暂无商品，请先同步 Shopify 商品缓存</p>
            </div>
          ) : (
            products.map(p => {
              const gmcCfg = STATUS_CONFIG[p.gmc_status] || STATUS_CONFIG["not_pushed"]
              const isSelected = selectedIds.has(p.shopify_product_id)
              return (
                <div
                  key={p.shopify_product_id}
                  onClick={() => toggleSelect(p.shopify_product_id)}
                  className={`grid grid-cols-[40px_56px_1fr_80px_80px_110px_40px] gap-3 px-4 py-3 border-b items-center cursor-pointer transition-colors ${isSelected ? "bg-blue-500/5" : "hover:bg-[var(--color-sidebar-accent)]"}`}
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <div onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(p.shopify_product_id)}
                      className="w-3.5 h-3.5 accent-blue-500"
                    />
                  </div>
                  <div className="w-11 h-11 rounded-lg overflow-hidden bg-slate-800 shrink-0">
                    {p.image_url
                      ? <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><ShoppingCart className="w-4 h-4 text-slate-600" /></div>
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate font-medium">{p.title}</p>
                    {p.handle && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">{p.handle}</p>
                    )}
                  </div>
                  <div className="text-sm text-white font-medium">
                    {p.price ? `$${p.price}` : "—"}
                  </div>
                  <div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-700 text-slate-400"}`}>
                      {p.status === "active" ? "上架" : p.status === "draft" ? "草稿" : p.status}
                    </span>
                  </div>
                  <div>
                    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full w-fit ${gmcCfg.color}`}>
                      {gmcCfg.icon}
                      {gmcCfg.label}
                    </span>
                  </div>
                  <div onClick={e => e.stopPropagation()}>
                    {p.handle && (
                      <a
                        href={`https://${p.handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-500 hover:text-white transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-slate-500">共 {total} 件商品</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 w-7 p-0 border-[var(--color-border)]">
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs text-slate-400">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-7 w-7 p-0 border-[var(--color-border)]">
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
