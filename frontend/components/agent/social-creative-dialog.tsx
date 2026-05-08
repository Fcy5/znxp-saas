"use client"

import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Bot, Copy, Download, Loader2, Save, Sparkles,
  Trash2, Upload, Video, Wand2, X,
} from "lucide-react"
import { agentApi, IMAGE_MODELS, IMAGE_PROMPTS, IMAGE_QUALITIES, IMAGE_SIZES, STATIC_BASE, uploadApi, VIDEO_MODELS } from "@/lib/api"

interface SocialCreativeDialogProps {
  onClose: () => void
}

interface UploadedImage {
  url: string
  name: string
}

interface CreativeAsset {
  id: string
  type: "image" | "video"
  url: string
  prompt: string
  createdAt: string
}

const SOCIAL_IMAGE_LIBRARY_KEY = "znxp-operations-social-creative-library"

const SOCIAL_IMAGE_PRESETS = [
  { label: "白底改款", prompt: "Use the uploaded product image as reference. Keep the core product shape, remove distracting background, make it a premium white-background ecommerce image, clean light, realistic details, no watermark, no text." },
  { label: "种草场景", prompt: "Use the uploaded product image as reference. Turn it into a polished social media lifestyle scene for US buyers, warm lighting, premium home atmosphere, realistic commercial photography, no watermark, no text." },
  { label: "模特展示", prompt: "Use the uploaded product image as reference. Place the product naturally on a stylish model in a realistic lifestyle setting, premium DTC brand look, natural light, no watermark, no text." },
  { label: "广告主图", prompt: "Use the uploaded product image as reference. Create a scroll-stopping paid social ad visual, strong subject focus, clean composition, premium shadows, commercial quality, no watermark, no text." },
]

const SOCIAL_VIDEO_PRESETS = [
  { label: "开箱镜头", prompt: "Create a short ecommerce unboxing style video from this uploaded image. Smooth motion, close-up details, premium reveal, social ad feeling, no text overlay." },
  { label: "场景种草", prompt: "Create a short lifestyle social video from this uploaded image. Natural camera motion, premium home setting, emotional product showcase, polished DTC ad look." },
  { label: "广告节奏", prompt: "Create a punchy paid-social product video from this uploaded image. Dynamic zoom, clean lighting, strong product focus, premium ecommerce style, no text overlay." },
]

function toAssetUrl(url: string) {
  return url.startsWith("http") ? url : `${STATIC_BASE}${url}`
}

