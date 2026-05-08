"use client"
import Link from "next/link"
import { Header } from "@/components/layout/header"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, ArrowRight, SearchCheck, Wand2 } from "lucide-react"

const features = [
  { href: "/seo/shopify-ai", icon: Wand2, name: "商品标题及详情优化", desc: "商品缓存、标题优化、详情描述、图片标签、视频素材", badge: "NEW" },
  { href: "/seo/shopify-ai", icon: SearchCheck, name: "标题与详情健康度", desc: "先进入商品标题及详情优化，后续再独立成关键词库和健康度看板" },
]

export default function SeoSystemPage() {
  return (
    <div className="flex flex-col min-h-full">
      <Header title="商品标题及详情优化" />
      <div className="flex-1 p-6 space-y-6 max-w-6xl w-full mx-auto">
        <Link href="/control-center" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          返回中控台
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-foreground">商品标题及详情优化总览</h2>
          <p className="text-sm text-muted-foreground mt-2">围绕 Shopify 商品标题、详情内容、图片标签和素材优化独立运转。</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature) => (
            <Link key={feature.name} href={feature.href}>
              <Card className="h-full hover:bg-accent/20 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                      <feature.icon className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{feature.name}</p>
                        {feature.badge && <Badge className="text-[10px] px-1.5 py-0">{feature.badge}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{feature.desc}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
