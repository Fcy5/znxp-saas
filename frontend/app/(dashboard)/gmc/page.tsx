"use client"
import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { request, shopApi, type Shop } from "@/lib/api"
import {
  ShoppingCart, Link2, RefreshCw, Search, ChevronLeft, ChevronRight,
  CheckCircle2, Clock, XCircle, Loader2, AlertCircle, TrendingUp,
  BarChart2, Tag, MinusCircle, DollarSign, MousePointerClick, Sparkles,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface SearchTerm {
  search_term: string
  clicks: number
  impressions: number
  cost: number
  conversions: number
  roas: number
}

interface AdProduct {
  title: string
  item_id: string
  clicks: number
  impressions: number
  cost: number
  conversions: number
  roas: number
}

interface AdSummary {
  total_clicks: number
  total_cost: number
  total_conversions: number
  avg_roas: number
}

type GmcFilter = "all" | "pushed" | "not_pushed"
type TabType = "products" | "ads"
type AdsTabType = "terms" | "converting" | "products"
type DaysRange = 7 | 30 | 90

const GMC_STATUS: Record<string, { label: string; color: string; icon?: React.ReactNode }> = {
  not_pushed:  { label: "未推送",  color: "text-slate-400 bg-slate-700/40" },
  pending:     { label: "审核中",  color: "text-amber-400 bg-amber-500/10",   icon: <Clock className="w-3 h-3" /> },
  approved:    { label: "已批准",  color: "text-emerald-400 bg-emerald-500/10", icon: <CheckCircle2 className="w-3 h-3" /> },
  disapproved: { label: "已拒绝",  color: "text-red-400 bg-red-500/10",      icon: <XCircle className="w-3 h-3" /> },
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function GmcPage() {
  const searchParams = useSearchParams()

  // shared
  const [shops, setShops] = useState<Shop[]>([])
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null)
  const [connected, setConnected] = useState(false)
  const [datasourceReady, setDatasourceReady] = useState(false)
  const [tab, setTab] = useState<TabType>("products")
  const [msg, setMsg] = useState("")
  const [msgType, setMsgType] = useState<"ok" | "err">("ok")
  const [setupLoading, setSetupLoading] = useState(false)

  // products tab
  const [products, setProducts] = useState<GmcProduct[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<GmcFilter>("all")
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // ads tab
  const [days, setDays] = useState<DaysRange>(30)
  const [adsLoading, setAdsLoading] = useState(false)
  const [summary, setSummary] = useState<AdSummary | null>(null)
  const [searchTerms, setSearchTerms] = useState<SearchTerm[]>([])
  const [adProducts, setAdProducts] = useState<AdProduct[]>([])
  const [adsTab, setAdsTab] = useState<AdsTabType>("terms")
  const [negKw, setNegKw] = useState("")
  const [addingNeg, setAddingNeg] = useState(false)
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set())
  const [aiAnalysis, setAiAnalysis] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  // 历史转化词
  const [convKws, setConvKws] = useState<any[]>([])
  const [convLoading, setConvLoading] = useState(false)
  const [convSort, setConvSort] = useState("conversions")
  const [convLoaded, setConvLoaded] = useState(false)

  const PER_PAGE = 20

  const showMsg = (text: string, type: "ok" | "err" = "ok") => {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(""), 4000)
  }

  // OAuth callback hints
  useEffect(() => {
    if (searchParams.get("connected") === "1") { showMsg("Google 账号连接成功！"); setConnected(true) }
    if (searchParams.get("error")) showMsg("Google 授权失败，请重试", "err")
  }, [searchParams])

  // Load shops + connection status
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

  // Load products
  const loadProducts = useCallback(async () => {
    if (!selectedShopId) return
    setLoading(true)
    try {
      const res = await request<any>(
        `/gmc/products?shop_id=${selectedShopId}&q=${encodeURIComponent(q)}&gmc_status=${filter === "all" ? "" : filter}&page=${page}&per_page=${PER_PAGE}`
      )
      setProducts(res.data?.products || [])
      setTotal(res.data?.total || 0)
    } catch (e: any) { showMsg(e.message || "加载失败", "err") }
    finally { setLoading(false) }
  }, [selectedShopId, q, filter, page])

  useEffect(() => { if (tab === "products") loadProducts() }, [loadProducts, tab])

  // Load ads data
  const loadAds = useCallback(async () => {
    if (!connected) return
    setAdsLoading(true)
    try {
      const [termsRes, prodRes] = await Promise.all([
        request<any>(`/gmc/ads/search-terms?days=${days}`),
        request<any>(`/gmc/ads/product-performance?days=${days}`),
      ])
      setSearchTerms(termsRes.data?.terms || [])
      setSummary(termsRes.data?.summary || null)
      setAdProducts(prodRes.data?.products || [])
    } catch (e: any) { showMsg(e.message || "广告数据加载失败", "err") }
    finally { setAdsLoading(false) }
  }, [connected, days])

  useEffect(() => { if (tab === "ads") loadAds() }, [loadAds, tab])

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
    } catch (e: any) { showMsg(e.message || "初始化失败", "err") }
    finally { setSetupLoading(false) }
  }

  const handlePush = async () => {
    if (selectedIds.size === 0) return showMsg("请先选择商品", "err")
    setPushing(true)
    try {
      const res = await request<any>("/gmc/push", {
        method: "POST",
        body: JSON.stringify({ shop_id: selectedShopId, shopify_product_ids: Array.from(selectedIds).map(String) }),
      })
      showMsg(res.message || "推送完成")
      setSelectedIds(new Set())
      loadProducts()
    } catch (e: any) { showMsg(e.message || "推送失败", "err") }
    finally { setPushing(false) }
  }

  const handleSyncStatus = async () => {
    setSyncing(true)
    try {
      const res = await request<any>("/gmc/sync-status", { method: "POST", body: JSON.stringify({ shop_id: selectedShopId }) })
      showMsg(res.message || "同步完成")
      loadProducts()
    } catch (e: any) { showMsg(e.message || "同步失败", "err") }
    finally { setSyncing(false) }
  }

  const handleAddNegative = async () => {
    const kws = negKw.split(/[\n,]/).map(k => k.trim()).filter(Boolean)
    if (selectedTerms.size === 0 && kws.length === 0) return showMsg("请输入关键词或选择搜索词", "err")
    const all = [...new Set([...kws, ...Array.from(selectedTerms)])]
    setAddingNeg(true)
    try {
      const res = await request<any>("/gmc/ads/negative-keywords", { method: "POST", body: JSON.stringify({ keywords: all }) })
      showMsg(res.message || "添加成功")
      setNegKw("")
      setSelectedTerms(new Set())
    } catch (e: any) { showMsg(e.message || "添加失败", "err") }
    finally { setAddingNeg(false) }
  }

  const toggleSelect = (pid: number) => setSelectedIds(prev => { const n = new Set(prev); n.has(pid) ? n.delete(pid) : n.add(pid); return n })
  const toggleAll = () => setSelectedIds(selectedIds.size === products.length ? new Set() : new Set(products.map(p => p.shopify_product_id)))
  const toggleTerm = (term: string) => setSelectedTerms(prev => { const n = new Set(prev); n.has(term) ? n.delete(term) : n.add(term); return n })

  const loadConvertingKws = async () => {
    setConvLoading(true)
    try {
      const res = await request<any>(`/gmc/ads/converting-keywords?sort=${convSort}`)
      setConvKws(res.data?.keywords || [])
      setConvLoaded(true)
    } catch (e: any) { showMsg(e.message || "加载失败", "err") }
    finally { setConvLoading(false) }
  }

  const handleAiAnalysis = async () => {
    if (!summary) return showMsg("请先加载广告数据", "err")
    setAiLoading(true)
    setAiAnalysis("")
    try {
      const res = await request<any>("/gmc/ads/ai-analysis", {
        method: "POST",
        body: JSON.stringify({ days, summary, search_terms: searchTerms, ad_products: adProducts }),
      })
      setAiAnalysis(res.data?.analysis || "")
    } catch (e: any) { showMsg(e.message || "AI 分析失败", "err") }
    finally { setAiLoading(false) }
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

        {/* 连接状态 */}
        <div className="rounded-xl border p-4 flex items-center gap-4" style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${connected ? "bg-emerald-500/10" : "bg-slate-700"}`}>
            <ShoppingCart className={`w-5 h-5 ${connected ? "text-emerald-400" : "text-slate-500"}`} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">{connected ? "已连接 Google 账号" : "未连接 Google 账号"}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {connected ? datasourceReady ? "Data Source 就绪，可推送商品 + 查看广告数据" : "需要初始化 Data Source" : "连接后可推送商品到 GMC 并查看广告数据"}
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

        {/* Tab 切换 */}
        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }}>
          {([["products", ShoppingCart, "商品推送"], ["ads", BarChart2, "广告数据"]] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === key ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white"}`}
            >
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {/* ── 商品推送 Tab ── */}
        {tab === "products" && (
          <>
            {/* 工具栏 */}
            <div className="flex items-center gap-3 flex-wrap">
              <select value={selectedShopId || ""} onChange={e => { setSelectedShopId(Number(e.target.value)); setPage(1) }}
                className="text-sm bg-[var(--color-card)] border border-[var(--color-border)] text-white rounded-lg px-3 py-2 outline-none">
                {shops.map(s => <option key={s.id} value={s.id}>{s.name || s.domain}</option>)}
              </select>
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="搜索商品..."
                  className="pl-9 text-sm bg-[var(--color-card)] border-[var(--color-border)] text-white" />
              </div>
              <div className="flex gap-1">
                {(["all", "not_pushed", "pushed"] as const).map(f => (
                  <button key={f} onClick={() => { setFilter(f); setPage(1) }}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${filter === f ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white bg-[var(--color-card)] border border-[var(--color-border)]"}`}>
                    {f === "all" ? "全部" : f === "not_pushed" ? "未推送" : "已推送"}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={handleSyncStatus} disabled={syncing || !connected}
                  className="gap-1.5 text-xs border-[var(--color-border)] text-slate-300">
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />同步状态
                </Button>
                <Button size="sm" onClick={handlePush} disabled={pushing || selectedIds.size === 0 || !datasourceReady}
                  className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white">
                  {pushing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                  推送到 GMC {selectedIds.size > 0 && `(${selectedIds.size})`}
                </Button>
              </div>
            </div>

            {/* 商品列表 */}
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
              <div className="grid grid-cols-[40px_56px_1fr_80px_80px_110px] gap-3 px-4 py-2.5 text-xs text-slate-500 font-medium border-b"
                style={{ background: "var(--color-card-header)", borderColor: "var(--color-border)" }}>
                <div><input type="checkbox" checked={products.length > 0 && selectedIds.size === products.length}
                  onChange={toggleAll} className="w-3.5 h-3.5 accent-blue-500" /></div>
                <div /><div>商品名称</div><div>价格</div><div>状态</div><div>GMC 状态</div>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="w-5 h-5 animate-spin mr-2" />加载中...</div>
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-slate-500 gap-2">
                  <ShoppingCart className="w-8 h-8 opacity-30" /><p className="text-sm">暂无商品，请先同步 Shopify 缓存</p>
                </div>
              ) : products.map(p => {
                const cfg = GMC_STATUS[p.gmc_status] || GMC_STATUS["not_pushed"]
                const sel = selectedIds.has(p.shopify_product_id)
                return (
                  <div key={p.shopify_product_id} onClick={() => toggleSelect(p.shopify_product_id)}
                    className={`grid grid-cols-[40px_56px_1fr_80px_80px_110px] gap-3 px-4 py-3 border-b items-center cursor-pointer transition-colors ${sel ? "bg-blue-500/5" : "hover:bg-[var(--color-sidebar-accent)]"}`}
                    style={{ borderColor: "var(--color-border)" }}>
                    <div onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={sel} onChange={() => toggleSelect(p.shopify_product_id)} className="w-3.5 h-3.5 accent-blue-500" />
                    </div>
                    <div className="w-11 h-11 rounded-lg overflow-hidden bg-slate-800 shrink-0">
                      {p.image_url ? <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><ShoppingCart className="w-4 h-4 text-slate-600" /></div>}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate font-medium">{p.title}</p>
                      {p.handle && <p className="text-xs text-slate-500 truncate mt-0.5">{p.handle}</p>}
                    </div>
                    <div className="text-sm text-white font-medium">{p.price ? `$${p.price}` : "—"}</div>
                    <div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-700 text-slate-400"}`}>
                        {p.status === "active" ? "上架" : p.status === "draft" ? "草稿" : p.status}
                      </span>
                    </div>
                    <div>
                      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full w-fit ${cfg.color}`}>
                        {cfg.icon}{cfg.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

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
          </>
        )}

        {/* ── 广告数据 Tab ── */}
        {tab === "ads" && (
          <>
            {!connected ? (
              <div className="flex flex-col items-center py-20 gap-3 text-slate-500">
                <BarChart2 className="w-10 h-10 opacity-30" />
                <p className="text-sm">请先连接 Google 账号</p>
              </div>
            ) : (
              <>
                {/* 时间范围 + 刷新 */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">时间范围：</span>
                  {([7, 30, 90] as const).map(d => (
                    <button key={d} onClick={() => setDays(d)}
                      className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${days === d ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white bg-[var(--color-card)] border border-[var(--color-border)]"}`}>
                      近 {d} 天
                    </button>
                  ))}
                  <div className="ml-auto flex gap-2">
                    <Button variant="outline" size="sm" onClick={loadAds} disabled={adsLoading}
                      className="gap-1.5 text-xs border-[var(--color-border)] text-slate-300">
                      <RefreshCw className={`w-3.5 h-3.5 ${adsLoading ? "animate-spin" : ""}`} />刷新
                    </Button>
                    <Button size="sm" onClick={handleAiAnalysis} disabled={aiLoading || !summary}
                      className="gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white">
                      {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      AI 分析
                    </Button>
                  </div>
                </div>

                {adsLoading ? (
                  <div className="flex items-center justify-center py-20 text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />加载广告数据中...
                  </div>
                ) : (
                  <>
                    {/* 汇总卡片 */}
                    {summary && (
                      <div className="grid grid-cols-4 gap-3">
                        {[
                          { label: "总点击", value: summary.total_clicks.toLocaleString(), icon: <MousePointerClick className="w-4 h-4" />, color: "text-blue-400" },
                          { label: "总花费", value: `$${summary.total_cost.toFixed(2)}`, icon: <DollarSign className="w-4 h-4" />, color: "text-amber-400" },
                          { label: "总转化", value: summary.total_conversions.toFixed(1), icon: <CheckCircle2 className="w-4 h-4" />, color: "text-emerald-400" },
                          { label: "平均 ROAS", value: `${summary.avg_roas}x`, icon: <TrendingUp className="w-4 h-4" />, color: summary.avg_roas >= 3 ? "text-emerald-400" : summary.avg_roas >= 1 ? "text-amber-400" : "text-red-400" },
                        ].map(card => (
                          <div key={card.label} className="rounded-xl border p-4" style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
                            <div className={`flex items-center gap-2 mb-2 ${card.color}`}>
                              {card.icon}
                              <span className="text-xs text-slate-400">{card.label}</span>
                            </div>
                            <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 子 Tab */}
                    <div className="flex gap-1">
                      {([
                        ["terms", Tag, "搜索词报告"],
                        ["converting", TrendingUp, "历史转化词"],
                        ["products", ShoppingCart, "商品维度"],
                      ] as const).map(([key, Icon, label]) => (
                        <button key={key} onClick={() => setAdsTab(key as any)}
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${adsTab === key ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white bg-[var(--color-card)] border border-[var(--color-border)]"}`}>
                          <Icon className="w-3.5 h-3.5" />{label}
                        </button>
                      ))}
                    </div>

                    {/* 搜索词报告 */}
                    {adsTab === "terms" && (
                      <>
                        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
                          <div className="grid grid-cols-[28px_1fr_60px_80px_70px_70px_60px] gap-3 px-4 py-2.5 text-xs text-slate-500 font-medium border-b"
                            style={{ background: "var(--color-card-header)", borderColor: "var(--color-border)" }}>
                            <div />
                            <div>搜索词</div><div>点击</div><div>展示量</div><div>花费</div><div>转化</div><div>ROAS</div>
                          </div>
                          {searchTerms.length === 0 ? (
                            <div className="flex flex-col items-center py-12 text-slate-500 gap-2">
                              <Tag className="w-7 h-7 opacity-30" /><p className="text-sm">暂无搜索词数据</p>
                            </div>
                          ) : searchTerms.map((t, i) => (
                            <div key={i} onClick={() => toggleTerm(t.search_term)}
                              className={`grid grid-cols-[28px_1fr_60px_80px_70px_70px_60px] gap-3 px-4 py-2.5 border-b items-center cursor-pointer text-sm transition-colors ${selectedTerms.has(t.search_term) ? "bg-red-500/5" : "hover:bg-[var(--color-sidebar-accent)]"}`}
                              style={{ borderColor: "var(--color-border)" }}>
                              <input type="checkbox" checked={selectedTerms.has(t.search_term)} onChange={() => toggleTerm(t.search_term)}
                                onClick={e => e.stopPropagation()} className="w-3.5 h-3.5 accent-red-500" />
                              <span className="text-white truncate">{t.search_term}</span>
                              <span className="text-blue-400 font-medium">{t.clicks}</span>
                              <span className="text-slate-400">{t.impressions.toLocaleString()}</span>
                              <span className="text-amber-400">${t.cost.toFixed(2)}</span>
                              <span className="text-emerald-400">{t.conversions.toFixed(1)}</span>
                              <span className={t.roas >= 3 ? "text-emerald-400 font-medium" : t.roas >= 1 ? "text-amber-400" : "text-red-400"}>
                                {t.roas > 0 ? `${t.roas}x` : "—"}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* 否定关键词区域 */}
                        <div className="rounded-xl border p-4 space-y-3" style={{ background: "var(--color-card)", borderColor: "var(--color-border)" }}>
                          <div className="flex items-center gap-2">
                            <MinusCircle className="w-4 h-4 text-red-400" />
                            <span className="text-sm font-medium text-white">添加否定关键词</span>
                            {selectedTerms.size > 0 && (
                              <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                                已选 {selectedTerms.size} 个搜索词
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">勾选上方搜索词，或手动输入（多个词用逗号或换行分隔）</p>
                          <textarea
                            value={negKw}
                            onChange={e => setNegKw(e.target.value)}
                            placeholder="手动输入否定词，如：free, cheap, diy"
                            rows={2}
                            className="w-full text-sm bg-[var(--color-bg)] border border-[var(--color-border)] text-white rounded-lg px-3 py-2 outline-none resize-none"
                          />
                          <Button onClick={handleAddNegative} disabled={addingNeg || (selectedTerms.size === 0 && !negKw.trim())}
                            className="gap-2 text-sm bg-red-600 hover:bg-red-700 text-white">
                            {addingNeg ? <Loader2 className="w-4 h-4 animate-spin" /> : <MinusCircle className="w-4 h-4" />}
                            添加到购物广告否定词
                          </Button>
                        </div>
                      </>
                    )}

                    {/* 历史转化词 */}
                    {adsTab === "converting" && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs text-slate-400">排序：</span>
                          {([["conversions","转化数"],["roas","ROAS"],["clicks","点击量"]] as const).map(([v,l]) => (
                            <button key={v} onClick={() => setConvSort(v)}
                              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${convSort === v ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white bg-[var(--color-card)] border border-[var(--color-border)]"}`}>
                              {l}
                            </button>
                          ))}
                          <Button size="sm" onClick={loadConvertingKws} disabled={convLoading}
                            className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                            {convLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
                            {convLoaded ? "重新加载" : "加载历史转化词"}
                          </Button>
                          {convKws.length > 0 && (
                            <span className="text-xs text-slate-400 ml-auto">共 {convKws.length} 个有转化词（近 13 个月）</span>
                          )}
                        </div>

                        {convLoading ? (
                          <div className="flex items-center justify-center py-16 text-slate-500">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" />拉取历史转化词中...
                          </div>
                        ) : !convLoaded ? (
                          <div className="flex flex-col items-center py-16 text-slate-500 gap-2">
                            <TrendingUp className="w-8 h-8 opacity-30" />
                            <p className="text-sm">点击「加载历史转化词」拉取账户 13 个月内有转化的全部搜索词</p>
                          </div>
                        ) : convKws.length === 0 ? (
                          <div className="flex flex-col items-center py-16 text-slate-500 gap-2">
                            <TrendingUp className="w-8 h-8 opacity-30" />
                            <p className="text-sm">暂无有转化的历史搜索词</p>
                          </div>
                        ) : (
                          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
                            <div className="grid grid-cols-[1fr_60px_70px_70px_60px_70px] gap-3 px-4 py-2.5 text-xs text-slate-500 font-medium border-b"
                              style={{ background: "var(--color-card-header)", borderColor: "var(--color-border)" }}>
                              <div>搜索词</div><div>点击</div><div>花费</div><div>转化</div><div>ROAS</div><div>CPA</div>
                            </div>
                            {convKws.map((kw, i) => (
                              <div key={i} className="grid grid-cols-[1fr_60px_70px_70px_60px_70px] gap-3 px-4 py-2.5 border-b items-center text-sm hover:bg-[var(--color-sidebar-accent)]"
                                style={{ borderColor: "var(--color-border)" }}>
                                <span className="text-white truncate font-medium">{kw.keyword}</span>
                                <span className="text-blue-400">{kw.clicks}</span>
                                <span className="text-amber-400">${kw.cost.toFixed(2)}</span>
                                <span className="text-emerald-400 font-semibold">{kw.conversions.toFixed(1)}</span>
                                <span className={kw.roas >= 3 ? "text-emerald-400 font-medium" : kw.roas >= 1 ? "text-amber-400" : "text-red-400"}>
                                  {kw.roas > 0 ? `${kw.roas}x` : "—"}
                                </span>
                                <span className="text-slate-400">{kw.cpa > 0 ? `$${kw.cpa}` : "—"}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* AI 分析结果 */}
                    {(aiLoading || aiAnalysis) && (
                      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
                        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ background: "var(--color-card-header)", borderColor: "var(--color-border)" }}>
                          <Sparkles className="w-4 h-4 text-violet-400" />
                          <span className="text-sm font-medium text-white">AI 广告优化分析</span>
                          {aiLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400 ml-1" />}
                        </div>
                        <div className="p-4" style={{ background: "var(--color-card)" }}>
                          {aiLoading ? (
                            <div className="flex items-center gap-2 text-slate-400 text-sm py-4 justify-center">
                              <Loader2 className="w-4 h-4 animate-spin" />AI 正在分析中，约 10-20 秒...
                            </div>
                          ) : (
                            <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{aiAnalysis}</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 商品维度表现 */}
                    {adsTab === "products" && (
                      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
                        <div className="grid grid-cols-[1fr_60px_80px_70px_70px_60px] gap-3 px-4 py-2.5 text-xs text-slate-500 font-medium border-b"
                          style={{ background: "var(--color-card-header)", borderColor: "var(--color-border)" }}>
                          <div>商品</div><div>点击</div><div>展示量</div><div>花费</div><div>转化</div><div>ROAS</div>
                        </div>
                        {adProducts.length === 0 ? (
                          <div className="flex flex-col items-center py-12 text-slate-500 gap-2">
                            <ShoppingCart className="w-7 h-7 opacity-30" /><p className="text-sm">暂无商品广告数据</p>
                          </div>
                        ) : adProducts.map((p, i) => (
                          <div key={i} className="grid grid-cols-[1fr_60px_80px_70px_70px_60px] gap-3 px-4 py-2.5 border-b items-center text-sm"
                            style={{ borderColor: "var(--color-border)" }}>
                            <div className="min-w-0">
                              <p className="text-white truncate">{p.title || p.item_id}</p>
                              {p.item_id && <p className="text-xs text-slate-500 truncate">ID: {p.item_id}</p>}
                            </div>
                            <span className="text-blue-400 font-medium">{p.clicks}</span>
                            <span className="text-slate-400">{p.impressions.toLocaleString()}</span>
                            <span className="text-amber-400">${p.cost.toFixed(2)}</span>
                            <span className="text-emerald-400">{p.conversions.toFixed(1)}</span>
                            <span className={p.roas >= 3 ? "text-emerald-400 font-medium" : p.roas >= 1 ? "text-amber-400" : "text-red-400"}>
                              {p.roas > 0 ? `${p.roas}x` : "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
