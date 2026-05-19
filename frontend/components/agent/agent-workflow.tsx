"use client"
import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Bot, Sparkles, ImageIcon, Share2, Rocket,
  Loader2, Check, ChevronRight, X, Copy, Download, ImageOff,
  Upload, Trash2, Video, Save, Wand2, PlusCircle, Clapperboard,
} from "lucide-react"
import {
  agentApi, AVAILABLE_MODELS, IMAGE_MODELS, IMAGE_SIZES, IMAGE_QUALITIES, IMAGE_PROMPTS, STATIC_BASE,
  uploadApi, VIDEO_MODELS,
  type CopywritingResult, type SocialCopyResult,
} from "@/lib/api"

type PublishStep = "copy" | "image" | "confirm"
type Tab = "publish" | "social"
type StudioSourceMode = "product" | "upload" | "none"

interface PublishWorkflowProps {
  productId: number
  productTitle: string
  productImage?: string
  initialExtraImages: string[]
  onClose: () => void
  onPublish: (data: { title: string; description: string; extraImages: string[] }) => void
}

interface SocialWorkflowProps {
  productId: number
  productTitle: string
  productImage?: string
  publishExtraImages: string[]
  onAddToPublish: (url: string) => void
  onRemoveFromPublish: (url: string) => void
}

interface StudioUpload {
  url: string
  name: string
}

interface StudioAsset {
  id: string
  type: "image" | "video"
  url: string
  prompt: string
  createdAt: string
  sourceLabel: string
  coverUrl?: string
}

const SOCIAL_LIBRARY_LIMIT = 24
const SOCIAL_IMAGE_PROMPTS = [
  { label: "TikTok 竖版", prompt: "Vertical 9:16 TikTok-style product showcase, vibrant colors, eye-catching, young trendy aesthetic, no text overlay, no watermark" },
  { label: "Instagram 方图", prompt: "Square Instagram product photo, aesthetic lifestyle, clean composition, warm natural light, no text, no watermark" },
  { label: "Facebook 横版", prompt: "Horizontal Facebook ad product photo, clean white or lifestyle background, clear product focus, professional, no watermark" },
  { label: "模特展示", prompt: "Young attractive model wearing or using the product, lifestyle photo, natural setting, social media ready, no watermark" },
  { label: "节日种草", prompt: "Gift-ready social media product scene, warm emotional lighting, polished home decor styling, premium, no watermark" },
]
const SOCIAL_VIDEO_PROMPTS = [
  { label: "开箱展示", prompt: "Create a 5-second social media unboxing style product video with smooth camera movement, soft shadows, close-up details, and a premium reveal ending." },
  { label: "模特种草", prompt: "Turn this image into a short lifestyle social video with a model using the product naturally, bright lighting, smooth movement, and a premium DTC ad feeling." },
  { label: "广告节奏", prompt: "Generate a punchy e-commerce ad video with dynamic zoom, premium studio lighting, strong product focus, and scroll-stopping motion for paid social." },
]

function buildAssetUrl(url?: string | null) {
  if (!url) return ""
  return url.startsWith("http") ? url : `${STATIC_BASE}${url}`
}

