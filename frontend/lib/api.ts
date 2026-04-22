export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.host}/api/v1`
    : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"))
// 静态资源 base（去掉 /api/v1 路径）
export const STATIC_BASE = typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_STATIC_BASE || `${window.location.protocol}//${window.location.host}`)
  : (process.env.NEXT_PUBLIC_STATIC_BASE || (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1").replace(/\/api\/v1$/, ""))

function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("access_token")
}

export async function request<T>(path: string, options: RequestInit & { silent?: boolean } = {}): Promise<T> {
  const { silent, ...fetchOptions } = options
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...fetchOptions.headers,
    },
  })
  const json = await res.json()
  if (!res.ok) {
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("access_token")
        window.location.href = "/login"
      }
      throw new Error("401")
    }
    throw new Error(json.detail || json.message || "Request failed")
  }
  return json
}

export interface ProductRecommendation extends ProductCard {
  review_count?: number
  rec_score: number
  rec_reason: string
}

export interface ProductCard {
  id: number
  title: string
  source_platform: string
  source_url?: string
  main_image?: string
  price?: number
  sales_trend?: number
  review_score?: number
  review_count?: number
  tiktok_views?: number
  facebook_ad_count?: number
  ai_score?: number
  profit_margin_estimate?: number
  category?: string
}

export interface ProductDetail extends ProductCard {
  description?: string
  images?: string[]
  variants?: unknown[]
  gmc_search_volume?: number
  etsy_favorites?: number
  sentiment_summary?: string
  pain_points?: string[]
  source_url?: string
  is_saved?: boolean
}

export interface PageInfo {
  page: number
  page_size: number
  total: number
  total_pages: number
}

export interface PagedResponse<T> {
  code: number
  message: string
  data: T[]
  page_info: PageInfo
}

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export interface ProductFilterRequest {
  page?: number
  page_size?: number
  category?: string | null
  source_platform?: string | null
  price_min?: number | null
  price_max?: number | null
  profit_margin_min?: number | null
  sales_trend_min?: number | null
  keyword?: string | null
  brand?: string | null
  sort_by?: string
  sort_order?: string
}

