import { SystemNav } from "@/components/layout/system-nav"

const items = [
  { href: "/operations", label: "运营总览" },
  { href: "/operations/agent", label: "AI 运营工作台" },
  { href: "/shops", label: "我的店铺" },
  { href: "/published", label: "上架历史" },
]

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SystemNav items={items} />
      {children}
    </>
  )
}
