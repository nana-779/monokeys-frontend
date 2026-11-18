'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
} from 'react'
import { MinusIcon, PlusIcon } from '@/components/icons'
import { useCart } from '@/features/cart/cart-provider'
import {
  getWishlistStatus,
  toggleWishlistItem,
  uploadCustomKeycapImages,
} from '@/features/products/custom-keycap-api'
import { formatPrice, isProductSoldOut, type StoreProduct } from '@/lib/store-shared'

interface CustomKeycapEditorViewProps {
  product: StoreProduct
}

interface KeycapSpecMeta {
  keyType: string
  keySize: '1u' | '2.25u' | '6.25u'
  dimensions: string
  canvasWidth: number
  canvasHeight: number
  safeInsetX: number
  safeInsetY: number
}

interface ImageLayerState {
  src: string
  element: HTMLImageElement
  x: number
  y: number
  scale: number
  rotation: number
  flipX: boolean
  flipY: boolean
}

interface TextLayerState {
  text: string
  fontFamily: string
  color: string
  fontSize: number
  x: number
  y: number
  rotation: number
  flipX: boolean
  flipY: boolean
}

type ActiveTool = 'image' | 'text'
type SelectedLayer = 'image' | 'text'
type InfoTab = 'story' | 'info' | 'guide' | 'review'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function resolveKeycapMeta(productName: string): KeycapSpecMeta {
  if (productName.includes('Space Bar')) {
    return {
      keyType: 'Space Bar',
      keySize: '6.25u',
      dimensions: '11.8 × 1.78 × 1.16cm',
      canvasWidth: 680,
      canvasHeight: 220,
      safeInsetX: 52,
      safeInsetY: 42,
    }
  }
  if (productName.includes('Enter')) {
    return {
      keyType: 'Enter',
      keySize: '2.25u',
      dimensions: '4.1 × 1.78 × 1.05cm',
      canvasWidth: 560,
      canvasHeight: 270,
      safeInsetX: 54,
      safeInsetY: 44,
    }
  }
  if (productName.includes('Left Shift')) {
    return {
      keyType: 'Left Shift',
      keySize: '2.25u',
      dimensions: '4.1 × 1.78 × 1.16cm',
      canvasWidth: 560,
      canvasHeight: 270,
      safeInsetX: 54,
      safeInsetY: 44,
    }
  }
  const rowMatch = productName.match(/R[1-4]/)
  const row = rowMatch ? rowMatch[0] : 'R4'
  return {
    keyType: row,
    keySize: '1u',
    dimensions: row === 'R4' ? '1.78 × 1.78 × 1.16cm' : '1.78 × 1.78 × 1.05cm',
    canvasWidth: 420,
    canvasHeight: 420,
    safeInsetX: 56,
    safeInsetY: 56,
  }
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

export function CustomKeycapEditorView({ product }: CustomKeycapEditorViewProps) {
  const { addItem } = useCart()
  const meta = useMemo(() => resolveKeycapMeta(product.name), [product.name])
  const isSoldOut = isProductSoldOut(product)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dragStateRef = useRef<{
    layer: SelectedLayer
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const [activeTool, setActiveTool] = useState<ActiveTool>('image')
  const [selectedLayer, setSelectedLayer] = useState<SelectedLayer>('image')
  const [layerOrder, setLayerOrder] = useState<SelectedLayer[]>(['image', 'text'])
  const [showGuides, setShowGuides] = useState(true)
  const [activeTab, setActiveTab] = useState<InfoTab>('story')

  const [imageLayer, setImageLayer] = useState<ImageLayerState | null>(null)
  const [textLayer, setTextLayer] = useState<TextLayerState>({
    text: '',
    fontFamily: 'Pretendard, sans-serif',
    color: '#111827',
    fontSize: 30,
    x: 0.5,
    y: 0.5,
    rotation: 0,
    flipX: false,
    flipY: false,
  })

  const [quantity, setQuantity] = useState(1)
  const [wishlisted, setWishlisted] = useState(false)
  const [wishlistBusy, setWishlistBusy] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    getWishlistStatus(product.id)
      .then((status) => {
        if (!ignore) setWishlisted(status)
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [product.id])

  useEffect(() => {
    return () => {
      if (imageLayer?.src.startsWith('blob:')) {
        URL.revokeObjectURL(imageLayer.src)
      }
    }
  }, [imageLayer])

  const renderCanvas = useCallback(
    (targetCanvas: HTMLCanvasElement, includeGuides: boolean) => {
      const ctx = targetCanvas.getContext('2d')
      if (!ctx) return

      const w = targetCanvas.width
      const h = targetCanvas.height
      const bleedPad = 24
      const bodyW = w - bleedPad * 2
      const bodyH = h - bleedPad * 2

      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#f4f4f5'
      ctx.fillRect(0, 0, w, h)

      // 1) 화이트 PBT 키캡 베이스 외곽 + 입체 음영
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.14)'
      ctx.shadowBlur = 18
      ctx.shadowOffsetY = 8
      ctx.fillStyle = '#ffffff'
      drawRoundedRectPath(ctx, bleedPad, bleedPad, bodyW, bodyH, 18)
      ctx.fill()
      ctx.restore()

      // 2) 키캡 내부 클리핑 영역에 이미지/텍스트 레이어 순서대로 렌더
      ctx.save()
      drawRoundedRectPath(ctx, bleedPad, bleedPad, bodyW, bodyH, 18)
      ctx.clip()

      for (const layerType of layerOrder) {
        if (layerType === 'image' && imageLayer) {
          const img = imageLayer.element
          const fitScale = Math.min(bodyW / img.width, bodyH / img.height)
          const drawW = img.width * fitScale * imageLayer.scale
          const drawH = img.height * fitScale * imageLayer.scale

          ctx.save()
          ctx.translate(bleedPad + bodyW * imageLayer.x, bleedPad + bodyH * imageLayer.y)
          ctx.rotate((imageLayer.rotation * Math.PI) / 180)
          ctx.scale(imageLayer.flipX ? -1 : 1, imageLayer.flipY ? -1 : 1)
          ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)
          ctx.restore()
        }

        if (layerType === 'text' && textLayer.text.trim()) {
          ctx.save()
          ctx.translate(bleedPad + bodyW * textLayer.x, bleedPad + bodyH * textLayer.y)
          ctx.rotate((textLayer.rotation * Math.PI) / 180)
          ctx.scale(textLayer.flipX ? -1 : 1, textLayer.flipY ? -1 : 1)
          ctx.font = `700 ${textLayer.fontSize}px ${textLayer.fontFamily}`
          ctx.fillStyle = textLayer.color
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(textLayer.text, 0, 0)
          ctx.restore()
        }
      }

      // 윗면 경사 입체감 테두리
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)'
      ctx.lineWidth = 2
      drawRoundedRectPath(
        ctx,
        bleedPad + meta.safeInsetX - 10,
        bleedPad + meta.safeInsetY - 10,
        bodyW - (meta.safeInsetX - 10) * 2,
        bodyH - (meta.safeInsetY - 10) * 2,
        12,
      )
      ctx.stroke()
      ctx.restore()

      // 3) 편집용 가이드선 (검정 블리드선 + 초록 안전영역)
      if (includeGuides) {
        ctx.save()
        ctx.setLineDash([6, 4])
        ctx.strokeStyle = '#18181b'
        ctx.lineWidth = 1.5
        drawRoundedRectPath(ctx, bleedPad + 2, bleedPad + 2, bodyW - 4, bodyH - 4, 16)
        ctx.stroke()

        ctx.strokeStyle = '#16a34a'
        ctx.lineWidth = 1.5
        drawRoundedRectPath(
          ctx,
          bleedPad + meta.safeInsetX,
          bleedPad + meta.safeInsetY,
          bodyW - meta.safeInsetX * 2,
          bodyH - meta.safeInsetY * 2,
          10,
        )
        ctx.stroke()
        ctx.restore()
      }
    },
    [imageLayer, layerOrder, meta, textLayer],
  )

  useEffect(() => {
    if (canvasRef.current) {
      renderCanvas(canvasRef.current, showGuides)
    }
  }, [renderCanvas, showGuides])

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setUploadNotice('JPG, PNG, WEBP 이미지 파일만 업로드할 수 있습니다.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadNotice('이미지 용량은 10MB 이하만 업로드할 수 있습니다.')
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      if (imageLayer?.src.startsWith('blob:')) {
        URL.revokeObjectURL(imageLayer.src)
      }
      setImageLayer({
        src: objectUrl,
        element: img,
        x: 0.5,
        y: 0.5,
        scale: 0.85,
        rotation: 0,
        flipX: false,
        flipY: false,
      })
      setSelectedLayer('image')
      setActiveTool('image')
      setUploadNotice(null)
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      setUploadNotice('이미지를 불러오지 못했습니다. 다른 파일로 시도해 주세요.')
    }
    img.src = objectUrl
  }

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const target: SelectedLayer =
      selectedLayer === 'text' && textLayer.text.trim()
        ? 'text'
        : imageLayer
          ? 'image'
          : 'text'
    if (target === 'image' && !imageLayer) return
    if (target === 'text' && !textLayer.text.trim()) return

    canvas.setPointerCapture(e.pointerId)
    dragStateRef.current = {
      layer: target,
      startX: e.clientX,
      startY: e.clientY,
      originX: target === 'image' ? imageLayer!.x : textLayer.x,
      originY: target === 'image' ? imageLayer!.y : textLayer.y,
    }
  }

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current
    const canvas = canvasRef.current
    if (!drag || !canvas) return

    const rect = canvas.getBoundingClientRect()
    const dx = (e.clientX - drag.startX) / Math.max(1, rect.width - 48)
    const dy = (e.clientY - drag.startY) / Math.max(1, rect.height - 48)
    const nextX = Math.min(1.15, Math.max(-0.15, drag.originX + dx))
    const nextY = Math.min(1.15, Math.max(-0.15, drag.originY + dy))

    if (drag.layer === 'image') {
      setImageLayer((prev) => (prev ? { ...prev, x: nextX, y: nextY } : prev))
    } else {
      setTextLayer((prev) => ({ ...prev, x: nextX, y: nextY }))
    }
  }

  const handlePointerUp = () => {
    dragStateRef.current = null
  }

  const alignSelected = (axis: 'center' | 'left' | 'right' | 'top' | 'bottom') => {
    const apply = (x: number, y: number) => {
      if (axis === 'center') return { x: 0.5, y: 0.5 }
      if (axis === 'left') return { x: 0.25, y }
      if (axis === 'right') return { x: 0.75, y }
      if (axis === 'top') return { x, y: 0.28 }
      return { x, y: 0.72 }
    }
    if (selectedLayer === 'image' && imageLayer) {
      const next = apply(imageLayer.x, imageLayer.y)
      setImageLayer({ ...imageLayer, ...next })
    } else if (selectedLayer === 'text') {
      const next = apply(textLayer.x, textLayer.y)
      setTextLayer({ ...textLayer, ...next })
    }
  }

  const flipSelected = (axis: 'x' | 'y') => {
    if (selectedLayer === 'image' && imageLayer) {
      setImageLayer({
        ...imageLayer,
        flipX: axis === 'x' ? !imageLayer.flipX : imageLayer.flipX,
        flipY: axis === 'y' ? !imageLayer.flipY : imageLayer.flipY,
      })
    } else if (selectedLayer === 'text') {
      setTextLayer({
        ...textLayer,
        flipX: axis === 'x' ? !textLayer.flipX : textLayer.flipX,
        flipY: axis === 'y' ? !textLayer.flipY : textLayer.flipY,
      })
    }
  }

  const bringSelectedToFront = () => {
    setLayerOrder(selectedLayer === 'image' ? ['text', 'image'] : ['image', 'text'])
  }

  const deleteSelected = () => {
    if (selectedLayer === 'image' && imageLayer) {
      if (imageLayer.src.startsWith('blob:')) URL.revokeObjectURL(imageLayer.src)
      setImageLayer(null)
    } else if (selectedLayer === 'text') {
      setTextLayer((prev) => ({ ...prev, text: '' }))
    }
  }

  const resetAllDesign = () => {
    if (imageLayer?.src.startsWith('blob:')) URL.revokeObjectURL(imageLayer.src)
    setImageLayer(null)
    setTextLayer({
      text: '',
      fontFamily: 'Pretendard, sans-serif',
      color: '#111827',
      fontSize: 30,
      x: 0.5,
      y: 0.5,
      rotation: 0,
      flipX: false,
      flipY: false,
    })
    setUploadNotice(null)
  }

  const handleToggleWishlist = async () => {
    if (wishlistBusy) return
    setWishlistBusy(true)
    try {
      const res = await toggleWishlistItem(product.id)
      if (res.unauthorized) {
        alert('위시리스트 저장은 로그인 후 이용할 수 있습니다.')
        return
      }
      setWishlisted(res.wishlisted)
    } catch (err) {
      alert(err instanceof Error ? err.message : '위시리스트를 변경하지 못했습니다.')
    } finally {
      setWishlistBusy(false)
    }
  }

  const exportCanvasBlob = (includeGuides: boolean): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const offscreen = document.createElement('canvas')
      offscreen.width = meta.canvasWidth
      offscreen.height = meta.canvasHeight
      renderCanvas(offscreen, includeGuides)
      offscreen.toBlob((blob) => {
        if (!blob) {
          reject(new Error('디자인 이미지를 생성하지 못했습니다.'))
          return
        }
        resolve(blob)
      }, 'image/png')
    })
  }

  const handleAddCustomKeycapToCart = async () => {
    if (isSoldOut) {
      alert('현재 품절되어 장바구니에 담을 수 없습니다.')
      return
    }
    if (!imageLayer && !textLayer.text.trim()) {
      alert('이미지 업로드 또는 텍스트를 입력해 나만의 키캡을 디자인해 주세요.')
      return
    }

    setSubmitting(true)
    try {
      const printBlob = await exportCanvasBlob(false)
      const previewBlob = await exportCanvasBlob(false)
      const uploaded = await uploadCustomKeycapImages(printBlob, previewBlob)

      const designPayload = {
        keyType: meta.keyType,
        keySize: meta.keySize,
        baseColor: 'WHITE',
        dimensions: meta.dimensions,
        previewImageUrl: uploaded.previewImageUrl,
        printImageUrl: uploaded.imageUrl,
        customText: textLayer.text.trim() || null,
        fontFamily: textLayer.text.trim() ? textLayer.fontFamily : null,
        textColor: textLayer.text.trim() ? textLayer.color : null,
      }

      addItem({
        productId: String(product.id),
        slug: product.slug,
        name: `[커스텀] ${product.name}`,
        image: uploaded.previewImageUrl,
        optionLabel: `${meta.keyType} · ${meta.keySize}`,
        unitPrice: product.basePrice,
        shippingFee: product.shippingFee || 3000,
        quantity,
        customDesignData: JSON.stringify(designPayload),
      })

      alert('나만의 커스텀 키캡 디자인이 장바구니에 담겼습니다.')
    } catch (err) {
      alert(err instanceof Error ? err.message : '커스텀 키캡을 장바구니에 담지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-16">
      {/* 상단: 좌측 에디터 캔버스 + 우측 상품 패널 */}
      <div className="grid grid-cols-[1.35fr_.65fr] gap-10 max-lg:grid-cols-1">
        {/* 좌측: 마플 스타일 키캡 에디터 */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
          {/* 상단 툴바 */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                className="rounded-md border border-zinc-200 px-2.5 py-1.5 font-medium hover:bg-zinc-50"
                onClick={resetAllDesign}
                type="button"
              >
                처음으로
              </button>
              <button
                className="rounded-md border border-zinc-200 px-2.5 py-1.5 font-medium hover:bg-zinc-50"
                onClick={bringSelectedToFront}
                type="button"
              >
                앞으로
              </button>
              <button
                className="rounded-md border border-zinc-200 px-2.5 py-1.5 font-medium hover:bg-zinc-50"
                onClick={() => flipSelected('x')}
                type="button"
              >
                좌우반전
              </button>
              <button
                className="rounded-md border border-zinc-200 px-2.5 py-1.5 font-medium hover:bg-zinc-50"
                onClick={() => flipSelected('y')}
                type="button"
              >
                상하반전
              </button>
              <button
                className="rounded-md border border-zinc-200 px-2.5 py-1.5 font-medium hover:bg-zinc-50"
                onClick={() => alignSelected('center')}
                type="button"
              >
                정중앙
              </button>
              <button
                className="rounded-md border border-zinc-200 px-2.5 py-1.5 font-medium text-red-600 hover:bg-red-50"
                onClick={deleteSelected}
                type="button"
              >
                선택 삭제
              </button>
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-600">
              <input
                checked={showGuides}
                onChange={(e) => setShowGuides(e.target.checked)}
                type="checkbox"
              />
              가이드선 표시
            </label>
          </div>

          {/* 캔버스 + 우측 도구 레일 */}
          <div className="grid grid-cols-[1fr_220px] gap-5 max-md:grid-cols-1">
            <div>
              <div className="flex min-h-[380px] items-center justify-center rounded-xl bg-zinc-100 p-6">
                <canvas
                  className="max-h-[360px] max-w-full cursor-grab touch-none rounded-lg active:cursor-grabbing"
                  height={meta.canvasHeight}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  ref={canvasRef}
                  width={meta.canvasWidth}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-xs border border-dashed border-green-600" />
                    초록 점선: 윗면 안전 영역
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-xs border border-dashed border-zinc-900" />
                    검정 점선: 5면 전체 인쇄 영역
                  </span>
                </div>
                <span>드래그하여 위치 이동 가능</span>
              </div>
            </div>

            {/* 우측 도구 패널: 이미지 업로드 & 텍스트 중심 */}
            <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4">
              <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-zinc-200/70 p-1 text-xs font-semibold">
                <button
                  className={`rounded-md py-2 transition ${
                    activeTool === 'image' ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-600'
                  }`}
                  onClick={() => {
                    setActiveTool('image')
                    setSelectedLayer('image')
                  }}
                  type="button"
                >
                  이미지 업로드
                </button>
                <button
                  className={`rounded-md py-2 transition ${
                    activeTool === 'text' ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-600'
                  }`}
                  onClick={() => {
                    setActiveTool('text')
                    setSelectedLayer('text')
                  }}
                  type="button"
                >
                  텍스트
                </button>
              </div>

              {activeTool === 'image' ? (
                <div className="space-y-3">
                  <input
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                    ref={fileInputRef}
                    type="file"
                  />
                  <button
                    className="w-full rounded-lg bg-zinc-950 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-zinc-800"
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    {imageLayer ? '다른 이미지로 변경' : '+ 내 PC 이미지 업로드'}
                  </button>
                  <p className="text-[11px] leading-4 text-zinc-500">
                    JPG, PNG, WEBP (10MB 이하 / 배경 투명 PNG 권장)
                  </p>
                  {uploadNotice && <p className="text-xs font-medium text-red-600">{uploadNotice}</p>}

                  {imageLayer && (
                    <div className="space-y-2.5 border-t border-zinc-200 pt-3 text-xs">
                      <label className="block">
                        <span className="mb-1 flex justify-between text-zinc-600">
                          <span>크기</span>
                          <span>{Math.round(imageLayer.scale * 100)}%</span>
                        </span>
                        <input
                          className="w-full"
                          max={2.4}
                          min={0.25}
                          onChange={(e) =>
                            setImageLayer({ ...imageLayer, scale: Number(e.target.value) })
                          }
                          step={0.05}
                          type="range"
                          value={imageLayer.scale}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 flex justify-between text-zinc-600">
                          <span>회전</span>
                          <span>{imageLayer.rotation}°</span>
                        </span>
                        <input
                          className="w-full"
                          max={180}
                          min={-180}
                          onChange={(e) =>
                            setImageLayer({ ...imageLayer, rotation: Number(e.target.value) })
                          }
                          step={5}
                          type="range"
                          value={imageLayer.rotation}
                        />
                      </label>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  <label className="block">
                    <span className="mb-1 block font-medium text-zinc-700">문구 입력</span>
                    <input
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
                      maxLength={30}
                      onChange={(e) => {
                        setSelectedLayer('text')
                        setTextLayer({ ...textLayer, text: e.target.value })
                      }}
                      placeholder="예: ESC, MY KEY"
                      type="text"
                      value={textLayer.text}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-medium text-zinc-700">폰트</span>
                    <select
                      className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-2 outline-none"
                      onChange={(e) => setTextLayer({ ...textLayer, fontFamily: e.target.value })}
                      value={textLayer.fontFamily}
                    >
                      <option value="Pretendard, sans-serif">기본 고딕 (Sans)</option>
                      <option value="Georgia, serif">클래식 명조 (Serif)</option>
                      <option value="monospace">개발자 모노 (Mono)</option>
                    </select>
                  </label>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-700">글자 색상</span>
                    <input
                      className="h-8 w-12 cursor-pointer rounded border border-zinc-300 bg-white p-0.5"
                      onChange={(e) => setTextLayer({ ...textLayer, color: e.target.value })}
                      type="color"
                      value={textLayer.color}
                    />
                  </div>
                  <label className="block">
                    <span className="mb-1 flex justify-between text-zinc-600">
                      <span>글자 크기</span>
                      <span>{textLayer.fontSize}px</span>
                    </span>
                    <input
                      className="w-full"
                      max={72}
                      min={14}
                      onChange={(e) =>
                        setTextLayer({ ...textLayer, fontSize: Number(e.target.value) })
                      }
                      type="range"
                      value={textLayer.fontSize}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 flex justify-between text-zinc-600">
                      <span>회전</span>
                      <span>{textLayer.rotation}°</span>
                    </span>
                    <input
                      className="w-full"
                      max={180}
                      min={-180}
                      onChange={(e) =>
                        setTextLayer({ ...textLayer, rotation: Number(e.target.value) })
                      }
                      step={5}
                      type="range"
                      value={textLayer.rotation}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 우측: 상품 구매 & 위시리스트 패널 */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                {product.brand} · CUSTOM STUDIO
              </p>
              <h1 className="mt-2 text-3xl font-medium tracking-[-0.04em] text-zinc-950">
                {product.name}
              </h1>
            </div>
            <button
              aria-label={wishlisted ? '위시리스트에서 제거' : '위시리스트에 추가'}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition ${
                wishlisted
                  ? 'border-red-200 bg-red-50 text-red-600'
                  : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-900'
              }`}
              disabled={wishlistBusy}
              onClick={handleToggleWishlist}
              type="button"
            >
              <svg
                className="h-5 w-5"
                fill={wishlisted ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
              >
                <path
                  d="M12 20.5s-7-4.55-9.2-8.7C1.15 8.7 2.85 4.8 6.8 4.5c2.2-.16 4.05.95 5.2 2.65C13.15 5.45 15 4.34 17.2 4.5c3.95.3 5.65 4.2 4 7.3C19 15.95 12 20.5 12 20.5z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-sm text-zinc-500">1개당</span>
            <p className="text-3xl font-semibold tracking-tight text-zinc-950">
              {formatPrice(product.basePrice)}
            </p>
          </div>

          <div className="mt-6 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">규격 / 사이즈</span>
              <span className="font-medium text-zinc-900">
                {meta.keySize} ({meta.dimensions})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">소재 / 베이스 색상</span>
              <span className="font-medium text-zinc-900">PBT / 화이트</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">인쇄 방식</span>
              <span className="font-medium text-zinc-900">5면 풀 컬러 승화전사</span>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-200 pt-3">
              <span className="text-zinc-500">배송비</span>
              <span className="font-medium text-zinc-900">3,000원</span>
            </div>
          </div>

          {/* 수량 선택 */}
          <div className="mt-6 flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-zinc-800">수량</span>
              <p className="text-xs text-zinc-400">1개부터 주문 가능</p>
            </div>
            <div className="flex h-11 items-center rounded-md border border-zinc-200 bg-white">
              <button
                aria-label="수량 감소"
                className="h-full px-3 text-zinc-600 hover:text-zinc-950 disabled:opacity-40"
                disabled={quantity <= 1 || isSoldOut}
                onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                type="button"
              >
                <MinusIcon />
              </button>
              <span className="w-10 text-center text-sm font-medium">{quantity}</span>
              <button
                aria-label="수량 증가"
                className="h-full px-3 text-zinc-600 hover:text-zinc-950 disabled:opacity-40"
                disabled={quantity >= product.stockQuantity || isSoldOut}
                onClick={() => setQuantity((prev) => Math.min(product.stockQuantity, prev + 1))}
                type="button"
              >
                <PlusIcon />
              </button>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-zinc-200 pt-4 text-sm">
            <span className="text-zinc-500">총 상품 금액 ({quantity}개)</span>
            <span className="text-xl font-semibold text-zinc-950">
              {formatPrice(product.basePrice * quantity)}
            </span>
          </div>

          <button
            className="mt-4 h-14 w-full rounded-md bg-zinc-950 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            disabled={isSoldOut || submitting}
            onClick={handleAddCustomKeycapToCart}
            type="button"
          >
            {isSoldOut
              ? '품절'
              : submitting
                ? '이미지 저장 중...'
                : `장바구니 담기 — ${formatPrice(product.basePrice * quantity)}`}
          </button>
        </div>
      </div>

      {/* 하단 탭: 스토리 / 상품 정보 / 제작 가이드 / 리뷰 */}
      <div className="border-t border-zinc-200 pt-10">
        <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-4">
          {[
            { id: 'story' as const, label: '스토리' },
            { id: 'info' as const, label: '상품 정보' },
            { id: 'guide' as const, label: '제작 가이드' },
            { id: 'review' as const, label: '리뷰' },
          ].map((tab) => (
            <button
              className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-zinc-950 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-8 text-sm leading-7 text-zinc-700">
          {activeTab === 'story' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-zinc-950">
                원하는 이미지와 문구로 완성하는 5면 풀 컬러 키캡
              </h2>
              <p>{product.description}</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>고온·고압 승화전사 방식으로 상단과 4면 측면에 색이 스며들어 각인이 지워지지 않습니다.</li>
                <li>표준 기계식 십자(+) 스템(Cherry, Gateron, Kailh 등)과 완벽히 호환됩니다.</li>
                <li>불투명 화이트 PBT 소재 특성상 백라이트 LED 투과는 지원하지 않습니다.</li>
              </ul>
            </div>
          )}

          {activeTab === 'info' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-zinc-950">상품 정보 및 주의사항</h2>
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-zinc-50 p-4 max-sm:grid-cols-1">
                <div>소재: 무광 PBT</div>
                <div>기본 색상: 화이트</div>
                <div>프로파일: OEM Profile ({meta.keyType})</div>
                <div>크기: {meta.dimensions}</div>
              </div>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>표현 가능한 최소 선 두께는 0.2mm 이상을 권장합니다.</li>
                <li>OEM 프로파일 특성상 체리/SA 프로파일 키캡 옆에 섞어 꽂으면 높이 차이가 날 수 있습니다.</li>
                <li>RGB 웹 화면과 실제 CMYK 승화전사 인쇄 발색 사이에 미세한 색감 차이가 있을 수 있습니다.</li>
                <li>측면 경사부에는 인쇄 필름이 늘어나며 흐려짐이 발생할 수 있으며 0.5mm 수준의 위치 오차가 생길 수 있습니다.</li>
              </ul>
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-zinc-950">제작 가이드</h2>
              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <div className="rounded-xl border border-green-200 bg-green-50/50 p-5">
                  <p className="font-semibold text-green-800">1. 중요 요소 위치 (초록 점선 안쪽)</p>
                  <p className="mt-1 text-zinc-600">
                    핵심 텍스트, 로고, 인물 얼굴처럼 잘리면 안 되는 요소는 반드시 초록 점선 안전 영역 안에 배치하세요.
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-5">
                  <p className="font-semibold text-zinc-900">2. 전면 인쇄 (검정 점선 바깥까지)</p>
                  <p className="mt-1 text-zinc-600">
                    배경 색이나 패턴을 모서리 여백 없이 꽉 채우고 싶다면 검정 점선 끝까지 넉넉히 채워주세요.
                  </p>
                </div>
              </div>
              <p className="text-xs text-zinc-500">
                주문 제작 상품은 공정 특성상 제작 시작 이후 단순 변심 교환·환불이 어려우며, 제품 불량은 수령 후 7일 이내 접수 시 재제작해 드립니다.
              </p>
            </div>
          )}

          {activeTab === 'review' && (
            <div className="py-6 text-center text-zinc-500">
              실구매 리뷰 기능(3차)이 연결되면 구매 고객의 포토 리뷰와 평점이 이곳에 표시됩니다.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
