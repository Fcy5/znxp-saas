"use client"
import Link from "next/link"
import { Header } from "@/components/layout/header"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowLeft, ArrowRight, FileText, HeartPulse, Rocket, Store, Video } from "lucide-react"

const features = [
  { href: "/operations/agent", icon: HeartPulse, name: "店铺智能诊脉", desc: "AI 分析店铺定位、受众、转化问题和改版建议" },
  { href: "/operations/agent", icon: FileText, name: "社媒文案生成", desc: "批量生成商品标题及详情内容，以及 TikTok、Facebook、Instagram 文案" },
  { href: "/operations/agent", icon: Video, name: "社媒视频生成", desc: "基于商品主图生成短视频素材，适合社媒投放和运营发布" },
  { href: "/shops", icon: Store, name: "我的店铺", desc: "Shopify 店铺绑定、验证和店铺商品查看" },
  { href: "/published", icon: Rocket, name: "上架历史", desc: "已发布商品记录、状态和 Shopify 链接" },
]

export default function OperationsSystemPage() {
  return (
    <div className="flex flex-col min-h-full">
      <Header title="运营系统" />
      <div className="flex-1 p-6 space-y-6 max-w-6xl w-full mx-auto">
        <Link href="/control-center" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
          返回中控台
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-foreground">运营系统总览</h2>
          <p className="text-sm text-muted-foreground mt-2">围绕店铺诊脉、社媒内容生成、上架历史和批量运营独立管理。</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {features.map((feature) => (
            <Link key={feature.name} href={feature.href}>
              <Card className="h-full hover:bg-accent/20 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                      <feature.icon className="w-5 h-5 text-violet-400" />
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