function formatAssetTime(iso: string) {
  const date = new Date(iso)
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

function getLibraryKey(productId: number) {
  return `znxp-social-studio:${productId}`
}

function PublishWorkflow({
  productId,
  productTitle,
  productImage,
  initialExtraImages,
  onClose,
  onPublish,
}: PublishWorkflowProps) {
  const [step, setStep] = useState<PublishStep>("copy")

  const [copyModel, setCopyModel] = useState(AVAILABLE_MODELS[0].value)
  const [copyLoading, setCopyLoading] = useState(false)
  const [copyResult, setCopyResult] = useState<CopywritingResult | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editDesc, setEditDesc] = useState("")
  const [copyError, setCopyError] = useState("")

  const [imgModel, setImgModel] = useState(IMAGE_MODELS[0].value)
  const [imgPrompt, setImgPrompt] = useState(IMAGE_PROMPTS[0].prompt)
  const [imgLoading, setImgLoading] = useState(false)
  const [generatedImgs, setGeneratedImgs] = useState<string[]>([])
  const [selectedImgs, setSelectedImgs] = useState<Set<string>>(new Set())
  const [imgError, setImgError] = useState("")
  const [useRefImg, setUseRefImg] = useState(true)
  const [imgSize, setImgSize] = useState("auto")
  const [imgQuality, setImgQuality] = useState("low")

  const handleGenerateCopy = async () => {
    setCopyLoading(true)
    setCopyError("")
    try {
      const res = await agentApi.generateCopy(productId, "en", copyModel)
      if (res.data) {
        setCopyResult(res.data)
        setEditTitle(res.data.seo_title)
        setEditDesc(res.data.html_description)
      }
    } catch (e: unknown) {
      setCopyError(e instanceof Error ? e.message : "生成失败")
    } finally {
      setCopyLoading(false)
    }
  }

  const handleGenerateImage = async () => {
    setImgLoading(true)
    setImgError("")
    try {
      const res = await agentApi.generateImage(
        imgPrompt,
        imgModel,
        useRefImg ? productImage : undefined,
        imgSize,
        imgQuality
      )
      if (res.data?.url) {
        setGeneratedImgs((prev) => [res.data!.url, ...prev])
      }
    } catch (e: unknown) {
      setImgError(e instanceof Error ? e.message : "生成失败")
    } finally {
      setImgLoading(false)
    }
  }

  const toggleImg = (url: string) => {
    setSelectedImgs((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  const finalExtraImages = Array.from(new Set([...initialExtraImages, ...Array.from(selectedImgs)]))

  const steps: { id: PublishStep; label: string }[] = [
    { id: "copy", label: "① 商品标题及详情" },
    { id: "image", label: "② AI 创意图" },
    { id: "confirm", label: "③ 确认上架" },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        {steps.map((item, index) => (
          <div key={item.id} className="flex items-center gap-1">
            <button
              onClick={() => setStep(item.id)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${step === item.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
            >
              {item.label}
            </button>
            {index < steps.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {step === "copy" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">基于原商品标题、描述、图片生成可直接用于上架的商品标题和详情页内容。</p>
          <div className="flex gap-2">
            <select value={copyModel} onChange={(e) => setCopyModel(e.target.value)} className="flex-1 text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground">
              {AVAILABLE_MODELS.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
            </select>
            <Button onClick={handleGenerateCopy} disabled={copyLoading} className="gap-1.5 shrink-0">
              {copyLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />生成中...</> : <><Sparkles className="w-3.5 h-3.5" />生成内容</>}
            </Button>
          </div>
          {copyError && <p className="text-xs text-destructive">{copyError}</p>}
          {copyResult && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">商品标题（可编辑）</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">商品详情 HTML（可编辑）</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={7}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <Button size="sm" className="w-full gap-1.5" onClick={() => setStep("image")}>
                确认内容，下一步 <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {step === "image" && (
        <div className="space-y-3">
          {productImage && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary border border-border">
              <img src={buildAssetUrl(productImage)} alt="原图" className="w-14 h-14 rounded-lg object-cover shrink-0 border border-border" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                  {useRefImg ? "图生图模式：AI 基于原图重绘" : "文生图模式：AI 仅根据提示词生成"}
                </p>
                <button
                  onClick={() => setUseRefImg((value) => !value)}
                  className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg border transition-colors ${useRefImg ? "border-violet-500/50 bg-violet-500/10 text-violet-400" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {useRefImg ? <ImageIcon className="w-3 h-3" /> : <ImageOff className="w-3 h-3" />}
                  {useRefImg ? "给 AI 原图（图生图）" : "不给原图（文生图）"}
                </button>
              </div>
            </div>
          )}
          <select value={imgModel} onChange={(e) => setImgModel(e.target.value)} className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground">
            {IMAGE_MODELS.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select value={imgSize} onChange={(e) => setImgSize(e.target.value)} className="text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground">
              {IMAGE_SIZES.map((size) => <option key={size.value} value={size.value}>{size.label}</option>)}
            </select>
            <select value={imgQuality} onChange={(e) => setImgQuality(e.target.value)} className="text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground">
              {IMAGE_QUALITIES.map((quality) => <option key={quality.value} value={quality.value}>{quality.label}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {IMAGE_PROMPTS.map((item) => (
              <button
                key={item.label}
                onClick={() => setImgPrompt(item.prompt)}
                className={`text-[10px] px-2.5 py-1 rounded-lg border transition-colors ${imgPrompt === item.prompt ? "border-violet-500/50 bg-violet-500/10 text-violet-400" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <textarea
            value={imgPrompt}
            onChange={(e) => setImgPrompt(e.target.value)}
            rows={2}
            className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Button onClick={handleGenerateImage} disabled={imgLoading} className="w-full gap-1.5">
            {imgLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{useRefImg && productImage ? "图生图生成中..." : "文生图生成中..."}</> : <><Sparkles className="w-3.5 h-3.5" />生成创意图</>}
          </Button>
          {imgError && <p className="text-xs text-destructive">{imgError}</p>}
          {generatedImgs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">点击图片选中，即可和当前上架草稿一起带走。</p>
              <div className="grid grid-cols-3 gap-2">
                {generatedImgs.map((url) => {
                  const selected = selectedImgs.has(url)
                  return (
                    <div
                      key={url}
                      onClick={() => toggleImg(url)}
                      className={`relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${selected ? "border-primary" : "border-transparent"}`}
                    >
                      <img src={buildAssetUrl(url)} alt="" className="w-full h-full object-cover" />
                      {selected && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                      <a
                        href={buildAssetUrl(url)}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80"
                      >
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

      {step === "confirm" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-secondary p-4 space-y-3 text-xs">
            <p className="font-medium text-foreground">上架内容确认</p>
            <div className="space-y-1.5 text-muted-foreground">
              <div className="flex gap-2"><span className="text-foreground shrink-0">标题：</span><span>{editTitle || productTitle}</span></div>
              <div className="flex gap-2"><span className="text-foreground shrink-0">详情：</span><span>{editDesc ? "已生成 AI 详情页内容" : "未生成，使用原始描述"}</span></div>
              <div className="flex gap-2"><span className="text-foreground shrink-0">额外图片：</span><span>{finalExtraImages.length} 张</span></div>
            </div>
          </div>
          {finalExtraImages.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {finalExtraImages.map((url) => (
                <img key={url} src={buildAssetUrl(url)} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0 border border-border" />
              ))}
            </div>
          )}
          <Button
            className="w-full gap-2 h-11"
            onClick={() => {
              onPublish({ title: editTitle || productTitle, description: editDesc, extraImages: finalExtraImages })
              onClose()
            }}
          >
            <Rocket className="w-4 h-4" /> 进入上架表单
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">当前内容会自动预填到上架弹窗，你还可以继续手动修改。</p>
        </div>
      )}
    </div>
  )
}

function SocialWorkflow({
  productId,
  productTitle,
  productImage,
  publishExtraImages,
  onAddToPublish,
  onRemoveFromPublish,
}: SocialWorkflowProps) {
  const [copyModel, setCopyModel] = useState(AVAILABLE_MODELS[0].value)
  const [copyLoading, setCopyLoading] = useState(false)
  const [copyResult, setCopyResult] = useState<SocialCopyResult | null>(null)
  const [copyError, setCopyError] = useState("")
  const [copied, setCopied] = useState<string | null>(null)

  const [uploadedImage, setUploadedImage] = useState<StudioUpload | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadError, setUploadError] = useState("")

  const [imgModel, setImgModel] = useState(IMAGE_MODELS[0].value)
  const [imgPrompt, setImgPrompt] = useState(SOCIAL_IMAGE_PROMPTS[0].prompt)
  const [imgLoading, setImgLoading] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<StudioAsset[]>([])
  const [imgError, setImgError] = useState("")
  const [imageSourceMode, setImageSourceMode] = useState<StudioSourceMode>(productImage ? "product" : "none")
  const [imgSize, setImgSize] = useState("auto")
  const [imgQuality, setImgQuality] = useState("low")

  const [videoModel, setVideoModel] = useState(VIDEO_MODELS[0].value)
  const [videoPrompt, setVideoPrompt] = useState(SOCIAL_VIDEO_PROMPTS[0].prompt)
  const [videoDuration, setVideoDuration] = useState(5)
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoStatus, setVideoStatus] = useState<"idle" | "polling" | "done" | "failed">("idle")
  const [videoError, setVideoError] = useState("")
  const [videoResult, setVideoResult] = useState<StudioAsset | null>(null)
  const [videoSourceMode, setVideoSourceMode] = useState<StudioSourceMode>(productImage ? "product" : "none")
  const [videoTaskId, setVideoTaskId] = useState<number | null>(null)

  const [savedAssets, setSavedAssets] = useState<StudioAsset[]>([])
  const videoPollerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getLibraryKey(productId))
      if (!raw) {
        setSavedAssets([])
        return
      }
      const parsed = JSON.parse(raw)
      setSavedAssets(Array.isArray(parsed) ? parsed : [])
    } catch {
      setSavedAssets([])
    }
  }, [productId])

  useEffect(() => {
    localStorage.setItem(
      getLibraryKey(productId),
      JSON.stringify(savedAssets.slice(0, SOCIAL_LIBRARY_LIMIT))
    )
  }, [productId, savedAssets])

  useEffect(() => {
    return () => {
      if (videoPollerRef.current) {
        clearInterval(videoPollerRef.current)
        videoPollerRef.current = null
      }
    }
  }, [])

  const saveAssetToLibrary = (asset: StudioAsset) => {
    setSavedAssets((prev) => {
      if (prev.some((item) => item.url === asset.url)) return prev
      return [asset, ...prev].slice(0, SOCIAL_LIBRARY_LIMIT)
    })
  }

  const removeAssetFromLibrary = (asset: StudioAsset) => {
    setSavedAssets((prev) => prev.filter((item) => item.url !== asset.url))
    if (publishExtraImages.includes(asset.url)) {
      onRemoveFromPublish(asset.url)
    }
  }

  const handleUploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    setUploadError("")
    try {
      const url = await uploadApi.upload(file)
      setUploadedImage({ url, name: file.name })
      setImageSourceMode("upload")
      setVideoSourceMode("upload")
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "上传失败")
    } finally {
      setUploadingImage(false)
      event.target.value = ""
    }
  }

  const resolveSource = (mode: StudioSourceMode) => {
    if (mode === "upload") return uploadedImage?.url
    if (mode === "product") return productImage
    return undefined
  }

  const handleGenerateCopy = async () => {
    setCopyLoading(true)
    setCopyError("")
    try {
      const res = await agentApi.generateSocialCopy(productId, copyModel)
      if (res.data) setCopyResult(res.data)
    } catch (e: unknown) {
      setCopyError(e instanceof Error ? e.message : "生成失败")
    } finally {
      setCopyLoading(false)
    }
  }

  const handleGenerateImage = async () => {
    setImgLoading(true)
    setImgError("")
    try {
      const res = await agentApi.generateImage(
        imgPrompt,
        imgModel,
        resolveSource(imageSourceMode),
        imgSize,
        imgQuality
      )
      if (res.data?.url) {
        const sourceLabel = imageSourceMode === "upload" ? "上传图参考" : imageSourceMode === "product" ? "商品主图参考" : "纯提示词"
        setGeneratedImages((prev) => [
          {
            id: `image-${Date.now()}`,
            type: "image",
            url: res.data!.url,
            prompt: imgPrompt,
            createdAt: new Date().toISOString(),
            sourceLabel,
          },
          ...prev,
        ])
      }
    } catch (e: unknown) {
      setImgError(e instanceof Error ? e.message : "生成失败")
    } finally {
      setImgLoading(false)
    }
  }

  const handleGenerateVideo = async () => {
    const sourceUrl = resolveSource(videoSourceMode)
    if (!sourceUrl) {
      setVideoError("请先选择商品主图或上传一张参考图")
      return
    }
    setVideoLoading(true)
    setVideoError("")
    setVideoStatus("polling")
    setVideoResult(null)
    try {
      const res = await agentApi.videoFromUrl(sourceUrl, productTitle, "", videoDuration, videoModel, videoPrompt)
      const taskId = res.data.id
      setVideoTaskId(taskId)

      if (videoPollerRef.current) clearInterval(videoPollerRef.current)
      videoPollerRef.current = setInterval(async () => {
        try {
          const task = await agentApi.pollTask(taskId)
          if (task.data.status === "success") {
            if (videoPollerRef.current) clearInterval(videoPollerRef.current)
            const url = String(task.data.output_data?.video_url || "")
            const asset: StudioAsset = {
              id: `video-${taskId}`,
              type: "video",
              url,
              prompt: videoPrompt,
              createdAt: new Date().toISOString(),
              sourceLabel: videoSourceMode === "upload" ? "上传图生成视频" : "商品主图生成视频",
              coverUrl: sourceUrl,
            }
            setVideoResult(asset)
            setVideoStatus("done")
            setVideoLoading(false)
          } else if (task.data.status === "failed") {
            if (videoPollerRef.current) clearInterval(videoPollerRef.current)
            setVideoStatus("failed")
            setVideoLoading(false)
            setVideoError(task.data.error_message || "视频生成失败")
          }
        } catch {
          if (videoPollerRef.current) clearInterval(videoPollerRef.current)
          setVideoStatus("failed")
          setVideoLoading(false)
          setVideoError("视频轮询失败")
        }
      }, 5000)
    } catch (e: unknown) {
      setVideoLoading(false)
      setVideoStatus("failed")
      setVideoError(e instanceof Error ? e.message : "启动失败")
    }
  }

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-cyan-500/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_30%),rgba(8,15,32,0.92)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <Badge className="bg-cyan-500/10 text-cyan-300 border border-cyan-400/20">对话式社媒工作台</Badge>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-200">
                <Bot className="w-4 h-4" />
              </div>
              <div className="max-w-xl rounded-[24px] rounded-tl-md border border-white/8 bg-white/6 px-4 py-3 text-sm text-slate-100">
                我会保留原来的社媒文案和上架优化流程。你现在可以直接上传参考图，做图生图、图生视频，并把满意的图片加入上架额外图片或保存到素材库。
              </div>
            </div>
          </div>
          <div className="hidden rounded-[24px] border border-white/8 bg-black/20 px-4 py-3 text-right text-xs text-slate-300 md:block">
            <p>当前已挂到上架额外图</p>
            <p className="mt-1 text-2xl font-semibold text-white">{publishExtraImages.length}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="space-y-4">
          <Card className="overflow-hidden border-cyan-500/15 bg-[linear-gradient(180deg,rgba(8,15,32,0.98),rgba(12,20,39,0.92))]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-white">
                <Share2 className="w-4 h-4 text-cyan-300" />
                社媒文案
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <select value={copyModel} onChange={(e) => setCopyModel(e.target.value)} className="flex-1 text-xs px-3 py-2 rounded-xl border border-white/10 bg-white/6 text-white">
                  {AVAILABLE_MODELS.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
                </select>
                <Button onClick={handleGenerateCopy} disabled={copyLoading} className="gap-1.5 shrink-0 bg-cyan-500 text-slate-950 hover:bg-cyan-400">
                  {copyLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />生成中...</> : <><Sparkles className="w-3.5 h-3.5" />生成文案</>}
                </Button>
              </div>
              {copyError && <p className="text-xs text-red-400">{copyError}</p>}
              {copyResult && (
                <div className="space-y-3">
                  {([
                    { key: "tiktok", label: "TikTok", text: copyResult.tiktok },
                    { key: "facebook", label: "Facebook", text: copyResult.facebook },
                    { key: "instagram", label: "Instagram", text: copyResult.instagram },
                  ] as const).map(({ key, label, text }) => (
                    <div key={key} className="rounded-2xl border border-white/8 bg-black/20 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-white">{label}</span>
                        <button onClick={() => handleCopy(text, key)} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white">
                          {copied === key ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          {copied === key ? "已复制" : "复制"}
                        </button>
                      </div>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-200">{text}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-fuchsia-500/15 bg-[linear-gradient(180deg,rgba(18,10,30,0.98),rgba(16,13,30,0.92))]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-white">
                <Wand2 className="w-4 h-4 text-fuchsia-300" />
                图生图对话区
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[24px] border border-white/8 bg-white/6 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">参考图</p>
                    <p className="text-xs text-slate-400">可继续使用商品主图，也可以上传自己的社媒参考图。</p>
                  </div>
                  <label className={`inline-flex items-center gap-2 rounded-xl border border-dashed border-fuchsia-400/30 px-3 py-2 text-xs text-fuchsia-200 transition-colors hover:border-fuchsia-300 ${uploadingImage ? "opacity-60 pointer-events-none" : "cursor-pointer"}`}>
                    {uploadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    上传参考图
                    <input type="file" accept="image/*" className="hidden" onChange={handleUploadImage} />
                  </label>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {productImage && (
                    <button
                      type="button"
                      onClick={() => setImageSourceMode("product")}
                      className={`rounded-2xl border p-2 text-left transition-all ${imageSourceMode === "product" ? "border-fuchsia-300 bg-fuchsia-500/12" : "border-white/10 bg-black/20 hover:border-white/20"}`}
                    >
                      <img src={buildAssetUrl(productImage)} alt="" className="h-28 w-full rounded-xl object-cover" />
                      <p className="mt-2 text-xs font-medium text-white">商品主图</p>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => uploadedImage ? setImageSourceMode("upload") : undefined}
                    className={`rounded-2xl border p-2 text-left transition-all ${imageSourceMode === "upload" ? "border-fuchsia-300 bg-fuchsia-500/12" : "border-white/10 bg-black/20 hover:border-white/20"} ${!uploadedImage ? "opacity-50" : ""}`}
                  >
                    {uploadedImage ? (
                      <>
                        <img src={buildAssetUrl(uploadedImage.url)} alt="" className="h-28 w-full rounded-xl object-cover" />
                        <p className="mt-2 text-xs font-medium text-white">{uploadedImage.name}</p>
                      </>
                    ) : (
                      <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-slate-400">
                        上传后可作为新参考图
                      </div>
                    )}
                  </button>
                </div>
                {uploadError && <p className="mt-3 text-xs text-red-400">{uploadError}</p>}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select value={imgModel} onChange={(e) => setImgModel(e.target.value)} className="text-xs px-3 py-2 rounded-xl border border-white/10 bg-white/6 text-white">
                  {IMAGE_MODELS.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
                </select>
                <select value={imageSourceMode} onChange={(e) => setImageSourceMode(e.target.value as StudioSourceMode)} className="text-xs px-3 py-2 rounded-xl border border-white/10 bg-white/6 text-white">
                  {productImage && <option value="product">使用商品主图</option>}
                  {uploadedImage && <option value="upload">使用上传参考图</option>}
                  <option value="none">仅使用提示词</option>
                </select>
                <select value={imgSize} onChange={(e) => setImgSize(e.target.value)} className="text-xs px-3 py-2 rounded-xl border border-white/10 bg-white/6 text-white">
                  {IMAGE_SIZES.map((size) => <option key={size.value} value={size.value}>{size.label}</option>)}
                </select>
                <select value={imgQuality} onChange={(e) => setImgQuality(e.target.value)} className="text-xs px-3 py-2 rounded-xl border border-white/10 bg-white/6 text-white">
                  {IMAGE_QUALITIES.map((quality) => <option key={quality.value} value={quality.value}>{quality.label}</option>)}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                {SOCIAL_IMAGE_PROMPTS.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => setImgPrompt(item.prompt)}
                    className={`rounded-full px-3 py-1.5 text-[11px] transition-colors ${imgPrompt === item.prompt ? "bg-fuchsia-400 text-slate-950" : "bg-white/6 text-slate-300 hover:bg-white/12 hover:text-white"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <textarea
                value={imgPrompt}
                onChange={(e) => setImgPrompt(e.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white placeholder:text-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-fuchsia-400"
                placeholder="描述你想要的社媒图片风格..."
              />

              <Button onClick={handleGenerateImage} disabled={imgLoading} className="w-full gap-2 bg-fuchsia-500 text-white hover:bg-fuchsia-400">
                {imgLoading ? <><Loader2 className="w-4 h-4 animate-spin" />正在生成社媒配图...</> : <><Sparkles className="w-4 h-4" />生成新图片</>}
              </Button>
              {imgError && <p className="text-xs text-red-400">{imgError}</p>}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-amber-500/15 bg-[linear-gradient(180deg,rgba(32,20,8,0.98),rgba(28,18,10,0.92))]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-white">
                <Clapperboard className="w-4 h-4 text-amber-300" />
                图生视频对话区
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <select value={videoModel} onChange={(e) => setVideoModel(e.target.value)} className="text-xs px-3 py-2 rounded-xl border border-white/10 bg-white/6 text-white">
                  {VIDEO_MODELS.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
                </select>
                <select value={videoSourceMode} onChange={(e) => setVideoSourceMode(e.target.value as StudioSourceMode)} className="text-xs px-3 py-2 rounded-xl border border-white/10 bg-white/6 text-white">
                  {productImage && <option value="product">商品主图</option>}
                  {uploadedImage && <option value="upload">上传参考图</option>}
                  <option value="none">无图片</option>
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                {SOCIAL_VIDEO_PROMPTS.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => setVideoPrompt(item.prompt)}
                    className={`rounded-full px-3 py-1.5 text-[11px] transition-colors ${videoPrompt === item.prompt ? "bg-amber-300 text-slate-950" : "bg-white/6 text-slate-300 hover:bg-white/12 hover:text-white"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <textarea
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white placeholder:text-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300"
                placeholder="补充镜头语言、节奏、场景氛围等视频要求..."
              />

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">时长</span>
                <div className="flex gap-2">
                  {[5, 8, 10].map((duration) => (
                    <button
                      key={duration}
                      type="button"
                      onClick={() => setVideoDuration(duration)}
                      className={`rounded-full px-3 py-1 text-[11px] ${videoDuration === duration ? "bg-amber-300 text-slate-950" : "bg-white/6 text-slate-300 hover:bg-white/12 hover:text-white"}`}
                    >
                      {duration}s
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={handleGenerateVideo} disabled={videoLoading} className="w-full gap-2 bg-amber-400 text-slate-950 hover:bg-amber-300">
                {videoLoading ? <><Loader2 className="w-4 h-4 animate-spin" />AI 正在生成视频...</> : <><Video className="w-4 h-4" />上传图 + 文本生成视频</>}
              </Button>
              {videoStatus === "polling" && (
                <p className="text-xs text-amber-200/90">任务 #{videoTaskId ?? "—"} 已提交，通常 60-120 秒返回结果。</p>
              )}
              {videoError && <p className="text-xs text-red-400">{videoError}</p>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-white/8 bg-black/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-white">
                <PlusCircle className="w-4 h-4 text-emerald-300" />
                上架额外图片联动
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-slate-400">保存到素材库的图片，或者本轮刚生成的图片，都可以一键挂到上架额外图片里。</p>
              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 px-4 py-3">
                <p className="text-[11px] text-emerald-200">当前已挂载</p>
                <p className="mt-1 text-2xl font-semibold text-white">{publishExtraImages.length}</p>
              </div>
            </CardContent>
          </Card>

          {generatedImages.length > 0 && (
            <Card className="border-white/8 bg-black/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-white">本轮新生成图片</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {generatedImages.map((asset) => {
                  const attached = publishExtraImages.includes(asset.url)
                  const saved = savedAssets.some((item) => item.url === asset.url)
                  return (
                    <div key={asset.id} className="rounded-2xl border border-white/8 bg-white/5 p-3">
                      <img src={buildAssetUrl(asset.url)} alt="" className="h-36 w-full rounded-xl object-cover" />
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] text-slate-400">{asset.sourceLabel}</span>
                          <span className="text-[11px] text-slate-500">{formatAssetTime(asset.createdAt)}</span>
                        </div>
                        <p className="line-clamp-2 text-xs text-slate-200">{asset.prompt}</p>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" className="gap-1.5 bg-fuchsia-500 text-white hover:bg-fuchsia-400" onClick={() => attached ? onRemoveFromPublish(asset.url) : onAddToPublish(asset.url)}>
                            {attached ? <Check className="w-3.5 h-3.5" /> : <PlusCircle className="w-3.5 h-3.5" />}
                            {attached ? "已加入上架图" : "加入上架图"}
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1.5" disabled={saved} onClick={() => saveAssetToLibrary(asset)}>
                            <Save className="w-3.5 h-3.5" />
                            {saved ? "已保存" : "保存到素材库"}
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setGeneratedImages((prev) => prev.filter((item) => item.id !== asset.id))}>
                            <Trash2 className="w-3.5 h-3.5" />
                            删除
                          </Button>
                          <a href={buildAssetUrl(asset.url)} download className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                            <Download className="w-3.5 h-3.5" />
                            下载
                          </a>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {videoResult && (
            <Card className="border-white/8 bg-black/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-white">最新视频结果</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <video src={buildAssetUrl(videoResult.url)} controls className="w-full rounded-2xl border border-white/8 bg-black" />
                <p className="text-xs text-slate-300">{videoResult.prompt}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => saveAssetToLibrary(videoResult)} disabled={savedAssets.some((item) => item.url === videoResult.url)}>
                    <Save className="w-3.5 h-3.5" />
                    {savedAssets.some((item) => item.url === videoResult.url) ? "已保存到素材库" : "保存到素材库"}
                  </Button>
                  <a href={buildAssetUrl(videoResult.url)} download className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                    <Download className="w-3.5 h-3.5" />
                    下载视频
                  </a>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-white/8 bg-black/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-white">已保存素材库</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {savedAssets.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-slate-500">
                  还没有保存的 AI 素材。先生成图片或视频，再决定保留哪些版本。
                </div>
              ) : (
                savedAssets.map((asset) => {
                  const attached = asset.type === "image" && publishExtraImages.includes(asset.url)
                  return (
                    <div key={asset.id} className="rounded-2xl border border-white/8 bg-white/5 p-3">
                      {asset.type === "image" ? (
                        <img src={buildAssetUrl(asset.url)} alt="" className="h-28 w-full rounded-xl object-cover" />
                      ) : (
                        <video src={buildAssetUrl(asset.url)} controls className="h-28 w-full rounded-xl border border-white/8 bg-black object-cover" />
                      )}
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{asset.type === "image" ? "图片" : "视频"}</Badge>
                            <span className="text-[11px] text-slate-400">{asset.sourceLabel}</span>
                          </div>
                          <span className="text-[11px] text-slate-500">{formatAssetTime(asset.createdAt)}</span>
                        </div>
                        <p className="line-clamp-2 text-xs text-slate-200">{asset.prompt}</p>
                        <div className="flex flex-wrap gap-2">
                          {asset.type === "image" && (
                            <Button size="sm" className="gap-1.5 bg-emerald-500 text-slate-950 hover:bg-emerald-400" onClick={() => attached ? onRemoveFromPublish(asset.url) : onAddToPublish(asset.url)}>
                              {attached ? <Check className="w-3.5 h-3.5" /> : <PlusCircle className="w-3.5 h-3.5" />}
                              {attached ? "已在上架图" : "加入上架图"}
                            </Button>
                          )}
                          <a href={buildAssetUrl(asset.url)} download className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                            <Download className="w-3.5 h-3.5" />
                            下载
                          </a>
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => removeAssetFromLibrary(asset)}>
                            <Trash2 className="w-3.5 h-3.5" />
                            删除
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

interface AgentWorkflowProps {
  productId: number
  productTitle: string
  productImage?: string
  initialExtraImages?: string[]
  onAddExtraImage?: (url: string) => void
  onRemoveExtraImage?: (url: string) => void
  onClose: () => void
  onPublish: (data: { title: string; description: string; extraImages: string[] }) => void
}

export function AgentWorkflow({
  productId,
  productTitle,
  productImage,
  initialExtraImages = [],
  onAddExtraImage,
  onRemoveExtraImage,
  onClose,
  onPublish,
}: AgentWorkflowProps) {
  const [tab, setTab] = useState<Tab>("publish")
  const [publishImages, setPublishImages] = useState<string[]>(initialExtraImages)

  useEffect(() => {
    setPublishImages(initialExtraImages)
  }, [initialExtraImages])

  const handleAddExtraImage = (url: string) => {
    setPublishImages((prev) => prev.includes(url) ? prev : [...prev, url])
    onAddExtraImage?.(url)
  }

  const handleRemoveExtraImage = (url: string) => {
    setPublishImages((prev) => prev.filter((item) => item !== url))
    onRemoveExtraImage?.(url)
  }

  return (
    <div className="fixed inset-0 bg-[rgba(3,8,20,0.8)] backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden border-white/10 bg-[linear-gradient(180deg,rgba(7,13,26,0.98),rgba(11,18,31,0.98))]" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between border-b border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_28%),rgba(255,255,255,0.02)] pb-4 shrink-0">
          <div className="space-y-2">
            <CardTitle className="text-base flex items-center gap-2 text-white">
              <Bot className="w-4 h-4 text-cyan-300" />
              AI 创意与商品详情工作台
            </CardTitle>
            <p className="text-xs text-slate-400">保留原上架优化流程，同时新增对话式社媒创意区、素材保存区和上架额外图片联动。</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </CardHeader>

        <div className="flex gap-2 px-6 py-4 shrink-0 border-b border-white/8">
          <button
            onClick={() => setTab("publish")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all ${tab === "publish" ? "bg-primary text-primary-foreground" : "bg-white/6 text-slate-400 hover:text-white"}`}
          >
            <Rocket className="w-3.5 h-3.5" /> 商品标题及详情优化
          </button>
          <button
            onClick={() => setTab("social")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all ${tab === "social" ? "bg-cyan-400 text-slate-950" : "bg-white/6 text-slate-400 hover:text-white"}`}
          >
            <Share2 className="w-3.5 h-3.5" /> 社媒创意工作台
          </button>
        </div>

        <CardContent className="flex-1 overflow-y-auto pt-5">
          {tab === "publish" ? (
            <PublishWorkflow
              productId={productId}
              productTitle={productTitle}
              productImage={productImage}
              initialExtraImages={publishImages}
              onClose={onClose}
              onPublish={onPublish}
            />
          ) : (
            <SocialWorkflow
              productId={productId}
              productTitle={productTitle}
              productImage={productImage}
              publishExtraImages={publishImages}
              onAddToPublish={handleAddExtraImage}
              onRemoveFromPublish={handleRemoveExtraImage}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
