import { SystemNav } from "@/components/layout/system-nav"

const items = [
  { href: "/seo", label: "优化总览" },
  { href: "/seo/shopify-ai", label: "商品标题及详情优化" },
]

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SystemNav items={items} />
      {children}
    </>
  )
}
