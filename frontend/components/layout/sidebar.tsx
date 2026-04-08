"use client"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, ShoppingBag, Bot, Store, Settings,
  Zap, ChevronRight, LogOut, Truck, MonitorPlay, Bookmark, Rocket,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/products", icon: ShoppingBag, label: "选品大厅", badge: "HOT" },
  { href: "/library", icon: Bookmark, label: "我的选品库" },
  { href: "/published", icon: Rocket, label: "上架历史" },
  { href: "/agent", icon: Bot, label: "AI Agent", badge: "2" },
  { href: "/facebook", icon: MonitorPlay, label: "FB 广告库" },
  { href: "/suppliers", icon: Truck, label: "供应商" },
  { href: "/shops", icon: Store, label: "我的店铺" },
  { href: "/settings", icon: Settings, label: "设置" },
]

const dataSources = [
  { label: "Amazon BSR", color: "bg-amber-400", live: true },
  { label: "Etsy Trends", color: "bg-pink-400", live: true },
  { label: "TikTok 热榜", color: "bg-red-400", live: false },
  { label: "Facebook Ads", color: "bg-blue-400", live: false },
  { label: "Google Merchant", color: "bg-emerald-400", live: false },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const username = typeof window !== "undefined" ? localStorage.getItem("username") || "User" : "User"

  const handleLogout = () => {
    localStorage.removeItem("access_token")
    localStorage.removeItem("user_id")
    localStorage.removeItem("username")
    router.push("/login")
  }

  return (
    <aside
      className="w-60 h-screen flex flex-col shrink-0 border-r"
      style={{
        background: "var(--color-sidebar)",
        borderColor: "var(--color-sidebar-border)",
      }}
    >
      {/* Logo */}
      <div
        className="h-16 flex items-center gap-3 px-5 border-b"
        style={{ borderColor: "var(--color-sidebar-border)" }}
      >
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="text-base font-bold text-white">ZNXP</span>
          <span className="text-xs text-slate-400 ml-1.5">SaaS</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">主菜单</p>
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 group",
                active
                  ? "bg-blue-500/10 text-blue-400"
                  : "text-slate-400 hover:text-white hover:bg-[var(--color-sidebar-accent)]"
              )}
            >
              <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-blue-400" : "text-slate-500")} />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <Badge variant={item.badge === "HOT" ? "warning" : "default"} className="text-[10px] px-1.5 py-0">
                  {item.badge}
                </Badge>
              )}
              {active && <ChevronRight className="w-3 h-3 text-blue-400 opacity-60" />}
            </Link>
          )
        })}

        <div className="border-t my-3" style={{ borderColor: "var(--color-sidebar-border)" }} />
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">数据源</p>
        {dataSources.map((src) => (
          <div key={src.label} className="flex items-center gap-3 px-3 py-1.5 text-xs text-slate-500">
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", src.color, src.live && "animate-pulse")} />
            <span>{src.label}</span>
            {src.live && <span className="ml-auto text-[10px] text-emerald-400">LIVE</span>}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="p-3 border-t" style={{ borderColor: "var(--color-sidebar-border)" }}>
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{username}</p>
            <p className="text-xs text-slate-400">Pro Plan</p>
          </div>
          <button onClick={handleLogout} title="退出登录">
            <LogOut className="w-4 h-4 text-slate-500 hover:text-white transition-colors" />
          </button>
        </div>
      </div>
    </aside>
  )
}
