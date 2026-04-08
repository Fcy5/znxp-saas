"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Sparkles, TrendingUp, Zap, Globe, ShieldCheck, BarChart3,
  ArrowRight, Star, CheckCircle2, Play, ChevronRight,
  Brain, Search, Upload, DollarSign, LayoutDashboard
} from "lucide-react"
import { Button } from "@/components/ui/button"

const features = [
  {
    icon: Brain,
    title: "AI 智能评分",
    desc: "六维评分算法综合分析 TikTok 热度、利润率、市场竞争度、用户评价，自动将最优爆品置顶，省去人工筛选时间。",
    tag: "核心功能",
  },
  {
    icon: TrendingUp,
    title: "趋势提前预判",
    desc: "实时同步 TikTok、Facebook 广告投放数据，结合历史销量曲线，比竞争对手提前 2-4 周发现品类热点。",
    tag: "数据驱动",
  },
  {
    icon: Globe,
    title: "多平台数据聚合",
    desc: "整合 Amazon、Etsy、Shopify、Google Shopping、TikTok Shop 五大平台数据，一个界面看遍全网爆品。",
    tag: "全网覆盖",
  },
  {
    icon: Zap,
    title: "一键改款上架",
    desc: "选品完成后，AI 自动生成产品标题、描述文案，支持图片调整，直接推送到你的 Shopify 店铺，全程不离开平台。",
    tag: "效率革命",
  },
  {
    icon: BarChart3,
    title: "店铺诊脉分析",
    desc: "绑定 Shopify 店铺，AI 深度扫描商品结构、定价策略、品类分布，输出可执行的优化建议报告。",
    tag: "AI 诊断",
  },
  {
    icon: ShieldCheck,
    title: "刺绣 POD 垂直深耕",
    desc: "专为跨境刺绣 POD 卖家设计，内置品类标签体系、供应商管理、工艺参数参考，不做泛用工具。",
    tag: "垂直专注",
  },
]

const workflow = [
  { icon: Search, step: "01", title: "发现爆品", desc: "AI 从全网数据中筛选出高潜力刺绣产品" },
  { icon: Brain, step: "02", title: "AI 分析", desc: "六维评分 + 趋势预判，了解每款产品的爆款潜力" },
  { icon: Zap, step: "03", title: "改款设计", desc: "AI 生成文案，调整图片，快速完成产品差异化" },
  { icon: Upload, step: "04", title: "一键上架", desc: "直接推送 Shopify，从选品到上架最快 10 分钟" },
]

const testimonials = [
  {
    name: "Emily T.",
    role: "Etsy 刺绣卖家 · 美国",
    text: "以前每周花 20 小时手动找选品，现在 AI 直接给我列好清单，我只需要确认上架就行。",
    stars: 5,
  },
  {
    name: "Marcus W.",
    role: "Shopify 店主 · 英国",
    text: "趋势预判功能真的很准，提前一个月发现了情侣刺绣品类的热度，那个月 GMV 翻了 3 倍。",
    stars: 5,
  },
  {
    name: "Sophie L.",
    role: "POD 运营 · 加拿大",
    text: "店铺诊脉报告给出的建议非常具体，不是那种废话 AI，直接告诉我哪些 SKU 该下架。",
    stars: 5,
  },
]

const checks = [
  "全网五大平台数据实时同步",
  "AI 六维爆品评分算法",
  "Shopify 一键上架集成",
  "FB 广告素材资料库",
  "供应商资源管理",
  "多店铺统一管理",
]

