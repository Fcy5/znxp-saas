"use client"
import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, ShoppingBag, Bot, Store, Settings,
  Zap, ChevronRight, LogOut, Truck, MonitorPlay, Bookmark, Rocket, Flower2, Wand2, ShoppingCart,
  Layers,
} from "lucide-react"

const systemNavItems = [
  {
    label: "总览",
    items: [
      { href: "/control-center", icon: LayoutDashboard, label: "系统总览" },
      { href: "/operations/agent", icon: Bot, label: "任务中心" },
    ],
  },
  {
    label: "选品",
    items: [
      { href: "/products", icon: ShoppingBag, label: "选品大厅" },
      { href: "/library", icon: Bookmark, label: "我的选品库" },
      { href: "/xiaohongshu", icon: Flower2, label: "小红书 / Instagram" },
      { href: "/facebook", icon: MonitorPlay, label: "FB 广告库" },
      { href: "/suppliers", icon: Truck, label: "供应商" },
    ],
  },
  {
    label: "内容与上架",
    items: [
      { href: "/seo/shopify-ai", icon: Wand2, label: "商品标题及详情优化" },
      { href: "/shops", icon: Store, label: "我的店铺" },
      { href: "/published", icon: Rocket, label: "上架记录" },
    ],
  },
  {
    label: "投放",
    items: [
      { href: "/gmc", icon: ShoppingCart, label: "Google 购物广告" },
    ],
  },
  {
    label: "系统",
    items: [
      { href: "/settings", icon: Settings, label: "设置" },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [username] = useState(() => (typeof window === "undefined" ? "User" : localStorage.getItem("username") || "User"))

  const handleLogout = () => {
    localStorage.removeItem("access_token")
    localStorage.removeItem("user_id")
    localStorage.removeItem("username")
    router.push("/login")
  }

  return (
    <aside
      className="w-64 h-screen flex flex-col shrink-0 border-r"
      style={{
        background: "linear-gradient(180deg, hsl(222 47% 8%), hsl(224 44% 7%))",
        borderColor: "var(--color-sidebar-border)",
      }}
    >
      {/* Logo */}
      <div
        className="h-[76px] flex items-center gap-3 px-5 border-b"
        style={{ borderColor: "var(--color-sidebar-border)" }}
      >
        <div className="w-10 h-10 rounded-2xl bg-[linear-gradient(135deg,#38bdf8_0%,#2563eb_48%,#9333ea_100%)] flex items-center justify-center shadow-[0_18px_40px_rgba(37,99,235,0.35)]">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white">ZNXP</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Cross-border product operations</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="flex items-center gap-2 px-3 mb-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          <Layers className="w-3 h-3" />
          <span>系统导航</span>
        </div>
        {systemNavItems.map((group) => (
          <div key={group.label} className="mb-3 rounded-2xl border border-white/6 bg-white/[0.02] p-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 px-2 mb-2">{group.label}</p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = item.href === "/control-center"
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 group",
                      active
                        ? "bg-[linear-gradient(135deg,rgba(56,189,248,0.16),rgba(37,99,235,0.18))] text-blue-100 shadow-[0_14px_30px_rgba(37,99,235,0.16)]"
                        : "text-slate-400 hover:text-white hover:bg-[var(--color-sidebar-accent)]"
                    )}
                  >
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl shrink-0", active ? "bg-white/10" : "bg-white/[0.03] group-hover:bg-white/[0.06]")}>
                      <item.icon className={cn("w-4 h-4", active ? "text-cyan-200" : "text-slate-500")} />
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {active && <ChevronRight className="w-3 h-3 text-blue-400 opacity-60" />}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="p-3 border-t" style={{ borderColor: "var(--color-sidebar-border)" }}>
        <div className="flex items-center gap-3 px-3 py-3 rounded-2xl border border-white/6 bg-white/[0.03]">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-[0_12px_28px_rgba(59,130,246,0.28)]">
            {username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{username}</p>
            <p className="text-xs text-slate-400">账号中心</p>
          </div>
          <button onClick={handleLogout} title="退出登录" className="rounded-xl border border-white/8 bg-white/[0.03] p-2">
            <LogOut className="w-4 h-4 text-slate-500 hover:text-white transition-colors" />
          </button>
        </div>
      </div>
    </aside>
  )
}
