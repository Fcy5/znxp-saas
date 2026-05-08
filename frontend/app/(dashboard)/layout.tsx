"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    if (!localStorage.getItem("access_token")) {
      router.replace("/login")
    }
  }, [router])

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 ambient-grid opacity-[0.08]" />
        <div className="absolute -left-28 top-0 h-96 w-96 rounded-full bg-cyan-500/8 blur-3xl" />
        <div className="absolute right-0 top-16 h-[28rem] w-[28rem] rounded-full bg-blue-500/8 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-amber-400/6 blur-3xl" />
      </div>
      <Sidebar />
      <main className="relative flex-1 h-full overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
