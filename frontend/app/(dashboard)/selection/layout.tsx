import { SystemNav } from "@/components/layout/system-nav"

const items = [
  { href: "/selection", label: "选品总览" },
  { href: "/products", label: "选品大厅" },
  { href: "/library", label: "我的选品库" },
  { href: "/xiaohongshu", label: "小红书 / Instagram" },
  { href: "/facebook", label: "FB 广告库" },
  { href: "/suppliers", label: "供应商" },
]

export default function SelectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SystemNav items={items} />
      {children}
    </>
  )
}
