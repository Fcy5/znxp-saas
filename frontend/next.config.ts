import type { NextConfig } from "next"

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN || "http://127.0.0.1:8001"

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  async headers() {
    return [
      {
        // 所有 HTML 页面不允许 CDN 缓存，防止 Cloudflare 缓存旧 build 的 HTML
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
      {
        source: "/static/:path*",
        destination: `${API_ORIGIN}/static/:path*`,
      },
    ]
  },
}

export default nextConfig
