"use client"
import { useEffect, useState, useRef } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Play, Loader2, Search, RefreshCw, ExternalLink,
  Image as ImageIcon, Video, LayoutGrid, X, ChevronLeft, ChevronRight,
  Clock, CheckCircle2, AlertCircle, Download,
} from "lucide-react"
import { request, STATIC_BASE } from "@/lib/api"

interface FbAd {
  id: number
  store_name: string
  store_icon: string[]
  advertising_text: string
  advertising_img: string[]
  advertising_video: string[]
  advertising_type: string
  fb_url: string[]
  advertising_time: string | null
}

interface PageInfo { page: number; page_size: number; total: number; total_pages: number }

interface SpiderStatus {
  running: boolean
  last_result: { inserted?: number; parsed?: number; error?: string } | null
  last_run_at: string | null
  schedule: {
    enabled: boolean
    cron: string
    keyword: string
    max_scrolls: number
    next_run: string | null
  }
}

// 快捷 cron 预设
const CRON_PRESETS = [
  { label: "每天 6 点", value: "0 6 * * *" },
  { label: "每天 12 点", value: "0 12 * * *" },
  { label: "每天 18 点", value: "0 18 * * *" },
  { label: "每 6 小时", value: "0 */6 * * *" },
  { label: "每 12 小时", value: "0 */12 * * *" },
]

