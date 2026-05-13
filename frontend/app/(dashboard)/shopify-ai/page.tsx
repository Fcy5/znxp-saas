import { redirect } from "next/navigation"

export default async function ShopifyAiRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => qs.append(key, item))
    else if (value) qs.set(key, value)
  })
  redirect(`/seo/shopify-ai${qs.size ? `?${qs.toString()}` : ""}`)
}