function formatTime(iso: string) {
  const date = new Date(iso)
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

export function SocialCreativeDialog({ onClose }: SocialCreativeDialogProps) {
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")

  const [imageModel, setImageModel] = useState(IMAGE_MODELS[0].value)
  const [imagePrompt, setImagePrompt] = useState(SOCIAL_IMAGE_PRESETS[0].prompt)
  const [imageSize, setImageSize] = useState("auto")
  const [imageQuality, setImageQuality] = useState("low")
  const [imageLoading, setImageLoading] = useState(false)
  const [imageError, setImageError] = useState("")
  const [generatedImages, setGeneratedImages] = useState<CreativeAsset[]>([])

  const [videoModel, setVideoModel] = useState(VIDEO_MODELS[0].value)
  const [videoPrompt, setVideoPrompt] = useState(SOCIAL_VIDEO_PRESETS[0].prompt)
  const [videoDuration, setVideoDuration] = useState(5)
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoError, setVideoError] = useState("")
  const [videoTaskId, setVideoTaskId] = useState<number | null>(null)
  const [videoResult, setVideoResult] = useState<CreativeAsset | null>(null)

  const [savedAssets, setSavedAssets] = useState<CreativeAsset[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const raw = localStorage.getItem(SOCIAL_IMAGE_LIBRARY_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })

  const videoPollerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(SOCIAL_IMAGE_LIBRARY_KEY, JSON.stringify(savedAssets.slice(0, 40)))
    }
  }, [savedAssets])

  useEffect(() => {
    return () => {
      if (videoPollerRef.current) clearInterval(videoPollerRef.current)
    }
  }, [])

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError("")
    try {
      const url = await uploadApi.upload(file)
      setUploadedImage({ url, name: file.name })
    } catch (error: unknown) {
      setUploadError(error instanceof Error ? error.message : "上传失败")
    } finally {
      setUploading(false)
      event.target.value = ""
    }
  }

  const handleGenerateImage = async () => {
    setImageLoading(true)
    setImageError("")
    try {
      const result = await agentApi.generateImage(
        imagePrompt,
        imageModel,
        uploadedImage?.url,
        imageSize,
        imageQuality,
      )
      if (result.data?.url) {
        setGeneratedImages((prev) => [{
          id: `image-${Date.now()}`,
          type: "image",
          url: result.data.url,
          prompt: imagePrompt,
          createdAt: new Date().toISOString(),
        }, ...prev])
      }
    } catch (error: unknown) {
      setImageError(error instanceof Error ? error.message : "生成失败")
    } finally {
      setImageLoading(false)
    }
  }

  const handleGenerateVideo = async () => {
    if (!uploadedImage?.url) {
      setVideoError("请先上传一张本地图片")
      return
    }

    setVideoLoading(true)
    setVideoError("")
    setVideoResult(null)
    try {
      const result = await agentApi.videoFromUrl(
        uploadedImage.url,
        uploadedImage.name,
        "",
        videoDuration,
        videoModel,
        videoPrompt,
      )
      const taskId = result.data.id
      setVideoTaskId(taskId)

      if (videoPollerRef.current) clearInterval(videoPollerRef.current)
      videoPollerRef.current = setInterval(async () => {
        try {
          const task = await agentApi.pollTask(taskId)
          if (task.data.status === "success") {
            if (videoPollerRef.current) clearInterval(videoPollerRef.current)
            const url = String(task.data.output_data?.video_url || "")
            setVideoResult({
              id: `video-${taskId}`,
              type: "video",
              url,
              prompt: videoPrompt,
              createdAt: new Date().toISOString(),
            })
            setVideoLoading(false)
          } else if (task.data.status === "failed") {
            if (videoPollerRef.current) clearInterval(videoPollerRef.current)
            setVideoLoading(false)
            setVideoError(task.data.error_message || "视频生成失败")
          }
        } catch {
          if (videoPollerRef.current) clearInterval(videoPollerRef.current)
          setVideoLoading(false)
          setVideoError("视频轮询失败")
        }
      }, 5000)
    } catch (error: unknown) {
      setVideoLoading(false)
      setVideoError(error instanceof Error ? error.message : "启动失败")
    }
  }

  const saveAsset = (asset: CreativeAsset) => {
    setSavedAssets((prev) => prev.some((item) => item.url === asset.url) ? prev : [asset, ...prev])
  }

  const removeSavedAsset = (assetId: string) => {
    setSavedAssets((prev) => prev.filter((item) => item.id !== assetId))
  }

  const copyPrompt = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  const totalAssets = generatedImages.length + (videoResult ? 1 : 0)
  const currentStatus = uploadedImage ? "已上传参考图" : "等待上传本地图片"

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[rgba(4,10,22,0.86)] backdrop-blur-xl p-4" onClick={onClose}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-16 top-16 h-64 w-64 rounded-full bg-cyan-500/14 blur-3xl" />
        <div className="absolute right-12 top-8 h-72 w-72 rounded-full bg-fuchsia-500/12 blur-3xl" />
        <div className="absolute bottom-4 left-1/3 h-80 w-80 rounded-full bg-amber-400/10 blur-3xl" />
      </div>
      <div className="relative mx-auto flex h-full max-w-7xl items-center justify-center">
        <Card
          className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden border-white/10 bg-[linear-gradient(180deg,rgba(6,12,24,0.98),rgba(10,17,31,0.98))] shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
          onClick={(event) => event.stopPropagation()}
        >
          <CardHeader className="flex flex-row items-start justify-between border-b border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_28%),rgba(255,255,255,0.02)] pb-5">
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border border-cyan-400/20 bg-cyan-500/10 text-[10px] text-cyan-200">LOCAL UPLOAD</Badge>
                <Badge className="border border-white/10 bg-white/5 text-[10px] text-slate-300">运营独立入口</Badge>
                <Badge className="border border-emerald-400/20 bg-emerald-500/10 text-[10px] text-emerald-200">{currentStatus}</Badge>
              </div>
              <div className="space-y-2">
                <CardTitle className="flex items-center gap-3 text-xl text-white">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/12 text-cyan-200">
                    <Bot className="h-5 w-5" />
                  </span>
                  运营社媒创意对话框
                </CardTitle>
                <p className="max-w-3xl text-sm leading-6 text-slate-400">
                  不绑商品，不走商品详情。这里专门给运营同学直接上传本地图片，快速做社媒改图、图生视频、保存素材和下载交付。
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Reference</p>
                  <p className="mt-1 text-sm font-semibold text-white">{uploadedImage?.name || "尚未上传"}</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Generated</p>
                  <p className="mt-1 text-sm font-semibold text-white">{totalAssets} 项本轮结果</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Library</p>
                  <p className="mt-1 text-sm font-semibold text-white">{savedAssets.length} 项已保存素材</p>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="rounded-2xl border border-white/10 bg-white/5 p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-6">
            <div className="grid gap-6 xl:grid-cols-[1.28fr_0.72fr]">
              <div className="space-y-6">
                <div className="rounded-[32px] border border-cyan-500/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_36%),rgba(255,255,255,0.04)] p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-200">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="rounded-[24px] rounded-tl-md border border-white/8 bg-black/20 px-4 py-3 text-sm leading-6 text-slate-100">
                        先上传一张本地图片，我会把它当作参考图。接下来你可以在左边决定是生成社媒新图，还是结合提示词做成短视频。
                      </div>
                      {uploadedImage && (
                        <div className="ml-auto max-w-xl rounded-[24px] rounded-tr-md border border-fuchsia-400/12 bg-fuchsia-500/8 px-4 py-3 text-sm leading-6 text-slate-200">
                          已收到素材：<span className="font-medium text-white">{uploadedImage.name}</span>。现在可以继续做改图或生成视频。
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <Card className="overflow-hidden border-fuchsia-500/15 bg-[linear-gradient(180deg,rgba(22,10,32,0.98),rgba(17,12,28,0.92))]">
                  <CardHeader className="border-b border-white/6 pb-4">
                    <div className="flex items-center justify-between gap-4">
                      <CardTitle className="flex items-center gap-2 text-white">
                        <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-2 py-1 text-[10px] font-semibold tracking-[0.22em] text-fuchsia-200">STEP 01</span>
                        上传本地参考图
                      </CardTitle>
                      <Badge className="border border-white/10 bg-white/5 text-[10px] text-slate-300">手动上传素材</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-5">
                    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
                      <label className={`group relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[28px] border border-dashed border-fuchsia-400/30 bg-[radial-gradient(circle_at_top,rgba(232,121,249,0.14),transparent_38%),rgba(255,255,255,0.03)] px-6 py-8 text-center transition-colors hover:border-fuchsia-300 ${uploading ? "pointer-events-none opacity-60" : ""}`}>
                        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-fuchsia-400/10 to-transparent" />
                        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-fuchsia-300/20 bg-fuchsia-400/12 text-fuchsia-200 shadow-[0_0_28px_rgba(217,70,239,0.12)]">
                          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                        </div>
                        <p className="relative mt-5 text-base font-semibold text-white">{uploading ? "图片上传中..." : "拖进来或点击上传本地图片"}</p>
                        <p className="relative mt-2 max-w-sm text-xs leading-6 text-slate-400">
                          支持 JPG / PNG / WEBP。上传后会立刻作为当前社媒参考图，后面的改图和视频都会基于这张图生成。
                        </p>
                        <div className="relative mt-5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
                          运营本地素材入口
                        </div>
                        <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                      </label>

                      <div className="rounded-[28px] border border-white/8 bg-black/20 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Current Reference</p>
                          {uploadedImage && (
                            <Button size="sm" variant="outline" onClick={() => setUploadedImage(null)}>
                              清除
                            </Button>
                          )}
                        </div>
                        {uploadedImage ? (
                          <>
                            <img src={toAssetUrl(uploadedImage.url)} alt="" className="h-44 w-full rounded-2xl object-cover" />
                            <p className="mt-3 truncate text-sm font-medium text-white">{uploadedImage.name}</p>
                            <p className="mt-1 text-xs text-slate-400">已设置为当前社媒参考图</p>
                          </>
                        ) : (
                          <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-white/10 text-center text-xs leading-6 text-slate-500">
                            上传后这里会显示当前参考图
                          </div>
                        )}
                      </div>
                    </div>
                    {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-fuchsia-500/15 bg-[linear-gradient(180deg,rgba(22,10,32,0.98),rgba(17,12,28,0.92))]">
                  <CardHeader className="border-b border-white/6 pb-4">
                    <div className="flex items-center justify-between gap-4">
                      <CardTitle className="flex items-center gap-2 text-white">
                        <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-2 py-1 text-[10px] font-semibold tracking-[0.22em] text-fuchsia-200">STEP 02</span>
                        基于上传图生成新图片
                      </CardTitle>
                      <Badge className="border border-white/10 bg-white/5 text-[10px] text-slate-300">图生图工作区</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-5">
                    <div className="grid grid-cols-2 gap-2">
                      <select value={imageModel} onChange={(event) => setImageModel(event.target.value)} className="rounded-2xl border border-white/10 bg-white/6 px-3 py-2.5 text-xs text-white">
                        {IMAGE_MODELS.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
                      </select>
                      <select value={imageQuality} onChange={(event) => setImageQuality(event.target.value)} className="rounded-2xl border border-white/10 bg-white/6 px-3 py-2.5 text-xs text-white">
                        {IMAGE_QUALITIES.map((quality) => <option key={quality.value} value={quality.value}>{quality.label}</option>)}
                      </select>
                      <select value={imageSize} onChange={(event) => setImageSize(event.target.value)} className="rounded-2xl border border-white/10 bg-white/6 px-3 py-2.5 text-xs text-white">
                        {IMAGE_SIZES.map((size) => <option key={size.value} value={size.value}>{size.label}</option>)}
                      </select>
                      <select value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} className="rounded-2xl border border-white/10 bg-white/6 px-3 py-2.5 text-xs text-white">
                        {SOCIAL_IMAGE_PRESETS.map((preset) => <option key={preset.label} value={preset.prompt}>{preset.label}</option>)}
                        {IMAGE_PROMPTS.map((preset) => <option key={preset.label} value={preset.prompt}>{preset.label}</option>)}
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {SOCIAL_IMAGE_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setImagePrompt(preset.prompt)}
                          className={`rounded-full px-3 py-1.5 text-[11px] transition-colors ${imagePrompt === preset.prompt ? "bg-fuchsia-400 text-slate-950" : "bg-white/6 text-slate-300 hover:bg-white/12 hover:text-white"}`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <textarea
                      value={imagePrompt}
                      onChange={(event) => setImagePrompt(event.target.value)}
                      rows={5}
                      className="w-full rounded-[28px] border border-white/10 bg-black/20 px-4 py-4 text-xs leading-6 text-white placeholder:text-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-fuchsia-400"
                      placeholder="描述你要的新图片风格..."
                    />

                    <div className="flex gap-2">
                      <Button className="flex-1 gap-2 bg-fuchsia-500 text-white hover:bg-fuchsia-400" onClick={handleGenerateImage} disabled={imageLoading}>
                        {imageLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {imageLoading ? "正在重绘社媒图片..." : "生成新图片"}
                      </Button>
                      <Button variant="outline" className="border-white/10 bg-white/5 text-slate-200 hover:bg-white/10" onClick={() => void copyPrompt(imagePrompt)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    {imageError && <p className="text-xs text-red-400">{imageError}</p>}
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-amber-500/15 bg-[linear-gradient(180deg,rgba(34,22,8,0.98),rgba(27,18,10,0.92))]">
                  <CardHeader className="border-b border-white/6 pb-4">
                    <div className="flex items-center justify-between gap-4">
                      <CardTitle className="flex items-center gap-2 text-white">
                        <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-[10px] font-semibold tracking-[0.22em] text-amber-200">STEP 03</span>
                        上传图 + 文字生成视频
                      </CardTitle>
                      <Badge className="border border-white/10 bg-white/5 text-[10px] text-slate-300">图生视频工作区</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-5">
                    <div className="grid grid-cols-2 gap-2">
                      <select value={videoModel} onChange={(event) => setVideoModel(event.target.value)} className="rounded-2xl border border-white/10 bg-white/6 px-3 py-2.5 text-xs text-white">
                        {VIDEO_MODELS.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
                      </select>
                      <select value={videoPrompt} onChange={(event) => setVideoPrompt(event.target.value)} className="rounded-2xl border border-white/10 bg-white/6 px-3 py-2.5 text-xs text-white">
                        {SOCIAL_VIDEO_PRESETS.map((preset) => <option key={preset.label} value={preset.prompt}>{preset.label}</option>)}
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {SOCIAL_VIDEO_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setVideoPrompt(preset.prompt)}
                          className={`rounded-full px-3 py-1.5 text-[11px] transition-colors ${videoPrompt === preset.prompt ? "bg-amber-300 text-slate-950" : "bg-white/6 text-slate-300 hover:bg-white/12 hover:text-white"}`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <textarea
                      value={videoPrompt}
                      onChange={(event) => setVideoPrompt(event.target.value)}
                      rows={5}
                      className="w-full rounded-[28px] border border-white/10 bg-black/20 px-4 py-4 text-xs leading-6 text-white placeholder:text-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300"
                      placeholder="描述镜头运动、风格、节奏和场景..."
                    />

                    <div className="flex items-center gap-3">
                      <span className="text-xs uppercase tracking-[0.22em] text-slate-500">Duration</span>
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

                    <div className="flex gap-2">
                      <Button className="flex-1 gap-2 bg-amber-400 text-slate-950 hover:bg-amber-300" onClick={handleGenerateVideo} disabled={videoLoading}>
                        {videoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                        {videoLoading ? `视频任务进行中 #${videoTaskId ?? ""}` : "生成视频"}
                      </Button>
                      <Button variant="outline" className="border-white/10 bg-white/5 text-slate-200 hover:bg-white/10" onClick={() => void copyPrompt(videoPrompt)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    {videoError && <p className="text-xs text-red-400">{videoError}</p>}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-5 xl:sticky xl:top-0 xl:self-start">
                <Card className="overflow-hidden border-white/8 bg-[linear-gradient(180deg,rgba(11,17,31,0.96),rgba(8,13,23,0.94))]">
                  <CardHeader className="border-b border-white/6 pb-4">
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Upload className="h-4 w-4 text-fuchsia-300" />
                      素材总览面板
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-5">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-2xl border border-white/8 bg-black/20 p-3 text-center">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Image</p>
                        <p className="mt-1 text-lg font-semibold text-white">{generatedImages.length}</p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-black/20 p-3 text-center">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Video</p>
                        <p className="mt-1 text-lg font-semibold text-white">{videoResult ? 1 : 0}</p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-black/20 p-3 text-center">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Saved</p>
                        <p className="mt-1 text-lg font-semibold text-white">{savedAssets.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-white/8 bg-black/20">
                  <CardHeader className="border-b border-white/6 pb-4">
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Wand2 className="h-4 w-4 text-cyan-300" />
                      本轮图片结果
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-5">
                    {generatedImages.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-xs leading-6 text-slate-500">
                        生成后的图片会出现在这里。
                      </div>
                    ) : (
                      generatedImages.map((asset) => (
                        <div key={asset.id} className="rounded-[26px] border border-white/8 bg-white/5 p-3">
                          <img src={toAssetUrl(asset.url)} alt="" className="h-40 w-full rounded-2xl object-cover" />
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-slate-400">{formatTime(asset.createdAt)}</span>
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => saveAsset(asset)}>
                                  <Save className="h-3.5 w-3.5" />
                                </Button>
                                <a href={toAssetUrl(asset.url)} download className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground">
                                  <Download className="h-3.5 w-3.5" />
                                </a>
                                <Button size="sm" variant="outline" onClick={() => setGeneratedImages((prev) => prev.filter((item) => item.id !== asset.id))}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            <p className="line-clamp-3 text-xs leading-6 text-slate-200">{asset.prompt}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-white/8 bg-black/20">
                  <CardHeader className="border-b border-white/6 pb-4">
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Video className="h-4 w-4 text-amber-300" />
                      最新视频结果
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-5">
                    {!videoResult ? (
                      <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-xs leading-6 text-slate-500">
                        视频生成完成后会显示在这里。
                      </div>
                    ) : (
                      <div className="rounded-[26px] border border-white/8 bg-white/5 p-3">
                        <video src={toAssetUrl(videoResult.url)} controls className="h-56 w-full rounded-2xl bg-black object-cover" />
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="line-clamp-3 text-xs leading-6 text-slate-200">{videoResult.prompt}</p>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => saveAsset(videoResult)}>
                              <Save className="h-3.5 w-3.5" />
                            </Button>
                            <a href={toAssetUrl(videoResult.url)} download className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground">
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-white/8 bg-black/20">
                  <CardHeader className="border-b border-white/6 pb-4">
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Save className="h-4 w-4 text-emerald-300" />
                      已保存素材
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-5">
                    {savedAssets.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-xs leading-6 text-slate-500">
                        你保存的图片和视频会留在这里。
                      </div>
                    ) : (
                      savedAssets.map((asset) => (
                        <div key={asset.id} className="rounded-[26px] border border-white/8 bg-white/5 p-3">
                          {asset.type === "image" ? (
                            <img src={toAssetUrl(asset.url)} alt="" className="h-28 w-full rounded-2xl object-cover" />
                          ) : (
                            <video src={toAssetUrl(asset.url)} controls className="h-28 w-full rounded-2xl bg-black object-cover" />
                          )}
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-medium text-white">{asset.type === "image" ? "图片素材" : "视频素材"}</p>
                              <p className="text-[11px] text-slate-400">{formatTime(asset.createdAt)}</p>
                            </div>
                            <div className="flex gap-2">
                              <a href={toAssetUrl(asset.url)} download className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground">
                                <Download className="h-3.5 w-3.5" />
                              </a>
                              <Button size="sm" variant="outline" onClick={() => removeSavedAsset(asset.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