export default function HomePage() {
  const router = useRouter()
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem("access_token")
    const name = localStorage.getItem("username")
    if (token) setUsername(name)
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 h-16 flex items-center justify-between px-6 md:px-16 border-b border-border/40"
        style={{ background: "hsl(222 47% 9% / 0.9)", backdropFilter: "blur(16px)" }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm tracking-tight">ZNXP SaaS</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">功能</a>
          <a href="#workflow" className="hover:text-foreground transition-colors">工作流</a>
          <a href="#testimonials" className="hover:text-foreground transition-colors">用户评价</a>
        </div>
        <div className="flex items-center gap-2">
          {username ? (
            <>
              <span className="text-sm text-muted-foreground hidden md:block">{username}</span>
              <Link href="/dashboard">
                <Button size="sm" className="gap-1.5">
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  进入后台
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">登录</Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="gap-1.5">
                  免费开始
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-40 pb-32 px-6 text-center overflow-hidden">
        {/* bg glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(ellipse, hsl(var(--primary)) 0%, transparent 70%)" }} />

        <div className="relative">
          <div className="inline-flex items-center gap-2 text-xs text-primary border border-primary/30 bg-primary/10 rounded-full px-4 py-2 mb-8">
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
            跨境 POD 刺绣选品自动化平台
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 max-w-4xl mx-auto leading-[1.1]">
            比竞争对手早一步
            <br />
            <span className="text-primary">发现下一个爆款</span>
          </h1>
          <p className="text-muted-foreground text-xl max-w-2xl mx-auto mb-12 leading-relaxed">
            AI 驱动的全网选品数据平台，专为跨境刺绣 POD 卖家打造。
            从发现趋势到 Shopify 上架，一个工具全搞定。
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/register">
              <Button size="lg" className="gap-2 px-10 h-12 text-base">
                免费开始使用
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="gap-2 h-12 text-base px-8">
                <Play className="w-4 h-4" />
                登录账号
              </Button>
            </Link>
          </div>

          {/* checklist */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-10">
            {checks.map(c => (
              <span key={c} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="py-24 px-6 border-t border-border/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs text-primary uppercase tracking-widest mb-3">工作流程</p>
            <h2 className="text-3xl md:text-4xl font-bold">从零到上架，最快 10 分钟</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {workflow.map((w, i) => (
              <div key={w.step} className="relative">
                <div className="rounded-2xl border border-border p-6 h-full"
                  style={{ background: "hsl(222 47% 11%)" }}>
                  <div className="text-4xl font-black text-border mb-4">{w.step}</div>
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <w.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">{w.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{w.desc}</p>
                </div>
                {i < workflow.length - 1 && (
                  <div className="hidden md:flex absolute top-1/2 -right-3 z-10 items-center justify-center">
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs text-primary uppercase tracking-widest mb-3">平台功能</p>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">一个平台，全部搞定</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              不是堆功能，而是围绕刺绣 POD 卖家的真实工作流，把每个环节都做到位
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(f => (
              <div key={f.title}
                className="group rounded-2xl border border-border p-6 hover:border-primary/40 transition-all duration-300"
                style={{ background: "hsl(222 47% 11%)" }}>
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <f.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5">{f.tag}</span>
                </div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 px-6 border-t border-border/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs text-primary uppercase tracking-widest mb-3">用户评价</p>
            <h2 className="text-3xl md:text-4xl font-bold">卖家都在说什么</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map(t => (
              <div key={t.name}
                className="rounded-2xl border border-border p-6"
                style={{ background: "hsl(222 47% 11%)" }}>
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-5">"{t.text}"</p>
                <div>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center rounded-3xl border border-primary/20 p-16 relative overflow-hidden"
          style={{ background: "hsl(222 47% 11%)" }}>
          <div className="absolute inset-0 opacity-10 pointer-events-none"
            style={{ background: "radial-gradient(ellipse at 50% 0%, hsl(var(--primary)) 0%, transparent 70%)" }} />
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-6">
              <DollarSign className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              现在开始，抢占先机
            </h2>
            <p className="text-muted-foreground mb-10 max-w-lg mx-auto">
              刺绣 POD 市场正在快速增长，工具效率决定你是领跑者还是追随者。
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href="/register">
                <Button size="lg" className="gap-2 px-10 h-12">
                  免费注册
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="h-12 px-8">已有账号，直接登录</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold">ZNXP SaaS</span>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 ZNXP SaaS · 跨境 POD 刺绣选品自动化平台</p>
          <div className="flex items-center gap-5 text-xs text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">登录</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">注册</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
