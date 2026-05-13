"use client"
import Link from "next/link"
import { Header } from "@/components/layout/header"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowLeft, ArrowRight, Megaphone, ShoppingCart } from "lucide-react"

const features = [
  { href: "/gmc", icon: ShoppingCart, name: "Google Merchant Center", desc: "商品审核、GMC 修复、购物广告数据" },
  { href: "/facebook", icon: Megaphone, name: "FB 广告素材参考", desc: "当前复用选品系统广告库，后续独立成投放模块" },
]

export default function AdsSystemPage() {
  return (
    <div className="flex flex-col min-h-full">
      <Header title="广告系统" />
      <div className="flex-1 p-6 space-y-6 max-w-6xl w-full mx-auto">
        <Link href="/control-center" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          返回中控台
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-foreground">广告系统总览</h2>
          <p className="text-sm text-muted-foreground mt-2">围绕 GMC、购物广告和广告素材分析独立管理。</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature) => (
            <Link key={feature.name} href={feature.href}>
              <Card className="h-full hover:bg-accent/20 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <feature.icon className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">{feature.name}</p>
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
