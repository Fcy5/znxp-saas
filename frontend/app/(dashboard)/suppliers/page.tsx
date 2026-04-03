"use client"
import { useEffect, useState } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CardHeader, CardTitle } from "@/components/ui/card"
import { useRef } from "react"
import {
  Package, Store, ExternalLink, Trash2, Loader2,
  ChevronLeft, Search, ArrowUpDown, Image as ImageIcon, Plus, X, Upload, Film,
} from "lucide-react"
import { supplierApi, uploadApi, STATIC_BASE, type Supplier, type SupplierProduct } from "@/lib/api"

const staticUrl = (src?: string) => {
  if (!src) return undefined
  // 兼容旧数据：把 localhost:8000 替换为当前配置的 STATIC_BASE
  if (src.startsWith("http://localhost:8000")) return `${STATIC_BASE}${src.slice("http://localhost:8000".length)}`
  if (src.startsWith("http")) return src
  return `${STATIC_BASE}${src}`
}

const STATUS_MAP: Record<number, { label: string; variant: "success" | "warning" | "default" }> = {
  1: { label: "上架", variant: "success" },
  0: { label: "下架", variant: "default" },
  2: { label: "待审核", variant: "warning" },
}

export default function SuppliersPage() {
  const [view, setView] = useState<"suppliers" | "products">("suppliers")
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)

  // supplier list state
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [suppliersLoading, setSuppliersLoading] = useState(true)
  const [keyword, setKeyword] = useState("")

  // products state
  const [products, setProducts] = useState<SupplierProduct[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productTotal, setProductTotal] = useState(0)
  const [productPage, setProductPage] = useState(1)
  const [titleFilter, setTitleFilter] = useState("")
  const [shelfFilter, setShelfFilter] = useState<number | undefined>(undefined)
  const PAGE_SIZE = 12

  // add supplier modal
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [addingSupplier, setAddingSupplier] = useState(false)
  const [addSupplierError, setAddSupplierError] = useState("")
  const [supplierForm, setSupplierForm] = useState({
    supplier_name: "", supplier_url: "", supplier_phone: "", supplier_email: "", supplier_description: "",
  })

  const resetSupplierForm = () => {
    setSupplierForm({ supplier_name: "", supplier_url: "", supplier_phone: "", supplier_email: "", supplier_description: "" })
    setAddSupplierError("")
  }

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddSupplierError("")
    setAddingSupplier(true)
    try {
      const res = await supplierApi.create({
        supplier_name: supplierForm.supplier_name,
        supplier_url: supplierForm.supplier_url || undefined,
        supplier_phone: supplierForm.supplier_phone || undefined,
        supplier_email: supplierForm.supplier_email || undefined,
        supplier_description: supplierForm.supplier_description || undefined,
      })
      setSuppliers(prev => [res.data!, ...prev])
      setShowAddSupplier(false)
      resetSupplierForm()
    } catch (err: unknown) {
      setAddSupplierError(err instanceof Error ? err.message : "添加失败")
    } finally {
      setAddingSupplier(false)
    }
  }

  // add product modal
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")
  const [form, setForm] = useState({
    title: "", product_type: "", body_html: "", tags: "", price: "", product_url: "",
  })
  const [mediaFiles, setMediaFiles] = useState<{ file: File; preview: string; uploading: boolean; url?: string }[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetForm = () => {
    setForm({ title: "", product_type: "", body_html: "", tags: "", price: "", product_url: "" })
    setMediaFiles([])
    setAddError("")
  }

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime", "video/webm"]
    const newItems = Array.from(files)
      .filter(f => allowed.includes(f.type))
      .map(f => ({ file: f, preview: URL.createObjectURL(f), uploading: false }))
    setMediaFiles(prev => [...prev, ...newItems])
  }

  const removeFile = (idx: number) => {
    setMediaFiles(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const loadSuppliers = async () => {
    setSuppliersLoading(true)
    try {
      const res = await supplierApi.list(keyword || undefined)
      setSuppliers(res.data || [])
    } finally {
      setSuppliersLoading(false)
    }
  }

  const loadProducts = async (page = 1) => {
    if (!selectedSupplier) return
    setProductsLoading(true)
    try {
      const res = await supplierApi.products({
        supplierId: selectedSupplier.id,
        title: titleFilter || undefined,
        isPutawayis: shelfFilter,
        page,
        pageSize: PAGE_SIZE,
      })
      setProducts(res.data || [])
      setProductTotal(res.page_info?.total || 0)
      setProductPage(page)
    } finally {
      setProductsLoading(false)
    }
  }

  useEffect(() => { loadSuppliers() }, [])

  useEffect(() => {
    if (view === "products" && selectedSupplier) loadProducts(1)
  }, [view, selectedSupplier, shelfFilter])

  const openSupplier = (s: Supplier) => {
    setSelectedSupplier(s)
    setTitleFilter("")
    setShelfFilter(undefined)
    setView("products")
  }

  const handleDeleteSupplier = async (id: number) => {
    if (!confirm("确认删除该供应商？")) return
    await supplierApi.delete(id)
    setSuppliers(s => s.filter(x => x.id !== id))
  }

  const handleToggleShelf = async (p: SupplierProduct) => {
    const next = p.is_putawayis === 1 ? 0 : 1
    await supplierApi.toggleShelf(p.id, next as 0 | 1)
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, is_putawayis: next } : x))
  }

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSupplier) return
    setAddError("")
    setAdding(true)
    try {
      // upload all files first
      const uploaded: { src: string }[] = []
      for (let i = 0; i < mediaFiles.length; i++) {
        setMediaFiles(prev => prev.map((f, idx) => idx === i ? { ...f, uploading: true } : f))
        const url = await uploadApi.upload(mediaFiles[i].file)
        setMediaFiles(prev => prev.map((f, idx) => idx === i ? { ...f, uploading: false, url } : f))
        uploaded.push({ src: url })
      }

      const body: Parameters<typeof supplierApi.createProduct>[0] = {
        supplier_id: selectedSupplier.id,
        title: form.title,
        product_type: form.product_type || undefined,
        body_html: form.body_html || undefined,
        tags: form.tags || undefined,
        price: form.price ? parseFloat(form.price) : undefined,
        product_url: form.product_url || undefined,
        images: uploaded.length > 0 ? uploaded : undefined,
      }
      const res = await supplierApi.createProduct(body)
      setProducts(prev => [res.data!, ...prev])
      setProductTotal(t => t + 1)
      setShowAdd(false)
      resetForm()
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "添加失败")
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteProduct = async (id: number) => {
    if (!confirm("确认删除该产品？")) return
    await supplierApi.deleteProduct(id)
    setProducts(prev => prev.filter(x => x.id !== id))
    setProductTotal(t => t - 1)
  }

  const totalPages = Math.ceil(productTotal / PAGE_SIZE)

  // ── Supplier list view ──
  if (view === "suppliers") {
    return (
      <>
      <div className="flex flex-col min-h-full">
        <Header title="供应商管理" />
        <div className="flex-1 p-6 space-y-5">
          {/* search */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                className="pl-9 text-sm h-9"
                placeholder="搜索供应商名称..."
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && loadSuppliers()}
              />
            </div>
            <Button size="sm" onClick={loadSuppliers} disabled={suppliersLoading}>搜索</Button>
            <Button size="sm" className="gap-1.5 ml-auto" onClick={() => { resetSupplierForm(); setShowAddSupplier(true) }}>
              <Plus className="w-4 h-4" /> 新增供应商
            </Button>
          </div>

          {suppliersLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {suppliers.map(s => (
                <Card key={s.id} className="card-hover cursor-pointer" onClick={() => openSupplier(s)}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                        <Store className="w-5 h-5 text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{s.supplier_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{s.supplier_email}</p>
                      </div>
                    </div>

                    {s.supplier_description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{s.supplier_description}</p>
                    )}

                    <div className="flex items-center gap-2 mt-2">
                      {s.supplier_url && (
                        <Button
                          size="sm" variant="outline" className="text-xs gap-1 flex-1"
                          onClick={e => { e.stopPropagation(); window.open(s.supplier_url!, "_blank") }}
                        >
                          <ExternalLink className="w-3 h-3" /> 访问
                        </Button>
                      )}
                      <Button
                        size="sm" variant="outline" className="text-xs gap-1 flex-1"
                        onClick={e => { e.stopPropagation(); openSupplier(s) }}
                      >
                        <Package className="w-3 h-3" /> 查看产品
                      </Button>
                      <Button
                        size="sm" variant="ghost" className="text-xs text-destructive hover:text-destructive"
                        onClick={e => { e.stopPropagation(); handleDeleteSupplier(s.id) }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!suppliersLoading && suppliers.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-20">暂无供应商数据</div>
          )}
        </div>
      </div>

      {/* 新增供应商弹窗 */}
      {showAddSupplier && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAddSupplier(false)}>
          <Card className="w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Store className="w-4 h-4 text-primary" />
                新增供应商
              </CardTitle>
              <button onClick={() => setShowAddSupplier(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddSupplier} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">供应商名称 *</label>
                  <Input
                    placeholder="输入供应商名称"
                    value={supplierForm.supplier_name}
                    onChange={e => setSupplierForm(f => ({ ...f, supplier_name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">供应商网址</label>
                  <Input
                    placeholder="https://..."
                    value={supplierForm.supplier_url}
                    onChange={e => setSupplierForm(f => ({ ...f, supplier_url: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">联系电话</label>
                    <Input
                      placeholder="手机或座机"
                      value={supplierForm.supplier_phone}
                      onChange={e => setSupplierForm(f => ({ ...f, supplier_phone: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">邮箱</label>
                    <Input
                      placeholder="email@example.com"
                      value={supplierForm.supplier_email}
                      onChange={e => setSupplierForm(f => ({ ...f, supplier_email: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">供应商描述</label>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    rows={3}
                    placeholder="供应商简介、主营产品等..."
                    value={supplierForm.supplier_description}
                    onChange={e => setSupplierForm(f => ({ ...f, supplier_description: e.target.value }))}
                  />
                </div>
                {addSupplierError && <p className="text-xs text-destructive">{addSupplierError}</p>}
                <div className="flex gap-3 pt-1">
                  <Button type="submit" className="flex-1" disabled={addingSupplier}>
                    {addingSupplier ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "确认添加"}
                  </Button>
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAddSupplier(false)}>取消</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
      </>
    )
  }

  // ── Products view ──
  return (
    <div className="flex flex-col min-h-full">
      <Header title={`${selectedSupplier?.supplier_name} · 产品列表`} />
      <div className="flex-1 p-6 space-y-4">
        {/* back + filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => setView("suppliers")}>
            <ChevronLeft className="w-3.5 h-3.5" /> 返回供应商
          </Button>
          <div className="flex-1" />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-9 text-sm h-8 w-52"
              placeholder="搜索产品标题..."
              value={titleFilter}
              onChange={e => setTitleFilter(e.target.value)}
              onKeyDown={e => e.key === "Enter" && loadProducts(1)}
            />
          </div>
          <div className="flex items-center gap-1 text-xs">
            {[undefined, 1, 0, 2].map((v) => {
              const labels: Record<string, string> = { undefined: "全部", "1": "上架", "0": "下架", "2": "待审核" }
              const key = v === undefined ? "undefined" : String(v)
              return (
                <button
                  key={key}
                  onClick={() => setShelfFilter(v)}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    shelfFilter === v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {labels[key]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">共 {productTotal} 个产品</p>
          <Button size="sm" className="gap-1.5" onClick={() => { resetForm(); setShowAdd(true) }}>
            <Plus className="w-4 h-4" /> 添加产品
          </Button>
        </div>

        {productsLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> 加载中...
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {products.map(p => {
              const isImg = (src?: string) => src && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(src)
              const allSrcs = [p.image?.src, ...(p.images?.map(i => i.src) ?? [])].map(staticUrl)
              const imgSrc = allSrcs.find(isImg)
              const status = STATUS_MAP[p.is_putawayis] ?? STATUS_MAP[2]
              return (
                <Card key={p.id} className="overflow-hidden card-hover">
                  {/* image */}
                  <div className="aspect-square bg-secondary relative overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
                    </div>
                    {imgSrc && (
                      <img
                        src={imgSrc}
                        alt={p.title || ""}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    )}
                    <div className="absolute top-2 right-2">
                      <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                    </div>
                  </div>
                  <CardContent className="p-3 space-y-2">
                    <p className="text-xs font-medium line-clamp-2 leading-snug">{p.title}</p>
                    {p.product_type && (
                      <p className="text-[10px] text-muted-foreground">{p.product_type}</p>
                    )}
                    <div className="flex gap-1.5 pt-1">
                      <Button
                        size="sm"
                        variant={p.is_putawayis === 1 ? "outline" : "default"}
                        className="flex-1 text-[10px] h-7 gap-1"
                        onClick={() => handleToggleShelf(p)}
                      >
                        <ArrowUpDown className="w-3 h-3" />
                        {p.is_putawayis === 1 ? "下架" : "上架"}
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="text-[10px] h-7 text-destructive hover:text-destructive px-2"
                        onClick={() => handleDeleteProduct(p.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button size="sm" variant="outline" disabled={productPage <= 1} onClick={() => loadProducts(productPage - 1)}>
              上一页
            </Button>
            <span className="text-xs text-muted-foreground">{productPage} / {totalPages}</span>
            <Button size="sm" variant="outline" disabled={productPage >= totalPages} onClick={() => loadProducts(productPage + 1)}>
              下一页
            </Button>
          </div>
        )}
      </div>

      {/* 添加产品弹窗 */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <Card className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                添加产品 · {selectedSupplier?.supplier_name}
              </CardTitle>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddProduct} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">产品标题 *</label>
                  <Input
                    placeholder="输入产品标题"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">产品类型</label>
                    <Input
                      placeholder="如：刺绣定制"
                      value={form.product_type}
                      onChange={e => setForm(f => ({ ...f, product_type: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">价格</label>
                    <Input
                      type="number" step="0.01" placeholder="0.00"
                      value={form.price}
                      onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    />
                  </div>
                </div>
                {/* Media upload */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">图片 / 视频（支持多文件）</label>
                  <div
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                      dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
                  >
                    <Upload className="w-6 h-6 mx-auto mb-1.5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">点击或拖拽上传图片 / 视频</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">JPG · PNG · WebP · GIF · MP4 · MOV，单文件 ≤ 50MB</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/mp4,video/quicktime,video/webm"
                      multiple
                      className="hidden"
                      onChange={e => addFiles(e.target.files)}
                    />
                  </div>

                  {/* Preview grid */}
                  {mediaFiles.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {mediaFiles.map((m, i) => (
                        <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-secondary">
                          {m.file.type.startsWith("video/") ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                              <Film className="w-6 h-6 text-muted-foreground" />
                              <span className="text-[9px] text-muted-foreground truncate px-1 w-full text-center">{m.file.name}</span>
                            </div>
                          ) : (
                            <img src={m.preview} alt="" className="w-full h-full object-cover" />
                          )}
                          {m.uploading && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <Loader2 className="w-4 h-4 text-white animate-spin" />
                            </div>
                          )}
                          {!m.uploading && (
                            <button
                              type="button"
                              onClick={() => removeFile(i)}
                              className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80"
                            >
                              <X className="w-3 h-3 text-white" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">产品链接</label>
                  <Input
                    placeholder="https://..."
                    value={form.product_url}
                    onChange={e => setForm(f => ({ ...f, product_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">标签（逗号分隔）</label>
                  <Input
                    placeholder="刺绣, 定制, 宠物"
                    value={form.tags}
                    onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">产品描述</label>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    rows={3}
                    placeholder="产品详细描述..."
                    value={form.body_html}
                    onChange={e => setForm(f => ({ ...f, body_html: e.target.value }))}
                  />
                </div>
                {addError && (
                  <p className="text-xs text-destructive">{addError}</p>
                )}
                <div className="flex gap-3 pt-1">
                  <Button type="submit" className="flex-1" disabled={adding}>
                    {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "确认添加"}
                  </Button>
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAdd(false)}>取消</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
