"use client"
import { useEffect, useState, useCallback } from "react"
import { publishApi, shopApi, type PublishedProduct, type Shop, type PageInfo } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Rocket, Loader2, PackageOpen, ExternalLink, CheckCircle2,
  XCircle, Clock, Store, DollarSign, Trash2, RotateCcw,
} from "lucide-react"

const statusMeta: Record<string, { label: string; icon: React.ReactNode }> = {
  published: { label: "已上架", icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> },
  failed:    { label: "失败",   icon: <XCircle className="w-3.5 h-3.5 text-destructive" /> },
  pending:   { label: "处理中", icon: <Clock className="w-3.5 h-3.5 text-amber-400" /> },
  archived:  { label: "已下架", icon: <XCircle className="w-3.5 h-3.5 text-muted-foreground" /> },
}

function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta[status] ?? statusMeta.pending
  return (
    <span className="flex items-center gap-1 text-xs">
      {meta.icon}
      <span className={
        status === "published" ? "text-emerald-400" :
        status === "failed" ? "text-destructive" :
        status === "archived" ? "text-muted-foreground" :
        "text-amber-400"
      }>{meta.label}</span>
    </span>
  )
}

// 改价弹窗
function PriceDialog({
  record, onClose, onSaved,
}: { record: PublishedProduct; onClose: () => void; onSaved: (r: PublishedProduct) => void }) {
  const [price, setPrice] = useState(String(record.published_price ?? ""))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")

  const handleSave = async () => {
    const p = parseFloat(price)
    if (!p || p <= 0) { setErr("请输入有效价格"); return }
    setSaving(true); setErr("")
    try {
      const res = await publishApi.updatePrice(record.id, p)
      onSaved(res.data!)
      onClose()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "改价失败") }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <Card className="w-80" onClick={e => e.stopPropagation()}>
        <CardContent className="p-5 space-y-4">
          <p className="text-sm font-medium text-foreground">修改售价</p>
          <p className="text-xs text-muted-foreground line-clamp-1">{record.published_title}</p>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">新价格（USD）</label>
            <Input
              type="number" step="0.01" min="0.01"
              value={price}
              onChange={e => setPrice(e.target.value)}
              autoFocus
            />
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "确认改价"}
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={onClose}>取消</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function PublishedPage() {
  const [records, setRecords] = useState<PublishedProduct[]>([])
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [shops, setShops] = useState<Record<number, Shop>>({})
  const [selectedShop, setSelectedShop] = useState<number | undefined>()
  const [shopList, setShopList] = useState<Shop[]>([])

  // per-row action state
  const [priceDialog, setPriceDialog] = useState<PublishedProduct | null>(null)
  const [unpublishing, setUnpublishing] = useState<number | null>(null)
  const [republishing, setRepublishing] = useState<number | null>(null)
  const [actionMsg, setActionMsg] = useState<{ id: number; text: string; ok: boolean } | null>(null)

  useEffect(() => {
    shopApi.list().then(r => {
      const list = r.data || []
      setShopList(list)
      const map: Record<number, Shop> = {}
      list.forEach(s => { map[s.id] = s })
      setShops(map)
    }).catch(() => {})
  }, [])

  const load = useCallback(async (p: number, shopId?: number) => {
    setLoading(true)
    try {
      const res = await publishApi.list(shopId, p, 20)
      setRecords(res.data || [])
      setPageInfo(res.page_info || null)
    } catch { setRecords([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(page, selectedShop) }, [page, selectedShop, load])

  const flash = (id: number, text: string, ok: boolean) => {
    setActionMsg({ id, text, ok })
    setTimeout(() => setActionMsg(null), 3000)
  }

  const handleUnpublish = async (r: PublishedProduct) => {
    if (!confirm(`确认下架「${r.published_title}」？此操作将同步到 Shopify`)) return
    setUnpublishing(r.id)
    try {
      await publishApi.unpublish(r.id)
      setRecords(prev => prev.filter(x => x.id !== r.id))
      flash(r.id, "已下架", true)
    } catch (e: unknown) {
      flash(r.id, e instanceof Error ? e.message : "下架失败", false)
    } finally { setUnpublishing(null) }
  }

  const handleRepublish = async (r: PublishedProduct) => {
    setRepublishing(r.id)
    try {
      await publishApi.publish({
        product_id: r.product_id,
        shop_id: r.shop_id,
        title: r.published_title,
        price: r.published_price,
      })
      flash(r.id, "重新上架成功", true)
      load(page, selectedShop)
    } catch (e: unknown) {
      flash(r.id, e instanceof Error ? e.message : "上架失败", false)
    } finally { setRepublishing(null) }
  }

  const handlePriceSaved = (updated: PublishedProduct) => {
    setRecords(prev => prev.map(r => r.id === updated.id ? updated : r))
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Rocket className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">上架历史</h1>
            <p className="text-xs text-muted-foreground">
              {pageInfo ? `共 ${pageInfo.total} 条上架记录` : "已发布到 Shopify 的商品"}
            </p>
          </div>
        </div>
      </div>

      {/* Shop filter */}
      {shopList.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setSelectedShop(undefined); setPage(1) }}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!selectedShop ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            全部店铺
          </button>
          {shopList.map(s => (
            <button key={s.id}
              onClick={() => { setSelectedShop(s.id); setPage(1) }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 ${selectedShop === s.id ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              <Store className="w-3 h-3" /> {s.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <PackageOpen className="w-12 h-12 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium text-foreground">暂无上架记录</p>
            <p className="text-xs text-muted-foreground mt-1">在选品大厅找到心仪商品，点击改款上架推送到 Shopify</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.location.href = '/products'}>
            前往选品大厅
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {records.map(r => (
              <Card key={r.id} className="hover:bg-accent/10 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 pt-0.5">
                      <StatusBadge status={r.status} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground line-clamp-1">
                        {r.published_title || "—"}
                      </p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {shops[r.shop_id] && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Store className="w-3 h-3" /> {shops[r.shop_id].name}
                          </span>
                        )}
                        {r.published_price && (
                          <span className="text-xs font-medium text-foreground">${r.published_price.toFixed(2)}</span>
                        )}
                        {r.published_at && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(r.published_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {r.error_message && (
                          <span className="text-xs text-destructive truncate max-w-xs" title={r.error_message}>
                            {r.error_message}
                          </span>
                        )}
                      </div>
                      {/* Action flash message */}
                      {actionMsg?.id === r.id && (
                        <p className={`text-xs mt-1 ${actionMsg.ok ? "text-emerald-400" : "text-destructive"}`}>
                          {actionMsg.text}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      {r.shopify_product_url && (
                        <a href={r.shopify_product_url} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline px-2 py-1">
                          <ExternalLink className="w-3.5 h-3.5" /> Shopify
                        </a>
                      )}
                      {r.status === "published" && (
                        <>
                          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 px-2"
                            onClick={() => setPriceDialog(r)}>
                            <DollarSign className="w-3 h-3" /> 改价
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs h-7 gap-1 px-2"
                            onClick={() => handleUnpublish(r)}
                            disabled={unpublishing === r.id}>
                            {unpublishing === r.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Trash2 className="w-3 h-3" />
                            } 下架
                          </Button>
                        </>
                      )}
                      {(r.status === "failed" || r.status === "archived") && (
                        <Button size="sm" variant="outline" className="text-xs h-7 gap-1 px-2"
                          onClick={() => handleRepublish(r)}
                          disabled={republishing === r.id}>
                          {republishing === r.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <RotateCcw className="w-3 h-3" />
                          } 重新上架
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {pageInfo && pageInfo.total_pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
              <span className="text-xs text-muted-foreground px-3">{page} / {pageInfo.total_pages}</span>
              <Button variant="outline" size="sm" disabled={page >= pageInfo.total_pages} onClick={() => setPage(p => p + 1)}>下一页</Button>
            </div>
          )}
        </>
      )}

      {priceDialog && (
        <PriceDialog
          record={priceDialog}
          onClose={() => setPriceDialog(null)}
          onSaved={handlePriceSaved}
        />
      )}
    </div>
  )
}
