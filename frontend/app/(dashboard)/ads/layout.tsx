import { SystemNav } from "@/components/layout/system-nav"

const items = [
  { href: "/ads", label: "广告总览" },
  { href: "/gmc", label: "Google 购物广告" },
  { href: "/facebook", label: "FB 广告库" },
]

export default function AdsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SystemNav items={items} />
      {children}
    </>
  )
}
