"use client"
import { useEffect, useState, useRef } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Play, Loader2, Search, RefreshCw, ExternalLink,
  Image as ImageIcon, X, ChevronLeft, ChevronRight,
  Clock, CheckCircle2, AlertCircle, Rocket, Heart, Flower2,
} from "lucide-react"
import { request, STATIC_BASE, API_BASE } from "@/lib/api"

interface XhsProduct {
  id: number
  title: string
  description: string
  images: string[]
  author_name: string
  author_avatar: string
  likes_count: number
  xhs_url: string
  keyword: string
  created_at: string | null
}

interface Shop {
  id: number
  name: string
  domain: string
}

interface PageInfo { page: number; page_size: number; total: number; total_pages: number }

interface SpiderStatus {
  running: boolean
  last_result: { inserted?: number; parsed?: number; keywords?: string[]; error?: string } | null
  last_run_at: string | null
  schedule: { enabled: boolean; cron: string; max_scrolls: number; next_run: string | null }
}

const CRON_PRESETS = [
  { label: "每天 8 点", value: "0 8 * * *" },
  { label: "每天 12 点", value: "0 12 * * *" },
  { label: "每天 20 点", value: "0 20 * * *" },
  { label: "每 12 小时", value: "0 */12 * * *" },
]

export default function XiaohongshuPage() {
  const [products, setProducts] = useState<XhsProduct[]>([])
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState("")

  // spider
  const [showSpider, setShowSpider] = useState(false)
  const [maxScrolls, setMaxScrolls] = useState(10)
  const [running, setRunning] = useState(false)
  const [spiderResult, setSpiderResult] = useState<SpiderStatus["last_result"]>(null)
  const [status, setStatus] = useState<SpiderStatus | null>(null)
  const [builtinKeywords, setBuiltinKeywords] = useState<string[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // schedule
  const [schedEnabled, setSchedEnabled] = useState(false)
  const [schedCron, setSchedCron] = useState("0 8 * * *")
  const [schedScrolls, setSchedScrolls] = useState(10)
  // schedKeyword removed — spider auto-rotates built-in keywords
  const [schedSaving, setSchedSaving] = useState(false)
  const [schedMsg, setSchedMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // publish modal
  const [publishTarget, setPublishTarget] = useState<XhsProduct | null>(null)
  const [shops, setShops] = useState<Shop[]>([])
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null)
  const [publishTitle, setPublishTitle] = useState("")
  const [publishPrice, setPublishPrice] = useState("29.99")
  const [publishTags, setPublishTags] = useState("embroidery,custom,刺绣")
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<{ ok: boolean; text: string } | null>(null)

  // lightbox
  const [lightbox, setLightbox] = useState<{ srcs: string[]; idx: number } | null>(null)

  // XHS CDN 图片走后端代理解决 Referer 403
  const staticUrl = (src: string) => {
    if (!src) return src
    if (src.startsWith("/static/")) return `${STATIC_BASE}${src}`
    if (src.includes("xhscdn.com")) return `${API_BASE}/xiaohongshu/img-proxy?url=${encodeURIComponent(src)}`
    return src
  }

  const load = async (p = page) => {
    setLoading(true)
    setLoadError("")
    try {
      const q = new URLSearchParams({ page: String(p), page_size: "20" })
      if (keyword) q.set("keyword", keyword)
      const res = await request<{ data: XhsProduct[]; page_info: PageInfo }>(`/xiaohongshu/products?${q}`)
      setProducts(res.data || [])
      setPageInfo(res.page_info)
      setPage(p)
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }

  const fetchStatus = async () => {
    const res = await request<{ data: SpiderStatus }>("/xiaohongshu/spider/status")
    const s = res.data
    setStatus(s)
    setRunning(s.running)
    if (s.last_result) setSpiderResult(s.last_result)
    if (s.schedule) {
      setSchedEnabled(s.schedule.enabled)
      setSchedCron(s.schedule.cron)
      setSchedScrolls(s.schedule.max_scrolls)
    }
    return s
  }

  const fetchKeywords = async () => {
    try {
      const res = await request<{ data: string[] }>("/xiaohongshu/spider/keywords")
      setBuiltinKeywords(res.data || [])
    } catch { /* ignore */ }
  }

  const fetchShops = async () => {
    try {
      const res = await request<{ data: Shop[] }>("/shops/")
      setShops(res.data || [])
      if (res.data?.length > 0 && !selectedShopId) {
        setSelectedShopId(res.data[0].id)
      }
    } catch { /* ignore */ }
  }

  useEffect(() => { load(1); fetchStatus(); fetchShops(); fetchKeywords() }, [])

  const checkStatus = async () => {
    const s = await fetchStatus()
    if (!s.running) {
      if (pollRef.current) clearInterval(pollRef.current)
      load(1)
    }
  }

  const startSpider = async () => {
    setRunning(true)
    setSpiderResult(null)
    await request("/xiaohongshu/spider/run", {
      method: "POST",
      body: JSON.stringify({ max_scrolls: maxScrolls, headless: true }),
    })
    pollRef.current = setInterval(checkStatus, 5000)
  }

  const saveSchedule = async () => {
    setSchedSaving(true)
    setSchedMsg(null)
    try {
      await request("/xiaohongshu/spider/schedule", {
        method: "POST",
        body: JSON.stringify({ enabled: schedEnabled, cron: schedCron, max_scrolls: schedScrolls }),
      })
      await fetchStatus()
      setSchedMsg({ ok: true, text: schedEnabled ? "已开启定时爬取" : "已关闭定时任务" })
    } catch (e: any) {
      setSchedMsg({ ok: false, text: e.message || "保存失败" })
    } finally {
      setSchedSaving(false)
    }
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const openPublish = (product: XhsProduct) => {
    setPublishTarget(product)
    setPublishTitle(product.title)
    setPublishResult(null)
    if (shops.length === 0) fetchShops()
  }

  const doPublish = async () => {
    if (!publishTarget || !selectedShopId) return
    setPublishing(true)
    setPublishResult(null)
    try {
      const res = await request<{ data: { shopify_url: string } }>("/xiaohongshu/publish", {
        method: "POST",
        body: JSON.stringify({
          xhs_product_id: publishTarget.id,
          shop_id: selectedShopId,
          title: publishTitle,
          price: parseFloat(publishPrice) || 29.99,
          tags: publishTags,
        }),
      })
      setPublishResult({ ok: true, text: `上架成功！${res.data?.shopify_url ? " 已同步到 Shopify。" : ""}` })
    } catch (e: any) {
      setPublishResult({ ok: false, text: e.message || "上架失败" })
    } finally {
      setPublishing(false)
    }
  }

  const formatLikes = (n: number) => {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
    return String(n)
  }

  return (
    <div className="flex flex-col min-h-full">
      <Header title="小红书选品" />
      <div className="flex-1 p-6 space-y-5">

        {/* 定时状态条 */}
        {status?.schedule?.enabled && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            定时爬取已开启 · {status.schedule.cron} · 自动轮询全部刺绣关键词
            {status.schedule.next_run && (
              <span className="text-rose-400/70 ml-1">· 下次: {status.schedule.next_run.slice(0, 19)}</span>
            )}
            {status.last_run_at && (
              <span className="text-rose-400/50 ml-auto">上次运行: {status.last_run_at}</span>
            )}
          </div>
        )}

        {/* toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input className="pl-9 h-9 w-56 text-sm" placeholder="搜索标题/作者/关键词..."
              value={keyword} onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && load(1)} />
          </div>
          <div className="flex-1" />
          <p className="text-xs text-muted-foreground">共 {pageInfo?.total ?? 0} 条</p>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => load(1)}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" className="gap-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white border-0" onClick={() => setShowSpider(true)}>
            <Flower2 className="w-3.5 h-3.5" /> 爬虫设置
          </Button>
        </div>

        {/* product grid */}
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
          </div>
        ) : loadError ? (
          <div className="text-center py-16 text-sm text-destructive">{loadError}</div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Flower2 className="w-12 h-12 text-muted-foreground/20 mx-auto" />
            <p className="text-sm text-muted-foreground">暂无小红书商品，运行爬虫获取数据</p>
            <Button size="sm" variant="outline" onClick={() => setShowSpider(true)}>
              <Play className="w-3.5 h-3.5 mr-1.5" /> 立即爬取
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {products.map(product => {
              const imgSrcs = (product.images || []).map(staticUrl).filter(Boolean)
              const thumb = imgSrcs[0] || null
              const avatar = product.author_avatar ? staticUrl(product.author_avatar) : null

              return (
                <Card key={product.id} className="overflow-hidden card-hover group">
                  {/* 图片区 */}
                  <div className="aspect-square bg-secondary relative overflow-hidden cursor-pointer"
                    onClick={() => imgSrcs.length > 0 && setLightbox({ srcs: imgSrcs, idx: 0 })}>
                    {thumb ? (
                      <img src={thumb} alt={product.title}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-10 h-10 text-muted-foreground/20" />
                      </div>
                    )}
                    {/* 多图标记 */}
                    {imgSrcs.length > 1 && (
                      <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-md">
                        {imgSrcs.length}图
                      </div>
                    )}
                    {/* 点赞数 */}
                    {product.likes_count > 0 && (
                      <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-md">
                        <Heart className="w-3 h-3 fill-rose-400 text-rose-400" />
                        {formatLikes(product.likes_count)}
                      </div>
                    )}
                  </div>

                  <CardContent className="p-3 space-y-2.5">
                    {/* 标题 */}
                    <p className="text-sm font-medium line-clamp-2 leading-snug" title={product.title}>
                      {product.title || "无标题"}
                    </p>

                    {/* 作者 */}
                    <div className="flex items-center gap-2">
                      {avatar ? (
                        <img src={avatar} alt="" className="w-5 h-5 rounded-full object-cover border border-border" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center text-[8px] text-rose-400 font-bold shrink-0">
                          {product.author_name?.[0] || "R"}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground truncate">{product.author_name || "未知作者"}</p>
                      {product.xhs_url && (
                        <Button size="sm" variant="ghost" className="ml-auto h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={() => window.open(product.xhs_url, "_blank")}>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </Button>
                      )}
                    </div>

                    {/* 上架按钮 */}
                    <Button size="sm" className="w-full gap-1.5 text-xs h-7 bg-rose-600 hover:bg-rose-700 text-white border-0"
                      onClick={() => openPublish(product)}>
                      <Rocket className="w-3 h-3" /> 上架到 Shopify
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* 分页 */}
        {pageInfo && pageInfo.total_pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => load(page - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground">{page} / {pageInfo.total_pages}</span>
            <Button size="sm" variant="outline" disabled={page >= pageInfo.total_pages} onClick={() => load(page + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* ── 爬虫设置 Modal ── */}
      {showSpider && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => !running && setShowSpider(false)}>
          <Card className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Flower2 className="w-4 h-4 text-rose-400" /> 小红书爬虫设置
              </CardTitle>
              {!running && (
                <button onClick={() => setShowSpider(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </CardHeader>
            <CardContent className="space-y-5">

              {/* 手动运行 */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">手动运行</p>

                {/* 内置关键词展示 */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">内置刺绣关键词（自动全部轮询）</label>
                  <div className="flex flex-wrap gap-1.5">
                    {builtinKeywords.map(k => (
                      <span key={k} className="text-[10px] px-2 py-1 rounded-md border border-rose-500/30 bg-rose-500/5 text-rose-400">
                        {k}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">一键抓取以上所有品类，按点赞数排序，自动去重入库</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">每个关键词滚动次数</label>
                  <Input type="number" min={3} max={30} value={maxScrolls}
                    onChange={e => setMaxScrolls(Number(e.target.value))} disabled={running} />
                  <p className="text-[10px] text-muted-foreground">
                    预计总耗时: ~{Math.ceil(builtinKeywords.length * maxScrolls * 3.5 / 60)} 分钟
                  </p>
                </div>

                {running && (
                  <div className="flex items-center gap-2 text-sm text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2.5">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    正在轮询 {builtinKeywords.length} 个关键词，预计 {Math.ceil(builtinKeywords.length * maxScrolls * 3.5 / 60)} 分钟...
                  </div>
                )}
                {spiderResult && (
                  <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${spiderResult.error ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-400"}`}>
                    {spiderResult.error
                      ? <><AlertCircle className="w-4 h-4 shrink-0" />{spiderResult.error}</>
                      : <><CheckCircle2 className="w-4 h-4 shrink-0" />轮询 {spiderResult.keywords?.length ?? "?"} 个关键词，解析 {spiderResult.parsed} 条，新增入库 {spiderResult.inserted} 条</>}
                  </div>
                )}

                <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-xs text-amber-400 space-y-1">
                  <p className="font-medium">须知</p>
                  <p>小红书需要登录态才能获取商品数据。请将 cookies 保存到 <code className="font-mono bg-amber-500/10 px-1 py-0.5 rounded">backend/spider/xhs_cookies.json</code></p>
                  <p>未提供 cookies 时将尝试以未登录状态爬取（可能数据较少）</p>
                </div>

                <Button className="w-full gap-2 bg-rose-600 hover:bg-rose-700 text-white border-0"
                  onClick={startSpider} disabled={running}>
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {running ? "运行中..." : "一键抓取最热刺绣品"}
                </Button>
              </div>

              <div className="border-t border-border" />

              {/* 定时任务 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">定时自动爬取</p>
                  <button
                    onClick={() => setSchedEnabled(v => !v)}
                    className={`w-10 h-5 rounded-full flex items-center px-0.5 transition-colors ${schedEnabled ? "bg-rose-500 justify-end" : "bg-secondary border border-border justify-start"}`}
                  >
                    <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                  </button>
                </div>

                {schedEnabled && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">爬取频率</label>
                      <Input value={schedCron} onChange={e => setSchedCron(e.target.value)}
                        className="font-mono text-xs" placeholder="0 8 * * *" />
                      <div className="flex flex-wrap gap-1.5">
                        {CRON_PRESETS.map(p => (
                          <button key={p.value}
                            onClick={() => setSchedCron(p.value)}
                            className={`text-[10px] px-2 py-1 rounded-md border transition-all ${schedCron === p.value ? "border-rose-500 bg-rose-500/10 text-rose-400" : "border-border text-muted-foreground hover:text-foreground"}`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">滚动次数</label>
                      <Input type="number" min={5} max={50} value={schedScrolls}
                        onChange={e => setSchedScrolls(Number(e.target.value))} />
                    </div>
                  </>
                )}

                {schedMsg && (
                  <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${schedMsg.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
                    {schedMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                    {schedMsg.text}
                  </div>
                )}

                <Button variant="outline" className="w-full gap-2" onClick={saveSchedule} disabled={schedSaving}>
                  {schedSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                  保存定时设置
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 上架 Modal ── */}
      {publishTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => !publishing && setPublishTarget(null)}>
          <Card className="w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Rocket className="w-4 h-4 text-rose-400" /> 上架到 Shopify
              </CardTitle>
              {!publishing && (
                <button onClick={() => setPublishTarget(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 商品预览 */}
              {publishTarget.images?.[0] && (
                <div className="flex gap-3 p-3 bg-secondary/50 rounded-lg">
                  <img src={staticUrl(publishTarget.images[0])} alt=""
                    className="w-16 h-16 object-cover rounded-md border border-border shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium line-clamp-2">{publishTarget.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{publishTarget.author_name}</p>
                  </div>
                </div>
              )}

              {/* 选择店铺 */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">目标店铺</label>
                {shops.length === 0 ? (
                  <p className="text-xs text-amber-400">请先在"我的店铺"中添加 Shopify 店铺</p>
                ) : (
                  <select
                    value={selectedShopId || ""}
                    onChange={e => setSelectedShopId(Number(e.target.value))}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {shops.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.domain})</option>
                    ))}
                  </select>
                )}
              </div>

              {/* 标题 */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">商品标题</label>
                <Input value={publishTitle} onChange={e => setPublishTitle(e.target.value)}
                  className="text-sm" placeholder="商品标题" />
              </div>

              {/* 价格 */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">售价（USD）</label>
                <Input type="number" min="0.01" step="0.01" value={publishPrice}
                  onChange={e => setPublishPrice(e.target.value)} className="text-sm" />
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">标签（逗号分隔）</label>
                <Input value={publishTags} onChange={e => setPublishTags(e.target.value)}
                  className="text-sm" placeholder="embroidery,custom" />
              </div>

              {publishResult && (
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${publishResult.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
                  {publishResult.ok
                    ? <><CheckCircle2 className="w-4 h-4 shrink-0" />{publishResult.text}</>
                    : <><AlertCircle className="w-4 h-4 shrink-0" />{publishResult.text}</>}
                </div>
              )}

              <Button className="w-full gap-2 bg-rose-600 hover:bg-rose-700 text-white border-0"
                onClick={doPublish} disabled={publishing || !selectedShopId || shops.length === 0}>
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                {publishing ? "上架中..." : "确认上架"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60]"
          onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/60 hover:text-white" onClick={() => setLightbox(null)}>
            <X className="w-6 h-6" />
          </button>
          <img src={lightbox.srcs[lightbox.idx]} alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={e => e.stopPropagation()} />
          {lightbox.srcs.length > 1 && (
            <>
              <button className="absolute left-4 text-white/60 hover:text-white"
                onClick={e => { e.stopPropagation(); setLightbox(l => l && ({ ...l, idx: (l.idx - 1 + l.srcs.length) % l.srcs.length })) }}>
                <ChevronLeft className="w-8 h-8" />
              </button>
              <button className="absolute right-4 text-white/60 hover:text-white"
                onClick={e => { e.stopPropagation(); setLightbox(l => l && ({ ...l, idx: (l.idx + 1) % l.srcs.length })) }}>
                <ChevronRight className="w-8 h-8" />
              </button>
              <div className="absolute bottom-4 text-white/60 text-sm">
                {lightbox.idx + 1} / {lightbox.srcs.length}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
