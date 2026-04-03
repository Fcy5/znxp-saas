"use client"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Bot, Sparkles, ImageIcon, Share2, Rocket,
  Loader2, Check, ChevronRight, X, Copy, Download,
} from "lucide-react"
import {
  agentApi, AVAILABLE_MODELS, IMAGE_MODELS, IMAGE_PROMPTS, STATIC_BASE,
  type CopywritingResult, type SocialCopyResult,
} from "@/lib/api"

// ── 上架流程：SEO文案 → AI图片（基于原图）→ 上架 ──────────────
type PublishStep = "copy" | "image" | "confirm"

interface PublishWorkflowProps {
  productId: number
  productTitle: string
  productImage?: string   // 原始商品图
  onClose: () => void
  onPublish: (data: { title: string; description: string; extraImages: string[] }) => void
}

function PublishWorkflow({ productId, productTitle, productImage, onClose, onPublish }: PublishWorkflowProps) {
  const [step, setStep] = useState<PublishStep>("copy")

  // Step 1 - SEO copy
  const [copyModel, setCopyModel] = useState(AVAILABLE_MODELS[0].value)
  const [copyLoading, setCopyLoading] = useState(false)
  const [copyResult, setCopyResult] = useState<CopywritingResult | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editDesc, setEditDesc] = useState("")
  const [copyError, setCopyError] = useState("")

  // Step 2 - Images
  const [imgModel, setImgModel] = useState(IMAGE_MODELS[0].value)
  const [imgPrompt, setImgPrompt] = useState(IMAGE_PROMPTS[0].prompt)
  const [imgLoading, setImgLoading] = useState(false)
  const [generatedImgs, setGeneratedImgs] = useState<string[]>([])
  const [selectedImgs, setSelectedImgs] = useState<Set<string>>(new Set())
  const [imgError, setImgError] = useState("")

  const handleGenerateCopy = async () => {
    setCopyLoading(true); setCopyError("")
    try {
      const res = await agentApi.generateCopy(productId, "en", copyModel)
      if (res.data) {
        setCopyResult(res.data)
        setEditTitle(res.data.seo_title)
        setEditDesc(res.data.html_description)
      }
    } catch (e: unknown) { setCopyError(e instanceof Error ? e.message : "生成失败") }
    finally { setCopyLoading(false) }
  }

  const handleGenerateImage = async () => {
    setImgLoading(true); setImgError("")
    try {
      const res = await agentApi.generateImage(imgPrompt, imgModel, productImage)
      if (res.data?.url) setGeneratedImgs(prev => [res.data!.url, ...prev])
    } catch (e: unknown) { setImgError(e instanceof Error ? e.message : "生成失败") }
    finally { setImgLoading(false) }
  }

  const toggleImg = (url: string) => setSelectedImgs(prev => {
    const n = new Set(prev); n.has(url) ? n.delete(url) : n.add(url); return n
  })

  const fullUrl = (url: string) => url.startsWith("http") ? url : `${STATIC_BASE}${url}`

  const STEPS: { id: PublishStep; label: string }[] = [
    { id: "copy",    label: "① SEO 文案" },
    { id: "image",   label: "② AI 图片" },
    { id: "confirm", label: "③ 确认上架" },
  ]

  return (
    <div className="space-y-4">
      {/* Step nav */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1">
            <button onClick={() => setStep(s.id)} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${step === s.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              {s.label}
            </button>
            {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Step 1: SEO 文案 */}
      {step === "copy" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">基于原商品标题、描述、图片生成 SEO 优化文案</p>
          <div className="flex gap-2">
            <select value={copyModel} onChange={e => setCopyModel(e.target.value)} className="flex-1 text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground">
              {AVAILABLE_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <Button onClick={handleGenerateCopy} disabled={copyLoading} className="gap-1.5 shrink-0">
              {copyLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />生成中...</> : <><Sparkles className="w-3.5 h-3.5" />生成文案</>}
            </Button>
          </div>
          {copyError && <p className="text-xs text-destructive">{copyError}</p>}
          {copyResult && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">SEO 标题（可编辑）</label>
                <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">商品描述 HTML（可编辑）</label>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={7}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <Button size="sm" className="w-full gap-1.5" onClick={() => setStep("image")}>
                确认文案，下一步 <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: AI 图片（基于原图） */}
      {step === "image" && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary border border-border">
            {productImage && (
              <img src={fullUrl(productImage)} alt="原图" className="w-14 h-14 rounded-lg object-cover shrink-0 border border-border" />
            )}
            <p className="text-xs text-muted-foreground leading-relaxed">
              AI 将基于原商品图进行重绘（image edit 模式）。<br />
              选择风格后点击生成，可多次生成对比。
            </p>
          </div>
          <select value={imgModel} onChange={e => setImgModel(e.target.value)} className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground">
            {IMAGE_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <div className="flex flex-wrap gap-1.5">
            {IMAGE_PROMPTS.map(t => (
              <button key={t.label} onClick={() => setImgPrompt(t.prompt)}
                className={`text-[10px] px-2.5 py-1 rounded-lg border transition-colors ${imgPrompt === t.prompt ? "border-violet-500/50 bg-violet-500/10 text-violet-400" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <textarea value={imgPrompt} onChange={e => setImgPrompt(e.target.value)} rows={2}
            className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
          <Button onClick={handleGenerateImage} disabled={imgLoading} className="w-full gap-1.5">
            {imgLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />基于原图生成中...</> : <><Sparkles className="w-3.5 h-3.5" />生成图片</>}
          </Button>
          {imgError && <p className="text-xs text-destructive">{imgError}</p>}
          {generatedImgs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">点击图片选中（加入上架），可继续生成更多</p>
              <div className="grid grid-cols-3 gap-2">
                {generatedImgs.map((url, i) => {
                  const sel = selectedImgs.has(url)
                  return (
                    <div key={i} onClick={() => toggleImg(url)}
                      className={`relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${sel ? "border-primary" : "border-transparent"}`}>
                      <img src={fullUrl(url)} alt="" className="w-full h-full object-cover" />
                      {sel && <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>}
                      <a href={fullUrl(url)} download onClick={e => e.stopPropagation()}
                        className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80">
                        <Download className="w-3 h-3 text-white" />
                      </a>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <Button size="sm" className="w-full gap-1.5" onClick={() => setStep("confirm")}>
            下一步：确认上架 <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Step 3: 确认上架 */}
      {step === "confirm" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-secondary p-4 space-y-3 text-xs">
            <p className="font-medium text-foreground">上架内容确认</p>
            <div className="space-y-1.5 text-muted-foreground">
              <div className="flex gap-2"><span className="text-foreground shrink-0">标题：</span><span>{editTitle || productTitle}</span></div>
              <div className="flex gap-2"><span className="text-foreground shrink-0">描述：</span><span>{editDesc ? "✅ AI 优化 HTML 描述" : "⚠️ 未生成，使用原描述"}</span></div>
              <div className="flex gap-2"><span className="text-foreground shrink-0">图片：</span><span>原图 + {selectedImgs.size} 张 AI 生成图</span></div>
            </div>
          </div>
          {selectedImgs.size > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {Array.from(selectedImgs).map((url, i) => (
                <img key={i} src={fullUrl(url)} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0 border border-border" />
              ))}
            </div>
          )}
          <Button className="w-full gap-2 h-11" onClick={() => { onPublish({ title: editTitle || productTitle, description: editDesc, extraImages: Array.from(selectedImgs) }); onClose() }}>
            <Rocket className="w-4 h-4" /> 进入上架表单
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">文案和图片已预填，在上架表单再次确认后提交</p>
        </div>
      )}
    </div>
  )
}

// ── 社媒流程：文案 + 图片，完全基于原商品 ─────────────────────────

const SOCIAL_IMAGE_PROMPTS = [
  { label: "TikTok 竖版",    prompt: "Vertical 9:16 TikTok-style product showcase, vibrant colors, eye-catching, young trendy aesthetic, no text overlay, no watermark" },
  { label: "Instagram 方图",  prompt: "Square Instagram product photo, aesthetic lifestyle, clean composition, warm natural light, no text, no watermark" },
  { label: "Facebook 横版",   prompt: "Horizontal Facebook ad product photo, clean white or lifestyle background, clear product focus, professional, no watermark" },
  { label: "模特展示",        prompt: "Young attractive model wearing/using the product, lifestyle photo, natural setting, social media ready, no watermark" },
  { label: "场景氛围",        prompt: "Cozy lifestyle product scene, warm tones, aspirational home setting, social media aesthetic, no text, no watermark" },
]

interface SocialWorkflowProps {
  productId: number
  productImage?: string
}

function SocialWorkflow({ productId, productImage }: SocialWorkflowProps) {
  // 文案
  const [copyModel, setCopyModel] = useState(AVAILABLE_MODELS[0].value)
  const [copyLoading, setCopyLoading] = useState(false)
  const [copyResult, setCopyResult] = useState<SocialCopyResult | null>(null)
  const [copyError, setCopyError] = useState("")
  const [copied, setCopied] = useState<string | null>(null)

  // 图片
  const [imgModel, setImgModel] = useState(IMAGE_MODELS[0].value)
  const [imgPrompt, setImgPrompt] = useState(SOCIAL_IMAGE_PROMPTS[0].prompt)
  const [imgLoading, setImgLoading] = useState(false)
  const [generatedImgs, setGeneratedImgs] = useState<string[]>([])
  const [imgError, setImgError] = useState("")

  const handleGenerateCopy = async () => {
    setCopyLoading(true); setCopyError("")
    try {
      const res = await agentApi.generateSocialCopy(productId, copyModel)
      if (res.data) setCopyResult(res.data)
    } catch (e: unknown) { setCopyError(e instanceof Error ? e.message : "生成失败") }
    finally { setCopyLoading(false) }
  }

  const handleGenerateImage = async () => {
    setImgLoading(true); setImgError("")
    try {
      const res = await agentApi.generateImage(imgPrompt, imgModel, productImage)
      if (res.data?.url) setGeneratedImgs(prev => [res.data!.url, ...prev])
    } catch (e: unknown) { setImgError(e instanceof Error ? e.message : "生成失败") }
    finally { setImgLoading(false) }
  }

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key); setTimeout(() => setCopied(null), 2000)
  }

  const fullUrl = (url: string) => url.startsWith("http") ? url : `${STATIC_BASE}${url}`

  return (
    <div className="space-y-5">

      {/* ── 文案区 ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-foreground">社媒文案</p>
          <span className="text-[10px] text-muted-foreground">基于原商品信息+图片生成</span>
        </div>
        <div className="flex gap-2">
          <select value={copyModel} onChange={e => setCopyModel(e.target.value)}
            className="flex-1 text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground">
            {AVAILABLE_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <Button onClick={handleGenerateCopy} disabled={copyLoading} className="gap-1.5 shrink-0">
            {copyLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />生成中...</> : <><Sparkles className="w-3.5 h-3.5" />生成文案</>}
          </Button>
        </div>
        {copyError && <p className="text-xs text-destructive">{copyError}</p>}
        {copyResult && (
          <div className="space-y-2">
            {([
              { key: "tiktok",    label: "🎵 TikTok",    text: copyResult.tiktok },
              { key: "facebook",  label: "📘 Facebook",  text: copyResult.facebook },
              { key: "instagram", label: "📸 Instagram", text: copyResult.instagram },
            ] as const).map(({ key, label, text }) => (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">{label}</span>
                  <button onClick={() => handleCopy(text, key)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                    {copied === key ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copied === key ? "已复制" : "复制"}
                  </button>
                </div>
                <p className="text-xs bg-secondary rounded-lg px-3 py-2.5 text-foreground leading-relaxed whitespace-pre-wrap">{text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border" />

      {/* ── 图片区 ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-foreground">社媒配图</p>
          <span className="text-[10px] text-muted-foreground">基于原商品图重绘</span>
        </div>
        {productImage && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary border border-border">
            <img src={fullUrl(productImage)} alt="原图" className="w-12 h-12 rounded-lg object-cover shrink-0 border border-border" />
            <p className="text-xs text-muted-foreground">将基于此原图进行风格重绘</p>
          </div>
        )}
        <select value={imgModel} onChange={e => setImgModel(e.target.value)}
          className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground">
          {IMAGE_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <div className="flex flex-wrap gap-1.5">
          {SOCIAL_IMAGE_PROMPTS.map(t => (
            <button key={t.label} onClick={() => setImgPrompt(t.prompt)}
              className={`text-[10px] px-2.5 py-1 rounded-lg border transition-colors ${imgPrompt === t.prompt ? "border-pink-500/50 bg-pink-500/10 text-pink-400" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <textarea value={imgPrompt} onChange={e => setImgPrompt(e.target.value)} rows={2}
          className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
        <Button onClick={handleGenerateImage} disabled={imgLoading} className="w-full gap-1.5">
          {imgLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />基于原图生成中...</> : <><Sparkles className="w-3.5 h-3.5" />生成社媒配图</>}
        </Button>
        {imgError && <p className="text-xs text-destructive">{imgError}</p>}
        {generatedImgs.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {generatedImgs.map((url, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-border group/img">
                <img src={fullUrl(url)} alt="" className="w-full h-full object-cover" />
                <a href={fullUrl(url)} download
                  className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-black/80">
                  <Download className="w-3.5 h-3.5 text-white" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

// ── 主入口：两个 Tab ───────────────────────────────────────────────

type Tab = "publish" | "social"

interface AgentWorkflowProps {
  productId: number
  productTitle: string
  productImage?: string
  onClose: () => void
  onPublish: (data: { title: string; description: string; extraImages: string[] }) => void
}

export function AgentWorkflow({ productId, productTitle, productImage, onClose, onPublish }: AgentWorkflowProps) {
  const [tab, setTab] = useState<Tab>("publish")

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="w-4 h-4 text-violet-400" />
            Agent 优化工作台
            <Badge variant="default" className="text-[9px]">BETA</Badge>
          </CardTitle>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </CardHeader>

        {/* Tab 切换 */}
        <div className="flex gap-1 px-6 pb-4 shrink-0 border-b border-border">
          <button onClick={() => setTab("publish")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${tab === "publish" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
            <Rocket className="w-3.5 h-3.5" /> 上架优化流程
          </button>
          <button onClick={() => setTab("social")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${tab === "social" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
            <Share2 className="w-3.5 h-3.5" /> 社媒文案生成
          </button>
        </div>

        <CardContent className="flex-1 overflow-y-auto pt-4">
          {tab === "publish"
            ? <PublishWorkflow productId={productId} productTitle={productTitle} productImage={productImage} onClose={onClose} onPublish={onPublish} />
            : <SocialWorkflow productId={productId} productImage={productImage} />
          }
        </CardContent>
      </Card>
    </div>
  )
}
