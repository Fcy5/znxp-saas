"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Header } from "@/components/layout/header"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ArrowRight, Bookmark, Flower2, Loader2, MonitorPlay, ShoppingBag, Sparkles, Truck } from "lucide-react"
import { productApi, type ProductCard } from "@/lib/api"
import { ProductCard as ProductTile } from "@/components/product/product-card"

type ThemeConfig = {
  key: string
  title: string
  desc: string
  keyword: string
  category?: string | null
  badge?: string
  href: string
}

const features = [
  { href: "/selection/products", icon: ShoppingBag, name: "选品大厅", desc: "全平台商品池、筛选、AI 推荐", badge: "HOT" },
  { href: "/selection/library", icon: Bookmark, name: "我的选品库", desc: "候选、重点、主推商品", badge: "WORKBENCH" },
  { href: "/selection/xiaohongshu", icon: Flower2, name: "小红书 / Instagram", desc: "社媒素材库、热帖、跨境内容参考", badge: "NEW" },
  { href: "/selection/facebook", icon: MonitorPlay, name: "FB 广告库", desc: "广告素材、投放参考、媒体同步" },
  { href: "/selection/suppliers", icon: Truck, name: "供应商", desc: "供应商管理、供应商商品库" },
]

const themes: ThemeConfig[] = [
  { key: "fathers", title: "Father's Day", desc: "父亲、爷爷、家庭纪念礼物方向", keyword: "father", category: "Apparel", badge: "NOW", href: "/selection/products?q=father&cat=Apparel" },
  { key: "mothers", title: "Mother's Day", desc: "妈妈主题、家庭纪念、名字和手写体方向", keyword: "mom", category: "Apparel", href: "/selection/products?q=mom&cat=Apparel" },
  { key: "graduation", title: "Graduation", desc: "毕业纪念、名字和仪式感礼物方向", keyword: "graduation", category: "Apparel", badge: "SEASON", href: "/selection/products?q=graduation&cat=Apparel" },
  { key: "summer", title: "Summer", desc: "夏季出游、露营、轻礼物方向", keyword: "summer", category: null, href: "/selection/products?q=summer" },
  { key: "evergreen", title: "Evergreen Gifts", desc: "可长期运营的个性化常青礼物方向", keyword: "personalized", category: "Gifts", href: "/selection/products?q=personalized&cat=Gifts" },
  { key: "pet", title: "Pet Keepsake", desc: "宠物纪念、宠物家长礼物方向", keyword: "pet", category: null, badge: "NICHE", href: "/selection/products?q=pet" },
]

function ThemeSection({
  theme,
  products,
  loading,
  onImport,
  importing,
  importedCount,
}: {
  theme: ThemeConfig
  products: ProductCard[]
  loading: boolean
  onImport: () => void
  importing: boolean
  importedCount?: number
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">{theme.title}</h3>
            {theme.badge && <Badge variant="warning" className="text-[10px] px-1.5 py-0">{theme.badge}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{theme.desc}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={theme.href}>
            <Button size="sm" variant="outline">
              查看更多
            </Button>
          </Link>
          <Button size="sm" onClick={onImport} disabled={loading || importing || products.length === 0} className="gap-2">
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bookmark className="w-3.5 h-3.5" />}
            一键入库
          </Button>
        </div>
      </div>

      {!!importedCount && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
          已将 {importedCount} 个候选商品加入选品库，下一步可进入“我的选品库”继续细筛。
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card animate-pulse">
              <div className="aspect-square bg-secondary rounded-t-xl" />
              <div className="p-3.5 space-y-2">
                <div className="h-3 bg-secondary rounded w-3/4" />
                <div className="h-3 bg-secondary rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">当前没有匹配商品</div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {products.map(product => (
            <ProductTile key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  )
}

export default function SelectionSystemPage() {
  const [themeProducts, setThemeProducts] = useState<Record<string, ProductCard[]>>({})
  const [themeLoading, setThemeLoading] = useState<Record<string, boolean>>({})
  const [importingKey, setImportingKey] = useState<string | null>(null)
  const [importedCounts, setImportedCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    let active = true
    themes.forEach(async theme => {
      setThemeLoading(prev => ({ ...prev, [theme.key]: true }))
      try {
        const res = await productApi.search({
          page: 1,
          page_size: 8,
          keyword: theme.keyword,
          category: theme.category ?? null,
          sort_by: "ai_score",
          sort_order: "desc",
        })
        if (!active) return
        setThemeProducts(prev => ({ ...prev, [theme.key]: res.data || [] }))
      } catch {
        if (!active) return
        setThemeProducts(prev => ({ ...prev, [theme.key]: [] }))
      } finally {
        if (active) setThemeLoading(prev => ({ ...prev, [theme.key]: false }))
      }
    })
    return () => { active = false }
  }, [])

  const handleImportTheme = async (key: string) => {
    const ids = (themeProducts[key] || []).map(item => item.id)
    if (ids.length === 0) return
    setImportingKey(key)
    try {
      await productApi.batchSave(ids)
      setImportedCounts(prev => ({ ...prev, [key]: ids.length }))
    } finally {
      setImportingKey(null)
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <Header title="选品系统" />
      <div className="flex-1 p-6 space-y-8 max-w-7xl w-full mx-auto">
        <Link href="/control-center" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          返回中控台
        </Link>

        <section className="space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold text-foreground">本周专题候选池</h2>
              <p className="text-sm text-muted-foreground mt-2">先从全量商品池按专题分类查看候选商品，再由用户一键入库进入选品库细筛。</p>
            </div>
            <Link href="/selection/products">
              <Button variant="outline" className="gap-2">
                <Sparkles className="w-4 h-4" />
                进入全量商品池
              </Button>
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {features.map((feature) => (
            <Link key={feature.href} href={feature.href}>
              <Card className="h-full hover:bg-accent/20 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <feature.icon className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{feature.name}</p>
                        {feature.badge && <Badge variant="warning" className="text-[10px] px-1.5 py-0">{feature.badge}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{feature.desc}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>

        <section className="space-y-8">
          {themes.map(theme => (
            <ThemeSection
              key={theme.key}
              theme={theme}
              products={themeProducts[theme.key] || []}
              loading={themeLoading[theme.key] ?? true}
              onImport={() => handleImportTheme(theme.key)}
              importing={importingKey === theme.key}
              importedCount={importedCounts[theme.key]}
            />
          ))}
        </section>
      </div>
    </div>
  )
}