export default function FacebookPage() {
  const [ads, setAds] = useState<FbAd[]>([])
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState("")
  const [adType, setAdType] = useState("")

  // spider modal
  const [showSpider, setShowSpider] = useState(false)
  const [spiderKeyword, setSpiderKeyword] = useState("embroidery")
  const [maxScrolls, setMaxScrolls] = useState(20)
  const [running, setRunning] = useState(false)
  const [spiderResult, setSpiderResult] = useState<SpiderStatus["last_result"]>(null)
  const [status, setStatus] = useState<SpiderStatus | null>(null)

  // schedule form
  const [schedEnabled, setSchedEnabled] = useState(false)
  const [schedCron, setSchedCron] = useState("0 6 * * *")
  const [schedKeyword, setSchedKeyword] = useState("embroidery")
  const [schedScrolls, setSchedScrolls] = useState(20)
  const [schedSaving, setSchedSaving] = useState(false)
  const [schedMsg, setSchedMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // sync media
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncResult, setSyncResult] = useState<{ updated?: number; skipped?: number; error?: string } | null>(null)
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // lightbox
  const [lightbox, setLightbox] = useState<{ srcs: string[]; idx: number } | null>(null)

  const load = async (p = page) => {
    setLoading(true)
    setLoadError("")
    try {
      const q = new URLSearchParams({ page: String(p), page_size: "20" })
      if (keyword) q.set("keyword", keyword)
      if (adType) q.set("ad_type", adType)
      const res = await request<{ data: FbAd[]; page_info: PageInfo }>(`/facebook/ads?${q}`)
      setAds(res.data || [])
      setPageInfo(res.page_info)
      setPage(p)
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }

  const fetchStatus = async () => {
    const res = await request<{ data: SpiderStatus }>("/facebook/spider/status")
    const s = res.data
    setStatus(s)
    setRunning(s.running)
    if (s.last_result) setSpiderResult(s.last_result)
    // sync schedule form
    if (s.schedule) {
      setSchedEnabled(s.schedule.enabled)
      setSchedCron(s.schedule.cron)
      if (s.schedule.keyword) setSchedKeyword(s.schedule.keyword)
      setSchedScrolls(s.schedule.max_scrolls)
    }
    return s
  }

  useEffect(() => { load(1); fetchStatus() }, [])

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
    await request("/facebook/spider/run", {
      method: "POST",
      body: JSON.stringify({ keyword: spiderKeyword, max_scrolls: maxScrolls, headless: true }),
    })
    pollRef.current = setInterval(checkStatus, 5000)
  }

  const saveSchedule = async () => {
    setSchedSaving(true)
    setSchedMsg(null)
    try {
      await request("/facebook/spider/schedule", {
        method: "POST",
        body: JSON.stringify({ enabled: schedEnabled, cron: schedCron, keyword: schedKeyword, max_scrolls: schedScrolls }),
      })
      await fetchStatus()
      setSchedMsg({ ok: true, text: schedEnabled ? `已开启，下次执行: ${status?.schedule?.next_run?.slice(0, 19) ?? "计算中..."}` : "已关闭定时任务" })
    } catch (e: any) {
      setSchedMsg({ ok: false, text: e.message || "保存失败" })
    } finally {
      setSchedSaving(false)
    }
  }

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (syncPollRef.current) clearInterval(syncPollRef.current)
  }, [])

  const fetchSyncStatus = async () => {
    const res = await request<{ data: { running: boolean; last_result: typeof syncResult; last_run_at: string | null } }>("/facebook/ads/sync-status")
    const s = res.data
    setSyncRunning(s.running)
    if (s.last_result) setSyncResult(s.last_result)
    if (!s.running && syncPollRef.current) {
      clearInterval(syncPollRef.current)
      syncPollRef.current = null
    }
    return s
  }

  const startSync = async () => {
    setSyncRunning(true)
    setSyncResult(null)
    await request("/facebook/ads/sync-media", { method: "POST" })
    syncPollRef.current = setInterval(fetchSyncStatus, 5000)
  }

  // resolve static URL for locally downloaded files
  const staticUrl = (src: string) => src?.startsWith("/static/") ? `${STATIC_BASE}${src}` : src

  const isImg = (src: string) => Boolean(src) && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(src)
  const isVid = (src: string) => /\.(mp4|mov|webm)(\?|$)/i.test(src)

  const TYPE_BADGE: Record<string, string> = {
    Image: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    Video: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    Slideshow: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  }

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Facebook 广告库" />
      <div className="flex-1 p-6 space-y-5">

        {/* 定时状态条 */}
        {status?.schedule?.enabled && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            定时爬取已开启 · {status.schedule.cron}
            {status.schedule.next_run && (
              <span className="text-emerald-400/70 ml-1">· 下次: {status.schedule.next_run.slice(0, 19)}</span>
            )}
            {status.last_run_at && (
              <span className="text-emerald-400/50 ml-auto">上次运行: {status.last_run_at}</span>
            )}
          </div>
        )}

        {/* sync result banner */}
        {syncResult && !syncRunning && (
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs ${syncResult.error ? "bg-destructive/10 border-destructive/20 text-destructive" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"}`}>
            {syncResult.error
              ? <><AlertCircle className="w-3.5 h-3.5 shrink-0" />媒体同步出错: {syncResult.error}</>
              : <><CheckCircle2 className="w-3.5 h-3.5 shrink-0" />媒体同步完成: 更新 {syncResult.updated} 条，跳过 {syncResult.skipped} 条</>}
            <button className="ml-auto" onClick={() => setSyncResult(null)}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {syncRunning && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />正在下载广告图片/视频到本地，请稍候...
          </div>
        )}

        {/* toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input className="pl-9 h-9 w-56 text-sm" placeholder="搜索店铺/文案..."
              value={keyword} onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && load(1)} />
          </div>
          <div className="flex gap-1 text-xs">
            {["", "Image", "Video", "Slideshow"].map(t => (
              <button key={t}
                onClick={() => { setAdType(t); load(1) }}
                className={`px-2.5 py-1.5 rounded-lg border transition-all ${adType === t ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {t ? { Image: "图片", Video: "视频", Slideshow: "轮播" }[t] : "全部"}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <p className="text-xs text-muted-foreground">共 {pageInfo?.total ?? 0} 条</p>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => load(1)}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={startSync} disabled={syncRunning} title="批量下载所有广告图片/视频到本地">
            {syncRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {syncRunning ? "同步中..." : "同步媒体"}
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => setShowSpider(true)}>
            <Play className="w-3.5 h-3.5" /> 爬虫设置
          </Button>
        </div>

        {/* ads grid */}
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
          </div>
        ) : loadError ? (
          <div className="text-center py-16 text-sm text-destructive">{loadError}</div>
        ) : ads.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">暂无广告数据</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ads.map(ad => {
              const imgSrcs = (ad.advertising_img ?? []).map(staticUrl).filter(isImg)
              const vidSrcs = (ad.advertising_video ?? []).map(staticUrl).filter(isVid)
              const thumb = imgSrcs[0] || null
              const icon = ad.store_icon?.[0] ? staticUrl(ad.store_icon[0]) : null
              const typeClass = TYPE_BADGE[ad.advertising_type] || "bg-secondary text-muted-foreground border-border"

              return (
                <Card key={ad.id} className="overflow-hidden card-hover">
                  <div className="aspect-video bg-secondary relative overflow-hidden cursor-pointer"
                    onClick={() => imgSrcs.length > 0 && setLightbox({ srcs: imgSrcs, idx: 0 })}>
                    {thumb ? (
                      <img src={thumb} alt="" className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
                    ) : vidSrcs[0] ? (
                      <video src={vidSrcs[0]} className="w-full h-full object-cover" muted />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-10 h-10 text-muted-foreground/20" />
                      </div>
                    )}
                    <div className="absolute top-2 left-2 flex gap-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${typeClass}`}>
                        {ad.advertising_type === "Video" ? "视频" : ad.advertising_type === "Slideshow" ? "轮播" : "图片"}
                      </span>
                      {imgSrcs.length > 1 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md border bg-black/40 text-white border-transparent flex items-center gap-0.5">
                          <LayoutGrid className="w-2.5 h-2.5" /> {imgSrcs.length}
                        </span>
                      )}
                    </div>
                    {vidSrcs[0] && !thumb && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center">
                          <Video className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    )}
                  </div>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      {icon ? (
                        <img src={icon} alt="" className="w-7 h-7 rounded-full object-cover border border-border" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] text-blue-400 font-bold">
                          {ad.store_name?.[0]?.toUpperCase() || "F"}
                        </div>
                      )}
                      <p className="text-sm font-medium truncate flex-1">{ad.store_name || "未知店铺"}</p>
                    </div>
                    {ad.advertising_text && ad.advertising_text !== "无文案" && (
                      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{ad.advertising_text}</p>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      {ad.advertising_time && (
                        <span className="text-[10px] text-muted-foreground">{ad.advertising_time.slice(0, 10)}</span>
                      )}
                      {ad.fb_url?.[0] && (
                        <Button size="sm" variant="ghost" className="text-xs h-7 gap-1 text-muted-foreground hover:text-foreground ml-auto"
                          onClick={() => window.open(ad.fb_url[0], "_blank")}>
                          <ExternalLink className="w-3 h-3" /> 查看原帖
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {!loading && ads.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-20">暂无广告数据，运行爬虫获取数据</div>
        )}

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

      {/* spider + schedule modal */}
      {showSpider && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => !running && setShowSpider(false)}>
          <Card className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Play className="w-4 h-4 text-blue-400" /> FB 爬虫设置
              </CardTitle>
              {!running && (
                <button onClick={() => setShowSpider(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </CardHeader>
            <CardContent className="space-y-5">

              {/* ── 手动运行 ── */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">手动运行</p>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">搜索关键词</label>
                  <Input value={spiderKeyword} onChange={e => setSpiderKeyword(e.target.value)}
                    disabled={running} className="text-xs" placeholder="e.g. embroidery" />
                  <p className="text-[10px] text-muted-foreground">输入关键词，系统自动构造 FB 广告库搜索链接</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">滚动次数（越多数据越多，速度越慢）</label>
                  <Input type="number" min={5} max={50} value={maxScrolls}
                    onChange={e => setMaxScrolls(Number(e.target.value))} disabled={running} />
                </div>

                {running && (
                  <div className="flex items-center gap-2 text-sm text-blue-400 bg-blue-500/10 rounded-lg px-3 py-2.5">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    爬虫运行中，预计 {Math.ceil(maxScrolls * 4 / 60)} 分钟...
                  </div>
                )}
                {spiderResult && (
                  <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${spiderResult.error ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-400"}`}>
                    {spiderResult.error
                      ? <><AlertCircle className="w-4 h-4 shrink-0" />{spiderResult.error}</>
                      : <><CheckCircle2 className="w-4 h-4 shrink-0" />解析 {spiderResult.parsed} 条，新增入库 {spiderResult.inserted} 条</>}
                  </div>
                )}

                <Button className="w-full gap-2" onClick={startSpider} disabled={running || !spiderKeyword}>
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {running ? "运行中..." : "立即运行"}
                </Button>
              </div>

              <div className="border-t border-border" />

              {/* ── 定时任务 ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">定时自动爬取</p>
                  <button
                    onClick={() => setSchedEnabled(v => !v)}
                    className={`w-10 h-5 rounded-full flex items-center px-0.5 transition-colors ${schedEnabled ? "bg-primary justify-end" : "bg-secondary border border-border justify-start"}`}
                  >
                    <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                  </button>
                </div>

                {schedEnabled && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">爬取频率（Cron 表达式）</label>
                      <Input value={schedCron} onChange={e => setSchedCron(e.target.value)}
                        className="font-mono text-xs" placeholder="0 6 * * *" />
                      <div className="flex flex-wrap gap-1.5">
                        {CRON_PRESETS.map(p => (
                          <button key={p.value}
                            onClick={() => setSchedCron(p.value)}
                            className={`text-[10px] px-2 py-1 rounded-md border transition-all ${schedCron === p.value ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">搜索关键词</label>
                      <Input value={schedKeyword} onChange={e => setSchedKeyword(e.target.value)}
                        className="text-xs" placeholder="e.g. embroidery" />
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

                {status?.schedule?.enabled && status.schedule.next_run && (
                  <p className="text-[10px] text-center text-muted-foreground">
                    下次执行: {status.schedule.next_run.slice(0, 19)}
                  </p>
                )}
              </div>

            </CardContent>
          </Card>
        </div>
      )}

      {/* lightbox */}
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