export const productApi = {
  recommendations: (limit = 5) =>
    request<ApiResponse<ProductRecommendation[]>>(`/products/recommendations?limit=${limit}`),

  search: (body: ProductFilterRequest) =>
    request<PagedResponse<ProductCard>>("/products/search", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getDetail: (id: number) =>
    request<ApiResponse<ProductDetail>>(`/products/${id}`),

  save: (id: number) =>
    request<ApiResponse<null>>(`/products/${id}/save`, { method: "POST" }),

  unsave: (id: number) =>
    request<ApiResponse<null>>(`/products/${id}/save`, { method: "DELETE" }),

  myLibrary: (page = 1, page_size = 20, keyword?: string) =>
    request<PagedResponse<ProductCard>>(`/products/library/list?page=${page}&page_size=${page_size}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ""}`),

  batchSave: (product_ids: number[]) =>
    request<ApiResponse<null>>("/products/batch-save", {
      method: "POST",
      body: JSON.stringify({ product_ids }),
    }),
}

export interface LoginRequest {
  email: string
  password: string
}

export interface TokenResponse {
  access_token: string
  user_id: number
  username: string
  email: string
  subscription_tier: string
}

export interface Shop {
  id: number
  name: string
  domain: string
  platform: string
  access_token?: string
  niche?: string
  profile_summary?: string
}

export interface ShopCreateRequest {
  name: string
  domain: string
  access_token: string
  platform?: string
}

export const shopApi = {
  list: () =>
    request<ApiResponse<Shop[]>>("/shops/"),

  create: (body: ShopCreateRequest) =>
    request<ApiResponse<Shop>>("/shops/", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (id: number, body: { name?: string; access_token?: string }) =>
    request<ApiResponse<Shop>>(`/shops/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  delete: (id: number) =>
    request<ApiResponse<null>>(`/shops/${id}`, { method: "DELETE" }),

  verify: (id: number) =>
    request<ApiResponse<null>>(`/shops/${id}/verify`, { method: "POST" }),
}

export interface SizeVariant {
  size: string
  price: number
}

export interface PublishRequest {
  product_id: number
  shop_id: number
  title?: string
  description?: string
  price?: number
  tags?: string
  product_type?: string
  variants?: SizeVariant[]
  extra_images?: string[]
}

export interface PublishedProduct {
  id: number
  product_id: number
  shop_id: number
  shopify_product_id?: string
  shopify_product_url?: string
  published_title?: string
  published_price?: number
  status: string
  error_message?: string
  published_at?: string
  created_at: string
}

export const publishApi = {
  publish: (body: PublishRequest) =>
    request<ApiResponse<PublishedProduct>>("/publish/", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  list: (shopId?: number, page = 1, pageSize = 20) =>
    request<PagedResponse<PublishedProduct>>(
      `/publish/list?page=${page}&page_size=${pageSize}${shopId ? `&shop_id=${shopId}` : ""}`
    ),

  updatePrice: (recordId: number, price: number) =>
    request<ApiResponse<PublishedProduct>>(`/publish/${recordId}/price`, {
      method: "PUT",
      body: JSON.stringify({ price }),
    }),

  unpublish: (recordId: number) =>
    request<ApiResponse<null>>(`/publish/${recordId}`, { method: "DELETE" }),
}

export interface Supplier {
  id: number
  supplier_name: string
  supplier_logo?: string
  supplier_url?: string
  supplier_phone?: string
  supplier_email?: string
  supplier_description?: string
}

export interface SupplierProduct {
  id: number
  supplier_id?: string
  product_id?: string
  title?: string
  product_type?: string
  price?: number
  channel?: string
  image?: { src: string }
  images?: { src: string }[]
  is_putawayis: number
  product_url?: string
  tags?: string
}

export const uploadApi = {
  upload: async (file: File): Promise<string> => {
    const token = getToken()
    const form = new FormData()
    form.append("file", file)
    const res = await fetch(`${API_BASE}/upload/`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message || "上传失败")
    // return relative path, let frontend compose full URL with STATIC_BASE
    return json.data.url as string
  },
}

export const supplierApi = {
  list: (keyword?: string, page = 1, pageSize = 20) =>
    request<PagedResponse<Supplier>>(
      `/suppliers/?page=${page}&page_size=${pageSize}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ""}`
    ),

  create: (body: Omit<Supplier, "id">) =>
    request<ApiResponse<Supplier>>("/suppliers/", { method: "POST", body: JSON.stringify(body) }),

  update: (id: number, body: Partial<Supplier>) =>
    request<ApiResponse<Supplier>>(`/suppliers/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  delete: (id: number) =>
    request<ApiResponse<null>>(`/suppliers/${id}`, { method: "DELETE" }),

  products: (params: { supplierId?: number; title?: string; isPutawayis?: number; page?: number; pageSize?: number }) => {
    const { supplierId, title, isPutawayis, page = 1, pageSize = 20 } = params
    const q = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (supplierId) q.set("supplier_id", String(supplierId))
    if (title) q.set("title", title)
    if (isPutawayis !== undefined) q.set("is_putawayis", String(isPutawayis))
    return request<PagedResponse<SupplierProduct>>(`/suppliers/products/list?${q}`)
  },

  createProduct: (body: {
    supplier_id: number
    title: string
    product_type?: string
    body_html?: string
    tags?: string
    price?: number
    product_url?: string
    images?: { src: string }[]
  }) =>
    request<ApiResponse<SupplierProduct>>("/suppliers/products/", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  deleteProduct: (id: number) =>
    request<ApiResponse<null>>(`/suppliers/products/${id}`, { method: "DELETE" }),

  toggleShelf: (id: number, status: 0 | 1) =>
    request<ApiResponse<null>>(`/suppliers/products/${id}/shelf?status=${status}`, { method: "PUT" }),
}

export interface DashboardStats {
  today_recommended: number
  total_products_in_library: number
  published_today: number
  total_published: number
  total_products_platform: number
  agent_tasks_running: number
  agent_tasks_completed_today: number
  platform_counts: Record<string, number>
  category_counts: Record<string, number>
}

export interface TrendPoint {
  date: string
  new_products: number
  published: number
}

export const dashboardApi = {
  stats: () => request<ApiResponse<DashboardStats>>("/dashboard/stats"),
  trend: (days = 14) => request<ApiResponse<TrendPoint[]>>(`/dashboard/trend?days=${days}`),
}

export const authApi = {
  login: (body: LoginRequest) =>
    request<ApiResponse<TokenResponse>>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  register: (body: { email: string; username: string; password: string; otp_code: string }) =>
    request<ApiResponse<TokenResponse>>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  sendOtp: (email: string) =>
    request<ApiResponse<null>>("/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
}

export interface CopywritingResult {
  seo_title: string
  meta_description: string
  html_description: string
  alt_tags: string[]
}

export const AVAILABLE_MODELS = [
  { value: "google/gemini-3.1-pro-preview",    label: "Gemini 3.1 Pro (Preview)" },
  { value: "google/gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite" },
  { value: "google/gemini-2.5-pro",            label: "Gemini 2.5 Pro" },
  { value: "google/gemini-2.5-flash",          label: "Gemini 2.5 Flash" },
  { value: "anthropic/claude-sonnet-4.6",      label: "Claude Sonnet 4.6" },
  { value: "anthropic/claude-opus-4.6",        label: "Claude Opus 4.6" },
  { value: "openai/gpt-5",                     label: "GPT-5" },
  { value: "openai/gpt-4o",                    label: "GPT-4o" },
  { value: "deepseek/deepseek-v3.2",           label: "DeepSeek V3.2" },
  { value: "bailian/qwen3-max",                label: "Qwen3 Max" },
]

export const IMAGE_MODELS = [
  { value: "openai/gpt-image-1.5",                  label: "GPT-Image 1.5" },
  { value: "google/gemini-3.1-flash-image-preview",  label: "Gemini 3.1 Flash Image" },
  { value: "google/gemini-2.5-flash-image",          label: "Gemini 2.5 Flash Image" },
]

export const IMAGE_PROMPTS = [
  { label: "白底产品图",   prompt: "Professional product photo on pure white background, clean, high quality, no watermark, no text" },
  { label: "欧美生活场景", prompt: "Product lifestyle photo in a modern American home setting, natural lighting, cozy atmosphere, no watermark" },
  { label: "礼品展示",     prompt: "Gift presentation photo, elegant wrapping, soft bokeh background, warm lighting, no watermark" },
  { label: "去除水印重绘", prompt: "Clean product photo, remove all watermarks and text overlays, white background, professional e-commerce style" },
  { label: "节日主题",     prompt: "Festive holiday themed product photo, Christmas decorations, warm lighting, gift concept, no watermark" },
  { label: "欧美模特展示", prompt: "Young attractive American model wearing/holding the product, lifestyle photo, natural light, casual home setting, no watermark, high quality fashion photo" },
  { label: "模特街拍",     prompt: "Trendy streetwear style photo, model wearing the product outdoors, urban background, golden hour lighting, no watermark" },
]

export interface SocialCopyResult {
  tiktok: string
  facebook: string
  instagram: string
}

export interface AgentTask {
  id: number
  task_type: string
  status: string   // pending | running | success | failed
  progress: number
  output_data: Record<string, unknown> | null
  error_message: string | null
  created_at: string
}

export interface ProductDetail {
  id: number
  title: string
  source_platform: string
  source_url: string | null
  main_image: string | null
  price: number | null
  category: string | null
  description: string | null
  seo_title: string | null
  meta_description: string | null
  alt_tags: string[] | null
  ai_description: string | null
  images: unknown[] | null
  variants: unknown[] | null
  review_score: number | null
  review_count: number | null
  ai_score: number | null
  is_saved: boolean
}

export const agentApi = {
  generateCopy: (product_id: number, language = "en", model?: string) =>
    request<ApiResponse<CopywritingResult>>("/agent/copywriting", {
      method: "POST",
      body: JSON.stringify({ product_id, language, model }),
    }),

  generateImage: (prompt: string, model = "openai/gpt-image-1.5", referenceImageUrl?: string) =>
    request<ApiResponse<{ url: string }>>("/agent/image-generate", {
      method: "POST",
      body: JSON.stringify({ prompt, model, size: "1024x1024", reference_image_url: referenceImageUrl }),
    }),

  generateSocialCopy: (product_id: number, model?: string) =>
    request<ApiResponse<SocialCopyResult>>("/agent/social-copy", {
      method: "POST",
      body: JSON.stringify({ product_id, model }),
    }),

  storeProfile: (shop_domain: string) =>
    request<ApiResponse<AgentTask>>("/agent/store-profile", {
      method: "POST",
      body: JSON.stringify({ shop_domain }),
    }),

  autoDiscovery: (shop_id: number, count = 10) =>
    request<ApiResponse<AgentTask>>("/agent/auto-discovery", {
      method: "POST",
      body: JSON.stringify({ shop_id, count }),
    }),

  getTask: (task_id: number) =>
    request<ApiResponse<AgentTask>>(`/agent/tasks/${task_id}`),

  listTasks: () =>
    request<ApiResponse<AgentTask[]>>("/agent/tasks"),

  listShopDiagnosis: (shop_id: number) =>
    request<ApiResponse<AgentTask[]>>(`/agent/tasks?shop_id=${shop_id}&task_type=store_profile`),

  batchCopywriting: (product_ids: number[], shop_id?: number) =>
    request<ApiResponse<AgentTask>>("/agent/batch-copywriting", {
      method: "POST",
      body: JSON.stringify({ product_ids, shop_id: shop_id ?? null }),
    }),

  syncShopifyProducts: (shop_id: number) =>
    request<ApiResponse<{ synced: number; synced_at: string }>>(`/agent/shopify-sync?shop_id=${shop_id}`, { method: "POST" }),

  listShopifyProducts: (shop_id: number, params?: { q?: string; status?: string; sort?: string; page?: number; per_page?: number }) => {
    const qs = new URLSearchParams({ shop_id: String(shop_id), ...(params as Record<string, string> || {}) }).toString()
    return request<ApiResponse<{
      products: { shopify_product_id: number; title: string; image_url: string; status: string; product_type: string; tags: string; price: string; published_at: string | null; shopify_created_at: string | null }[]
      total: number; page: number; per_page: number; last_synced_at: string | null
    }>>(`/agent/shopify-products?${qs}`)
  },

  shopifySeoOptimize: (shop_id: number, product_ids?: number[]) =>
    request<ApiResponse<AgentTask>>("/agent/shopify-seo-optimize", {
      method: "POST",
      body: JSON.stringify({ shop_id, product_ids: product_ids ?? null }),
    }),

  shopifyBulkStatus: (shop_id: number, product_ids: number[], status: string) =>
    request<ApiResponse<{ total: number; success: number; failed: number; errors: string[] }>>("/agent/shopify-bulk-status", {
      method: "POST",
      body: JSON.stringify({ shop_id, product_ids, status }),
    }),

  shopifyBulkPrice: (shop_id: number, product_ids: number[], rule_type: string, rule_value: number) =>
    request<ApiResponse<{ total: number; success: number; failed: number; errors: string[] }>>("/agent/shopify-bulk-price", {
      method: "POST",
      body: JSON.stringify({ shop_id, product_ids, rule_type, rule_value }),
    }),

  shopifySeoApply: (shop_id: number, task_id: number, selected_shopify_ids: number[]) =>
    request<ApiResponse<{ total: number; success: number; failed: number; errors: string[] }>>("/agent/shopify-seo-apply", {
      method: "POST",
      body: JSON.stringify({ shop_id, task_id, selected_shopify_ids }),
    }),

  videoGeneration: (product_id: number, duration = 5, resolution = "720p") =>
    request<ApiResponse<AgentTask>>("/agent/video-generation", {
      method: "POST",
      body: JSON.stringify({ product_id, duration, resolution }),
    }),

  videoFromUrl: (image_url: string, title: string, product_type = "", duration = 5) =>
    request<ApiResponse<AgentTask>>("/agent/video-from-url", {
      method: "POST",
      body: JSON.stringify({ image_url, title, product_type, duration }),
    }),

  pollTask: (task_id: number) =>
    request<ApiResponse<AgentTask>>(`/agent/tasks/${task_id}`),
}
