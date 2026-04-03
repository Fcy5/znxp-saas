"use client"
import { createContext, useContext, useEffect, useState } from "react"

export type ThemeId = "blue" | "violet" | "emerald" | "slate" | "rose"

type ThemeVars = {
  background: string; foreground: string; card: string; border: string
  input: string; ring: string; primary: string; primaryFg: string
  secondary: string; muted: string; mutedFg: string; accent: string
  sidebar: string; sidebarBorder: string; sidebarAccent: string
}

const THEME_VARS: Record<ThemeId, ThemeVars> = {
  blue: {
    background: "222 47% 6%", foreground: "210 40% 98%",
    card: "222 47% 9%", border: "217 33% 14%", input: "217 33% 14%",
    ring: "221 83% 53%", primary: "221 83% 53%", primaryFg: "210 40% 98%",
    secondary: "217 33% 14%", muted: "217 33% 14%", mutedFg: "215 20% 55%",
    accent: "217 33% 17%",
    sidebar: "222 47% 7%", sidebarBorder: "217 33% 12%", sidebarAccent: "217 33% 14%",
  },
  violet: {
    background: "250 30% 5%", foreground: "260 30% 98%",
    card: "250 30% 8%", border: "255 25% 15%", input: "255 25% 15%",
    ring: "262 80% 60%", primary: "262 80% 60%", primaryFg: "0 0% 100%",
    secondary: "255 25% 14%", muted: "255 25% 14%", mutedFg: "255 15% 55%",
    accent: "255 25% 18%",
    sidebar: "250 30% 6%", sidebarBorder: "255 25% 12%", sidebarAccent: "255 25% 14%",
  },
  emerald: {
    background: "160 30% 5%", foreground: "160 20% 98%",
    card: "160 30% 8%", border: "160 25% 13%", input: "160 25% 13%",
    ring: "160 70% 42%", primary: "160 70% 42%", primaryFg: "0 0% 100%",
    secondary: "160 25% 13%", muted: "160 25% 13%", mutedFg: "160 15% 52%",
    accent: "160 25% 16%",
    sidebar: "160 30% 6%", sidebarBorder: "160 25% 10%", sidebarAccent: "160 25% 13%",
  },
  slate: {
    background: "220 15% 5%", foreground: "220 10% 96%",
    card: "220 15% 8%", border: "220 12% 14%", input: "220 12% 14%",
    ring: "220 10% 65%", primary: "220 10% 70%", primaryFg: "220 15% 5%",
    secondary: "220 12% 13%", muted: "220 12% 13%", mutedFg: "220 8% 50%",
    accent: "220 12% 16%",
    sidebar: "220 15% 6%", sidebarBorder: "220 12% 11%", sidebarAccent: "220 12% 13%",
  },
  rose: {
    background: "345 30% 5%", foreground: "345 20% 98%",
    card: "345 30% 8%", border: "345 25% 14%", input: "345 25% 14%",
    ring: "345 75% 55%", primary: "345 75% 55%", primaryFg: "0 0% 100%",
    secondary: "345 25% 13%", muted: "345 25% 13%", mutedFg: "345 15% 52%",
    accent: "345 25% 17%",
    sidebar: "345 30% 6%", sidebarBorder: "345 25% 11%", sidebarAccent: "345 25% 13%",
  },
}

export const THEMES: { id: ThemeId; label: string; color: string }[] = [
  { id: "blue",    label: "深海蓝",   color: "#3b82f6" },
  { id: "violet",  label: "紫罗兰",   color: "#a855f7" },
  { id: "emerald", label: "翡翠绿",   color: "#10b981" },
  { id: "slate",   label: "深灰石板", color: "#94a3b8" },
  { id: "rose",    label: "玫瑰红",   color: "#f43f5e" },
]

function applyTheme(t: ThemeId) {
  const v = THEME_VARS[t]
  const r = document.documentElement
  const set = (name: string, val: string) =>
    r.style.setProperty(name, `hsl(${val})`)

  set("--color-background", v.background)
  set("--color-foreground", v.foreground)
  set("--color-card", v.card)
  set("--color-card-foreground", v.foreground)
  set("--color-border", v.border)
  set("--color-input", v.input)
  set("--color-ring", v.ring)
  set("--color-primary", v.primary)
  set("--color-primary-foreground", v.primaryFg)
  set("--color-secondary", v.secondary)
  set("--color-secondary-foreground", v.foreground)
  set("--color-muted", v.muted)
  set("--color-muted-foreground", v.mutedFg)
  set("--color-accent", v.accent)
  set("--color-accent-foreground", v.foreground)
  set("--color-sidebar", v.sidebar)
  set("--color-sidebar-foreground", v.foreground)
  set("--color-sidebar-border", v.sidebarBorder)
  set("--color-sidebar-accent", v.sidebarAccent)
}

const ThemeContext = createContext<{
  theme: ThemeId
  setTheme: (t: ThemeId) => void
}>({ theme: "blue", setTheme: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>("blue")

  useEffect(() => {
    const saved = (localStorage.getItem("znxp-theme") as ThemeId) || "blue"
    applyTheme(saved)
    setThemeState(saved)
  }, [])

  const setTheme = (t: ThemeId) => {
    localStorage.setItem("znxp-theme", t)
    applyTheme(t)
    setThemeState(t)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
