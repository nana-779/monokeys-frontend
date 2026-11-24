'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent,
} from 'react'
import Link from 'next/link'
import { MinusIcon, PlusIcon } from '@/components/icons'
import { useCart } from '@/features/cart/cart-provider'
import {
  deleteCustomKeycapImage,
  uploadCustomKeycapImages,
} from '@/features/products/custom-keycap-api'
import { KeyboardMountPreview } from '@/features/products/custom-keycap-preview'
import { ApiRequestError, apiRequest } from '@/lib/api-client'
import {
  ALLOWED_MIME_TYPES,
  BACKGROUND_PRESETS,
  BLEED_PAD,
  clampFontSize,
  clampImageScale,
  compressImageForDraft,
  createTextLayer,
  drawRoundedRectPath,
  findCornerAt,
  FONT_OPTIONS,
  getDraftStorageKey,
  getRotatedBoxCorners,
  getRotationHandlePoint,
  isDarkHex,
  isPointInsideBox,
  isPointOnRotateHandle,
  KEYCAP_VARIANT_LINKS,
  MAX_FONT_SIZE,
  MAX_IMAGE_SCALE,
  MAX_TEXT_LAYERS,
  MAX_UPLOAD_BYTES,
  MIN_FONT_SIZE,
  MIN_IMAGE_SCALE,
  resolveKeycapMeta,
  snapNormalizedPoint,
  snapRotationAngle,
  type ActiveTool,
  type CustomKeycapDesignSnapshot,
  type ImageLayerState,
  type InfoTab,
  type LayerBox,
  type SelectionRef,
  type StoredKeycapDraft,
  type TextLayerState,
} from '@/features/products/custom-keycap-types'
import { formatPrice, isProductSoldOut, type StoreProduct } from '@/lib/store-shared'

interface CustomKeycapEditorViewProps {
  product: StoreProduct
}

type DragState =
  | {
      mode: 'move'
      target: SelectionRef
      startCanvasX: number
      startCanvasY: number
      originX: number
      originY: number
    }
  | {
      mode: 'resize'
      target: SelectionRef
      centerX: number
      centerY: number
      startDist: number
      originScale: number
      originFontSize: number
    }
  | {
      mode: 'rotate'
      target: SelectionRef
      centerX: number
      centerY: number
      startAngleDeg: number
      originRotation: number
    }

interface MonochromeSliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  ariaLabel?: string
}

/**
 * Figma 디자인 스펙(#E4E4E7 트랙 / #18181B 채움 및 12px 손잡이)에 맞춘 단색 범위 슬라이더입니다.
 */
function MonochromeSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  ariaLabel,
}: MonochromeSliderProps) {
  const ratio = max > min ? ((value - min) / (max - min)) * 100 : 0
  const percent = Math.min(100, Math.max(0, ratio))

  return (
    <input
      aria-label={ariaLabel}
      className="h-1 w-full cursor-pointer appearance-none rounded-[2px] outline-none [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[#18181B] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#18181B]"
      max={max}
      min={min}
      onChange={(e) => onChange(Number(e.target.value))}
      step={step}
      style={{
        background: `linear-gradient(to right, #18181B ${percent}%, #E4E4E7 ${percent}%)`,
      }}
      type="range"
      value={value}
    />
  )
}

export function CustomKeycapEditorView({ product }: CustomKeycapEditorViewProps) {
  const { items: cartItems, addItem } = useCart()
  const meta = useMemo(() => resolveKeycapMeta(product.name), [product.name])
  const isSoldOut = isProductSoldOut(product)
  const draftStorageKey = useMemo(() => getDraftStorageKey(product.id), [product.id])

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const [canvasCursor, setCanvasCursor] = useState<string>('default')
  const [isDraggingFile, setIsDraggingFile] = useState(false)

  const [activeTool, setActiveTool] = useState<ActiveTool>('image')
  const [backgroundColor, setBackgroundColor] = useState<string>('#ffffff')
  const [imageLayer, setImageLayer] = useState<ImageLayerState | null>(null)
  const [textLayers, setTextLayers] = useState<TextLayerState[]>(() => [createTextLayer(0, '')])
  const [selection, setSelection] = useState<SelectionRef>({ kind: 'image' })
  const [imageOnTop, setImageOnTop] = useState(false)

  const [showGuides, setShowGuides] = useState(true)
  const [snapGuide, setSnapGuide] = useState<{ x: boolean; y: boolean }>({ x: false, y: false })
  const [activeTab, setActiveTab] = useState<InfoTab>('story')

  const [undoStack, setUndoStack] = useState<CustomKeycapDesignSnapshot[]>([])
  const [savedDraft, setSavedDraft] = useState<StoredKeycapDraft | null>(null)
  const [draftStatusMessage, setDraftStatusMessage] = useState<string | null>(null)
  const [mountPreviewUrl, setMountPreviewUrl] = useState<string | null>(null)

  const [quantity, setQuantity] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)

  const activeTextLayer = useMemo(() => {
    if (selection.kind === 'text') {
      return textLayers.find((t) => t.id === selection.id) ?? textLayers[0] ?? null
    }
    return textLayers[0] ?? null
  }, [selection, textLayers])

  // 현재 디자인 상태 스냅샷을 Undo 스택에 기록 (드래그 시작·버튼 조작 직전 호출)
  const pushUndoSnapshot = useCallback(() => {
    const snap: CustomKeycapDesignSnapshot = {
      backgroundColor,
      imageLayer,
      textLayers: textLayers.map((t) => ({ ...t })),
      imageOnTop,
    }
    setUndoStack((prev) => [...prev.slice(-24), snap])
  }, [backgroundColor, imageLayer, imageOnTop, textLayers])

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setBackgroundColor(last.backgroundColor)
      setImageLayer(last.imageLayer)
      setTextLayers(last.textLayers.length > 0 ? last.textLayers : [createTextLayer(0, '')])
      setImageOnTop(last.imageOnTop)
      return prev.slice(0, -1)
    })
  }, [])

  // Ctrl+Z 실행취소 및 방향키(↑↓←→) 미세 위치 이동 지원
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
        return
      }

      const step = e.shiftKey ? 0.02 : 0.005
      let dx = 0
      let dy = 0
      if (e.key === 'ArrowLeft') dx = -step
      else if (e.key === 'ArrowRight') dx = step
      else if (e.key === 'ArrowUp') dy = -step
      else if (e.key === 'ArrowDown') dy = step
      else return

      e.preventDefault()
      if (selection.kind === 'image' && imageLayer) {
        setImageLayer((prev) =>
          prev
            ? {
                ...prev,
                x: Math.min(1.15, Math.max(-0.15, prev.x + dx)),
                y: Math.min(1.15, Math.max(-0.15, prev.y + dy)),
              }
            : prev,
        )
      } else if (selection.kind === 'text' && activeTextLayer?.text.trim()) {
        const targetId = activeTextLayer.id
        setTextLayers((prev) =>
          prev.map((t) =>
            t.id === targetId
              ? {
                  ...t,
                  x: Math.min(1.15, Math.max(-0.15, t.x + dx)),
                  y: Math.min(1.15, Math.max(-0.15, t.y + dy)),
                }
              : t,
          ),
        )
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTextLayer, handleUndo, imageLayer, selection])

  // 마운트 시 localStorage 임시저장 디자인 확인
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as StoredKeycapDraft
      if (parsed && Array.isArray(parsed.textLayers)) {
        setSavedDraft(parsed)
      }
    } catch {
      // 손상된 로컬 스토리지 항목은 무시
    }
  }, [draftStorageKey])

  const getLayerBox = useCallback(
    (target: SelectionRef, targetCanvas?: HTMLCanvasElement | null): LayerBox | null => {
      const w = targetCanvas?.width ?? meta.canvasWidth
      const h = targetCanvas?.height ?? meta.canvasHeight
      const bodyW = w - BLEED_PAD * 2
      const bodyH = h - BLEED_PAD * 2

      if (target.kind === 'image') {
        if (!imageLayer) return null
        const img = imageLayer.element
        const fitScale = Math.min(bodyW / img.width, bodyH / img.height)
        return {
          cx: BLEED_PAD + bodyW * imageLayer.x,
          cy: BLEED_PAD + bodyH * imageLayer.y,
          width: img.width * fitScale * imageLayer.scale,
          height: img.height * fitScale * imageLayer.scale,
          rotationRad: (imageLayer.rotation * Math.PI) / 180,
        }
      }

      const textItem = textLayers.find((t) => t.id === target.id)
      if (!textItem || !textItem.text.trim()) return null

      const lines = textItem.text.split(/\r?\n/)
      const lineHeight = textItem.fontSize * 1.24
      const strokePad = (textItem.strokeWidth ?? 0) * 2
      const ctx = targetCanvas?.getContext('2d') ?? canvasRef.current?.getContext('2d')
      let textW =
        lines.reduce((max, line) => Math.max(max, line.length), 0) * textItem.fontSize * 0.65
      if (ctx) {
        ctx.save()
        ctx.font = `700 ${textItem.fontSize}px ${textItem.fontFamily}`
        textW = lines.reduce((max, line) => Math.max(max, ctx.measureText(line || ' ').width), 0)
        ctx.restore()
      }
      return {
        cx: BLEED_PAD + bodyW * textItem.x,
        cy: BLEED_PAD + bodyH * textItem.y,
        width: Math.max(36, textW + strokePad + 18),
        height: Math.max(28, lines.length * lineHeight + strokePad + 8),
        rotationRad: (textItem.rotation * Math.PI) / 180,
      }
    },
    [imageLayer, meta.canvasHeight, meta.canvasWidth, textLayers],
  )

  const renderCanvas = useCallback(
    (targetCanvas: HTMLCanvasElement, includeGuides: boolean, showSelection = false) => {
      const ctx = targetCanvas.getContext('2d')
      if (!ctx) return

      const w = targetCanvas.width
      const h = targetCanvas.height
      const bodyW = w - BLEED_PAD * 2
      const bodyH = h - BLEED_PAD * 2

      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#F3F3F4'
      ctx.fillRect(0, 0, w, h)

      const isDefaultWhite = backgroundColor.toLowerCase() === '#ffffff'
      const topX = BLEED_PAD + meta.safeInsetX - 10
      const topY = BLEED_PAD + meta.safeInsetY - 12
      const topW = bodyW - (meta.safeInsetX - 10) * 2
      const topH = bodyH - (meta.safeInsetY - 10) * 2

      // 1) 키캡 5면 베이스 외곽 + 입체 음영 (선택한 5면 인쇄 배경색 반영)
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.08)'
      ctx.shadowBlur = 14
      ctx.shadowOffsetY = 4
      ctx.fillStyle = isDefaultWhite ? '#FAFAFA' : backgroundColor
      drawRoundedRectPath(ctx, BLEED_PAD, BLEED_PAD, bodyW, bodyH, 16)
      ctx.fill()
      ctx.restore()

      // 기본 화이트 키캡일 때 윗면 타건부를 순백색(#FFFFFF)으로 구분해 도안 가시성 확보
      if (includeGuides && isDefaultWhite) {
        ctx.save()
        ctx.fillStyle = '#FFFFFF'
        drawRoundedRectPath(ctx, topX, topY, topW, topH, 12)
        ctx.fill()
        ctx.restore()
      }

      // 2) 키캡 내부 클리핑 영역에 이미지/다중 텍스트 레이어 렌더
      ctx.save()
      drawRoundedRectPath(ctx, BLEED_PAD, BLEED_PAD, bodyW, bodyH, 16)
      ctx.clip()

      const drawImage = () => {
        if (!imageLayer) return
        const img = imageLayer.element
        const fitScale = Math.min(bodyW / img.width, bodyH / img.height)
        const drawW = img.width * fitScale * imageLayer.scale
        const drawH = img.height * fitScale * imageLayer.scale

        ctx.save()
        ctx.translate(BLEED_PAD + bodyW * imageLayer.x, BLEED_PAD + bodyH * imageLayer.y)
        ctx.rotate((imageLayer.rotation * Math.PI) / 180)
        ctx.scale(imageLayer.flipX ? -1 : 1, imageLayer.flipY ? -1 : 1)
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)
        ctx.restore()
      }

      const drawTexts = () => {
        for (const t of textLayers) {
          if (!t.text.trim()) continue
          const lines = t.text.split(/\r?\n/)
          const lineHeight = t.fontSize * 1.24
          const startY = -((lines.length - 1) * lineHeight) / 2
          const strokeWidth = t.strokeWidth ?? 0

          ctx.save()
          ctx.translate(BLEED_PAD + bodyW * t.x, BLEED_PAD + bodyH * t.y)
          ctx.rotate((t.rotation * Math.PI) / 180)
          ctx.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1)
          ctx.font = `700 ${t.fontSize}px ${t.fontFamily}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'

          lines.forEach((line, index) => {
            const lineY = startY + index * lineHeight
            if (strokeWidth > 0) {
              ctx.strokeStyle = t.strokeColor ?? '#ffffff'
              ctx.lineWidth = strokeWidth * 2
              ctx.lineJoin = 'round'
              ctx.miterLimit = 2
              ctx.strokeText(line, 0, lineY)
            }
            ctx.fillStyle = t.color
            ctx.fillText(line, 0, lineY)
          })
          ctx.restore()
        }
      }

      if (imageOnTop) {
        drawTexts()
        drawImage()
      } else {
        drawImage()
        drawTexts()
      }

      // 윗면 경사 입체감 (에디터 화면/가이드 미리보기에서만 표시해 인쇄 원본 PNG는 깨끗하게 유지)
      if (includeGuides) {
        const darkBg = isDarkHex(backgroundColor)

        // 상단 림 하이라이트 & 하단 스커트 음영
        const bottomShade = ctx.createLinearGradient(0, topY + topH, 0, BLEED_PAD + bodyH)
        bottomShade.addColorStop(0, 'rgba(0, 0, 0, 0)')
        bottomShade.addColorStop(1, darkBg ? 'rgba(0, 0, 0, 0.34)' : 'rgba(0, 0, 0, 0.08)')
        ctx.fillStyle = bottomShade
        ctx.fillRect(BLEED_PAD, topY + topH, bodyW, BLEED_PAD + bodyH - (topY + topH))

        const topShade = ctx.createLinearGradient(0, BLEED_PAD, 0, topY)
        topShade.addColorStop(0, darkBg ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.35)')
        topShade.addColorStop(1, 'rgba(255, 255, 255, 0)')
        ctx.fillStyle = topShade
        ctx.fillRect(BLEED_PAD, BLEED_PAD, bodyW, topY - BLEED_PAD)

        // 좌·우 스커트 경사 음영
        const leftShade = ctx.createLinearGradient(BLEED_PAD, 0, topX, 0)
        leftShade.addColorStop(0, darkBg ? 'rgba(0, 0, 0, 0.24)' : 'rgba(0, 0, 0, 0.05)')
        leftShade.addColorStop(1, 'rgba(0, 0, 0, 0)')
        ctx.fillStyle = leftShade
        ctx.fillRect(BLEED_PAD, BLEED_PAD, topX - BLEED_PAD, bodyH)

        const rightShade = ctx.createLinearGradient(topX + topW, 0, BLEED_PAD + bodyW, 0)
        rightShade.addColorStop(0, 'rgba(0, 0, 0, 0)')
        rightShade.addColorStop(1, darkBg ? 'rgba(0, 0, 0, 0.24)' : 'rgba(0, 0, 0, 0.05)')
        ctx.fillStyle = rightShade
        ctx.fillRect(topX + topW, BLEED_PAD, BLEED_PAD + bodyW - (topX + topW), bodyH)

        // OEM 4모서리 대각선 베벨 엣지 + 윗면 타건부 테두리 (#D4D4D8)
        ctx.strokeStyle = darkBg ? 'rgba(255, 255, 255, 0.22)' : '#D4D4D8'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(BLEED_PAD + 8, BLEED_PAD + 8)
        ctx.lineTo(topX + 6, topY + 6)
        ctx.moveTo(BLEED_PAD + bodyW - 8, BLEED_PAD + 8)
        ctx.lineTo(topX + topW - 6, topY + 6)
        ctx.moveTo(BLEED_PAD + 8, BLEED_PAD + bodyH - 8)
        ctx.lineTo(topX + 6, topY + topH - 6)
        ctx.moveTo(BLEED_PAD + bodyW - 8, BLEED_PAD + bodyH - 8)
        ctx.lineTo(topX + topW - 6, topY + topH - 6)
        ctx.stroke()

        ctx.strokeStyle = darkBg ? 'rgba(255, 255, 255, 0.28)' : '#D4D4D8'
        ctx.lineWidth = 1.2
        drawRoundedRectPath(ctx, topX, topY, topW, topH, 12)
        ctx.stroke()
      }
      ctx.restore()

      // 3) 편집용 가이드선 (#3F3F46 전체 인쇄선 + #A1A1AA 윗면 안전영역) & 빈 캔버스 안내 워터마크
      if (includeGuides) {
        ctx.save()
        ctx.setLineDash([5, 4])
        ctx.strokeStyle = '#3F3F46'
        ctx.lineWidth = 1.2
        drawRoundedRectPath(ctx, BLEED_PAD + 1, BLEED_PAD + 1, bodyW - 2, bodyH - 2, 16)
        ctx.stroke()

        ctx.strokeStyle = '#A1A1AA'
        ctx.lineWidth = 1.2
        drawRoundedRectPath(
          ctx,
          BLEED_PAD + meta.safeInsetX,
          BLEED_PAD + meta.safeInsetY,
          bodyW - meta.safeInsetX * 2,
          bodyH - meta.safeInsetY * 2,
          10,
        )
        ctx.stroke()

        const hasAnyText = textLayers.some((t) => t.text.trim())
        if (!imageLayer && !hasAnyText) {
          ctx.setLineDash([])
          ctx.fillStyle = isDarkHex(backgroundColor) ? 'rgba(255, 255, 255, 0.48)' : '#A1A1AA'
          ctx.font = '500 13px Pretendard, sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('사진을 이곳에 끌어다 놓거나', w / 2, h / 2 - 10)
          ctx.fillText('우측 패널에서 디자인을 추가하세요', w / 2, h / 2 + 12)
        }
        ctx.restore()
      }

      // 4) 중앙 스냅 라인 + 선택 박스 + 모서리 크기 핸들 + 상단 회전 핸들 (미리보기 전용)
      if (showSelection) {
        if (snapGuide.x || snapGuide.y) {
          ctx.save()
          ctx.strokeStyle = '#52525B'
          ctx.lineWidth = 1.2
          ctx.setLineDash([4, 3])
          if (snapGuide.x) {
            const midX = BLEED_PAD + bodyW * 0.5
            ctx.beginPath()
            ctx.moveTo(midX, BLEED_PAD)
            ctx.lineTo(midX, BLEED_PAD + bodyH)
            ctx.stroke()
          }
          if (snapGuide.y) {
            const midY = BLEED_PAD + bodyH * 0.5
            ctx.beginPath()
            ctx.moveTo(BLEED_PAD, midY)
            ctx.lineTo(BLEED_PAD + bodyW, midY)
            ctx.stroke()
          }
          ctx.restore()
        }

        const activeBox = getLayerBox(selection, targetCanvas)
        if (activeBox) {
          const corners = getRotatedBoxCorners(activeBox)
          const rotHandle = getRotationHandlePoint(activeBox)

          ctx.save()
          ctx.strokeStyle = '#18181B'
          ctx.lineWidth = 1.2
          ctx.setLineDash([4, 3])
          ctx.beginPath()
          ctx.moveTo(corners[0].x, corners[0].y)
          ctx.lineTo(corners[1].x, corners[1].y)
          ctx.lineTo(corners[2].x, corners[2].y)
          ctx.lineTo(corners[3].x, corners[3].y)
          ctx.closePath()
          ctx.stroke()

          // 회전 연결선 + 회전 손잡이
          ctx.setLineDash([])
          ctx.beginPath()
          ctx.moveTo(rotHandle.stemX, rotHandle.stemY)
          ctx.lineTo(rotHandle.knobX, rotHandle.knobY)
          ctx.stroke()

          ctx.fillStyle = '#18181B'
          ctx.beginPath()
          ctx.arc(rotHandle.knobX, rotHandle.knobY, 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#FFFFFF'
          ctx.lineWidth = 1.5
          ctx.stroke()

          // 4개 모서리 크기 조절 사각 핸들 (#FFFFFF + #18181B 테두리)
          for (const corner of corners) {
            ctx.fillStyle = '#FFFFFF'
            ctx.strokeStyle = '#18181B'
            ctx.lineWidth = 1.5
            ctx.fillRect(corner.x - 4.5, corner.y - 4.5, 9, 9)
            ctx.strokeRect(corner.x - 4.5, corner.y - 4.5, 9, 9)
          }
          ctx.restore()
        }
      }
    },
    [
      backgroundColor,
      getLayerBox,
      imageLayer,
      imageOnTop,
      meta,
      selection,
      snapGuide.x,
      snapGuide.y,
      textLayers,
    ],
  )

  useEffect(() => {
    const draw = () => {
      if (canvasRef.current) {
        renderCanvas(canvasRef.current, showGuides, true)
      }
    }
    draw()
    const frameId = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(frameId)
  }, [renderCanvas, showGuides])

  // 키보드 장착 미리보기용 스냅샷 동기화 (외부 여백 BLEED_PAD를 잘라내 키캡 슬롯에 꽉 차게 표시)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const offscreen = document.createElement('canvas')
      offscreen.width = meta.canvasWidth
      offscreen.height = meta.canvasHeight
      renderCanvas(offscreen, false, false)

      const bodyW = meta.canvasWidth - BLEED_PAD * 2
      const bodyH = meta.canvasHeight - BLEED_PAD * 2
      const cropped = document.createElement('canvas')
      cropped.width = bodyW
      cropped.height = bodyH
      const cropCtx = cropped.getContext('2d')
      if (cropCtx) {
        cropCtx.drawImage(offscreen, BLEED_PAD, BLEED_PAD, bodyW, bodyH, 0, 0, bodyW, bodyH)
        setMountPreviewUrl(cropped.toDataURL('image/png'))
      } else {
        setMountPreviewUrl(offscreen.toDataURL('image/png'))
      }
    }, 60)
    return () => window.clearTimeout(timer)
  }, [meta.canvasHeight, meta.canvasWidth, renderCanvas])

  // 캔버스 위 마우스 휠로 크기 확대/축소
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handleWheel = (e: WheelEvent) => {
      const target: SelectionRef | null =
        selection.kind === 'image' && imageLayer
          ? { kind: 'image' }
          : selection.kind === 'text' && activeTextLayer?.text.trim()
            ? { kind: 'text', id: activeTextLayer.id }
            : imageLayer
              ? { kind: 'image' }
              : activeTextLayer?.text.trim()
                ? { kind: 'text', id: activeTextLayer.id }
                : null
      if (!target) return
      e.preventDefault()
      const direction = e.deltaY < 0 ? 1 : -1
      if (target.kind === 'image') {
        setImageLayer((prev) =>
          prev ? { ...prev, scale: clampImageScale(prev.scale + direction * 0.08) } : prev,
        )
      } else {
        setTextLayers((prev) =>
          prev.map((t) =>
            t.id === target.id ? { ...t, fontSize: clampFontSize(t.fontSize + direction * 2) } : t,
          ),
        )
      }
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [activeTextLayer, imageLayer, selection])

  const loadImageFile = (file: File) => {
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
      pushUndoSnapshot()
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
      setSelection({ kind: 'image' })
      setActiveTool('image')
      setUploadNotice(null)
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      setUploadNotice('이미지를 불러오지 못했습니다. 다른 파일로 시도해 주세요.')
    }
    img.src = objectUrl
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    loadImageFile(file)
  }

  const handleCanvasDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!isDraggingFile) setIsDraggingFile(true)
  }

  const handleCanvasDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingFile(false)
  }

  const handleCanvasDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingFile(false)
    const file = e.dataTransfer.files?.[0]
    if (file) loadImageFile(file)
  }

  const toCanvasPoint = (e: PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / Math.max(1, rect.width)),
      y: (e.clientY - rect.top) * (canvas.height / Math.max(1, rect.height)),
    }
  }

  const hitTestTopLayer = useCallback(
    (px: number, py: number, canvas: HTMLCanvasElement): SelectionRef | null => {
      const candidates: SelectionRef[] = []
      if (imageOnTop) {
        for (const t of textLayers) {
          if (t.text.trim()) candidates.push({ kind: 'text', id: t.id })
        }
        if (imageLayer) candidates.push({ kind: 'image' })
      } else {
        if (imageLayer) candidates.push({ kind: 'image' })
        for (const t of textLayers) {
          if (t.text.trim()) candidates.push({ kind: 'text', id: t.id })
        }
      }
      for (const candidate of [...candidates].reverse()) {
        const box = getLayerBox(candidate, canvas)
        if (box && isPointInsideBox(px, py, box)) return candidate
      }
      return null
    },
    [getLayerBox, imageLayer, imageOnTop, textLayers],
  )

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const pt = toCanvasPoint(e, canvas)

    const currentBox = getLayerBox(selection, canvas)
    if (currentBox) {
      // 1) 상단 회전 핸들 체크
      if (isPointOnRotateHandle(pt.x, pt.y, currentBox)) {
        pushUndoSnapshot()
        canvas.setPointerCapture(e.pointerId)
        setCanvasCursor('grabbing')
        const startAngleDeg =
          (Math.atan2(pt.y - currentBox.cy, pt.x - currentBox.cx) * 180) / Math.PI
        const originRotation =
          selection.kind === 'image'
            ? (imageLayer?.rotation ?? 0)
            : (textLayers.find((t) => t.id === selection.id)?.rotation ?? 0)
        dragStateRef.current = {
          mode: 'rotate',
          target: selection,
          centerX: currentBox.cx,
          centerY: currentBox.cy,
          startAngleDeg,
          originRotation,
        }
        return
      }

      // 2) 모서리 크기 핸들 체크
      const hitCorner = findCornerAt(pt.x, pt.y, currentBox)
      if (hitCorner) {
        pushUndoSnapshot()
        canvas.setPointerCapture(e.pointerId)
        setCanvasCursor(hitCorner === 'nw' || hitCorner === 'se' ? 'nwse-resize' : 'nesw-resize')
        const targetText =
          selection.kind === 'text' ? textLayers.find((t) => t.id === selection.id) : null
        dragStateRef.current = {
          mode: 'resize',
          target: selection,
          centerX: currentBox.cx,
          centerY: currentBox.cy,
          startDist: Math.max(8, Math.hypot(pt.x - currentBox.cx, pt.y - currentBox.cy)),
          originScale: imageLayer?.scale ?? 1,
          originFontSize: targetText?.fontSize ?? 30,
        }
        return
      }
    }

    // 3) 레이어 본체 클릭 (선택 전환 + 이동)
    let target = hitTestTopLayer(pt.x, pt.y, canvas)
    if (!target) {
      if (selection.kind === 'image' && imageLayer) target = { kind: 'image' }
      else if (selection.kind === 'text' && activeTextLayer?.text.trim()) {
        target = { kind: 'text', id: activeTextLayer.id }
      }
    }
    if (!target) return

    pushUndoSnapshot()
    setSelection(target)
    setActiveTool(target.kind === 'image' ? 'image' : 'text')
    canvas.setPointerCapture(e.pointerId)
    setCanvasCursor('grabbing')

    const targetText = target.kind === 'text' ? textLayers.find((t) => t.id === target.id) : null
    dragStateRef.current = {
      mode: 'move',
      target,
      startCanvasX: pt.x,
      startCanvasY: pt.y,
      originX: target.kind === 'image' ? imageLayer!.x : (targetText?.x ?? 0.5),
      originY: target.kind === 'image' ? imageLayer!.y : (targetText?.y ?? 0.5),
    }
  }

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const pt = toCanvasPoint(e, canvas)
    const drag = dragStateRef.current

    if (!drag) {
      const activeBox = getLayerBox(selection, canvas)
      if (activeBox) {
        if (isPointOnRotateHandle(pt.x, pt.y, activeBox)) {
          setCanvasCursor('grab')
          return
        }
        const corner = findCornerAt(pt.x, pt.y, activeBox)
        if (corner) {
          setCanvasCursor(corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize')
          return
        }
      }
      setCanvasCursor(hitTestTopLayer(pt.x, pt.y, canvas) ? 'grab' : 'default')
      return
    }

    if (drag.mode === 'rotate') {
      const currentAngleDeg = (Math.atan2(pt.y - drag.centerY, pt.x - drag.centerX) * 180) / Math.PI
      const nextRot = snapRotationAngle(
        drag.originRotation + (currentAngleDeg - drag.startAngleDeg),
        e.shiftKey,
      )
      if (drag.target.kind === 'image') {
        setImageLayer((prev) => (prev ? { ...prev, rotation: nextRot } : prev))
      } else {
        const targetId = drag.target.id
        setTextLayers((prev) =>
          prev.map((t) => (t.id === targetId ? { ...t, rotation: nextRot } : t)),
        )
      }
      return
    }

    if (drag.mode === 'resize') {
      const dist = Math.hypot(pt.x - drag.centerX, pt.y - drag.centerY)
      const ratio = dist / drag.startDist
      if (drag.target.kind === 'image') {
        setImageLayer((prev) =>
          prev ? { ...prev, scale: clampImageScale(drag.originScale * ratio) } : prev,
        )
      } else {
        const targetId = drag.target.id
        setTextLayers((prev) =>
          prev.map((t) =>
            t.id === targetId ? { ...t, fontSize: clampFontSize(drag.originFontSize * ratio) } : t,
          ),
        )
      }
      return
    }

    const bodyW = Math.max(1, canvas.width - BLEED_PAD * 2)
    const bodyH = Math.max(1, canvas.height - BLEED_PAD * 2)
    const snapped = snapNormalizedPoint(
      drag.originX + (pt.x - drag.startCanvasX) / bodyW,
      drag.originY + (pt.y - drag.startCanvasY) / bodyH,
    )
    setSnapGuide({ x: snapped.snappedX, y: snapped.snappedY })

    if (drag.target.kind === 'image') {
      setImageLayer((prev) => (prev ? { ...prev, x: snapped.x, y: snapped.y } : prev))
    } else {
      const targetId = drag.target.id
      setTextLayers((prev) =>
        prev.map((t) => (t.id === targetId ? { ...t, x: snapped.x, y: snapped.y } : t)),
      )
    }
  }

  const handlePointerUp = () => {
    dragStateRef.current = null
    setSnapGuide({ x: false, y: false })
    setCanvasCursor('default')
  }

  const updateSelectedText = (patch: Partial<TextLayerState>, recordUndo = false) => {
    if (!activeTextLayer) return
    if (recordUndo) pushUndoSnapshot()
    const targetId = activeTextLayer.id
    setTextLayers((prev) => prev.map((t) => (t.id === targetId ? { ...t, ...patch } : t)))
  }

  const addNewTextLayer = () => {
    if (textLayers.length >= MAX_TEXT_LAYERS) {
      alert(`텍스트 레이어는 최대 ${MAX_TEXT_LAYERS}개까지 추가할 수 있습니다.`)
      return
    }
    pushUndoSnapshot()
    const next = createTextLayer(textLayers.length, `문구 ${textLayers.length + 1}`)
    setTextLayers((prev) => [...prev, next])
    setSelection({ kind: 'text', id: next.id })
    setActiveTool('text')
  }

  const removeTextLayer = (id: string, recordUndo = true) => {
    if (recordUndo) pushUndoSnapshot()
    setTextLayers((prev) => {
      const filtered = prev.filter((t) => t.id !== id)
      if (filtered.length === 0) {
        const empty = createTextLayer(0, '')
        setSelection({ kind: 'text', id: empty.id })
        return [empty]
      }
      if (selection.kind === 'text' && selection.id === id) {
        setSelection({ kind: 'text', id: filtered[0].id })
      }
      return filtered
    })
  }

  // 어두운 배경색 선택 시 기본 텍스트 색상을 자동으로 고대비(#ffffff / #111827)로 보정
  const applyBackgroundColor = (nextHex: string, recordUndo = true) => {
    if (recordUndo) pushUndoSnapshot()
    setBackgroundColor(nextHex)
    const dark = isDarkHex(nextHex)
    setTextLayers((prev) =>
      prev.map((layer) => {
        const normalized = layer.color.toLowerCase()
        if (dark && normalized === '#111827') {
          return { ...layer, color: '#ffffff' }
        }
        if (!dark && normalized === '#ffffff') {
          return { ...layer, color: '#111827' }
        }
        return layer
      }),
    )
  }

  const applyCoverScale = () => {
    if (!imageLayer) return
    pushUndoSnapshot()
    const bodyW = meta.canvasWidth - BLEED_PAD * 2
    const bodyH = meta.canvasHeight - BLEED_PAD * 2
    const fitScale = Math.min(bodyW / imageLayer.element.width, bodyH / imageLayer.element.height)
    const coverScale = Math.max(
      bodyW / (imageLayer.element.width * fitScale),
      bodyH / (imageLayer.element.height * fitScale),
    )
    setImageLayer({
      ...imageLayer,
      scale: clampImageScale(Math.ceil(coverScale * 100) / 100),
      x: 0.5,
      y: 0.5,
    })
  }

  const applySafeAreaFitScale = () => {
    if (!imageLayer) return
    pushUndoSnapshot()
    const bodyW = meta.canvasWidth - BLEED_PAD * 2
    const bodyH = meta.canvasHeight - BLEED_PAD * 2
    const safeW = Math.max(40, bodyW - meta.safeInsetX * 2)
    const safeH = Math.max(40, bodyH - meta.safeInsetY * 2)
    const fitScale = Math.min(bodyW / imageLayer.element.width, bodyH / imageLayer.element.height)
    const safeFit = Math.min(
      safeW / (imageLayer.element.width * fitScale),
      safeH / (imageLayer.element.height * fitScale),
    )
    setImageLayer({ ...imageLayer, scale: clampImageScale(safeFit), x: 0.5, y: 0.5 })
  }

  const alignSelectedCenter = () => {
    pushUndoSnapshot()
    if (selection.kind === 'image' && imageLayer) {
      setImageLayer({ ...imageLayer, x: 0.5, y: 0.5 })
    } else if (activeTextLayer) {
      updateSelectedText({ x: 0.5, y: 0.5 })
    }
  }

  const flipSelected = (axis: 'x' | 'y') => {
    pushUndoSnapshot()
    if (selection.kind === 'image' && imageLayer) {
      setImageLayer({
        ...imageLayer,
        flipX: axis === 'x' ? !imageLayer.flipX : imageLayer.flipX,
        flipY: axis === 'y' ? !imageLayer.flipY : imageLayer.flipY,
      })
    } else if (activeTextLayer) {
      updateSelectedText({
        flipX: axis === 'x' ? !activeTextLayer.flipX : activeTextLayer.flipX,
        flipY: axis === 'y' ? !activeTextLayer.flipY : activeTextLayer.flipY,
      })
    }
  }

  const bringSelectedToFront = () => {
    pushUndoSnapshot()
    if (selection.kind === 'image') {
      setImageOnTop(true)
      return
    }
    setImageOnTop(false)
    const targetId = selection.id
    setTextLayers((prev) => {
      const target = prev.find((t) => t.id === targetId)
      if (!target) return prev
      return [...prev.filter((t) => t.id !== targetId), target]
    })
  }

  const deleteSelected = () => {
    pushUndoSnapshot()
    if (selection.kind === 'image' && imageLayer) {
      setImageLayer(null)
    } else if (selection.kind === 'text' && activeTextLayer) {
      removeTextLayer(activeTextLayer.id, false)
    }
  }

  const resetAllDesign = () => {
    pushUndoSnapshot()
    setBackgroundColor('#ffffff')
    setImageLayer(null)
    const fresh = createTextLayer(0, '')
    setTextLayers([fresh])
    setSelection({ kind: 'image' })
    setImageOnTop(false)
    setUploadNotice(null)
  }

  // localStorage 임시저장 & 불러오기
  const handleSaveDraft = () => {
    try {
      const payload: StoredKeycapDraft = {
        savedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        backgroundColor,
        image: imageLayer
          ? {
              dataUrl: compressImageForDraft(imageLayer.element),
              x: imageLayer.x,
              y: imageLayer.y,
              scale: imageLayer.scale,
              rotation: imageLayer.rotation,
              flipX: imageLayer.flipX,
              flipY: imageLayer.flipY,
            }
          : null,
        textLayers,
        imageOnTop,
      }
      window.localStorage.setItem(draftStorageKey, JSON.stringify(payload))
      setSavedDraft(payload)
      setDraftStatusMessage(`임시저장 완료 (${payload.savedAt})`)
      window.setTimeout(() => setDraftStatusMessage(null), 2500)
    } catch {
      alert(
        '브라우저 저장 공간이 부족하여 임시저장에 실패했습니다. (사진 크기를 줄여 시도해 주세요)',
      )
    }
  }

  const handleLoadDraft = (draft: StoredKeycapDraft) => {
    pushUndoSnapshot()
    setBackgroundColor(draft.backgroundColor || '#ffffff')
    setTextLayers(draft.textLayers.length > 0 ? draft.textLayers : [createTextLayer(0, '')])
    setImageOnTop(Boolean(draft.imageOnTop))

    if (draft.image?.dataUrl) {
      const img = new window.Image()
      const imageDraft = draft.image
      img.onload = () => {
        setImageLayer({
          src: imageDraft.dataUrl,
          element: img,
          x: imageDraft.x,
          y: imageDraft.y,
          scale: imageDraft.scale,
          rotation: imageDraft.rotation,
          flipX: imageDraft.flipX,
          flipY: imageDraft.flipY,
        })
        setSelection({ kind: 'image' })
      }
      img.src = imageDraft.dataUrl
    } else {
      setImageLayer(null)
    }
    setDraftStatusMessage('저장된 디자인을 불러왔습니다.')
    window.setTimeout(() => setDraftStatusMessage(null), 2500)
  }

  const handleClearDraft = () => {
    window.localStorage.removeItem(draftStorageKey)
    setSavedDraft(null)
  }

  const exportCanvasBlob = (includeGuides: boolean): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const offscreen = document.createElement('canvas')
      offscreen.width = meta.canvasWidth
      offscreen.height = meta.canvasHeight
      renderCanvas(offscreen, includeGuides, false)
      offscreen.toBlob((blob) => {
        if (!blob) {
          reject(new Error('디자인 이미지를 생성하지 못했습니다.'))
          return
        }
        resolve(blob)
      }, 'image/png')
    })
  }

  const handleDownloadPreviewPng = async () => {
    try {
      const blob = await exportCanvasBlob(false)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `monokeys-keycap-${meta.keyType.toLowerCase().replace(/\s+/g, '-')}.png`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'PNG 저장에 실패했습니다.')
    }
  }

  const handleAddCustomKeycapToCart = async () => {
    if (isSoldOut) {
      alert('현재 품절되어 장바구니에 담을 수 없습니다.')
      return
    }
    const nonEmptyTexts = textLayers.filter((t) => t.text.trim())
    const hasCustomBackground = backgroundColor.toLowerCase() !== '#ffffff'
    if (!imageLayer && nonEmptyTexts.length === 0 && !hasCustomBackground) {
      alert('이미지 업로드, 문구 입력, 또는 인쇄 배경색 선택으로 디자인을 완성해 주세요.')
      return
    }
    const existingCartQty = cartItems
      .filter((item) => item.productId === String(product.id))
      .reduce((sum, item) => sum + item.quantity, 0)
    if (existingCartQty + quantity > product.stockQuantity) {
      alert(`${product.name}의 현재 재고수는 ${product.stockQuantity}개입니다.`)
      return
    }

    setSubmitting(true)
    try {
      await apiRequest('/api/auth/me')
    } catch (authErr) {
      setSubmitting(false)
      if (authErr instanceof ApiRequestError && authErr.status === 401) {
        alert('로그인이 필요한 서비스입니다.')
      } else {
        alert('로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      }
      return
    }

    let uploadedUrls: string[] = []
    try {
      const printBlob = await exportCanvasBlob(false)
      const uploaded = await uploadCustomKeycapImages(printBlob)
      uploadedUrls = Array.from(
        new Set([uploaded.imageUrl, uploaded.previewImageUrl].filter(Boolean)),
      )

      const primaryText = nonEmptyTexts[0] ?? null
      const designPayload = {
        keyType: meta.keyType,
        keySize: meta.keySize,
        baseColor: 'WHITE',
        backgroundColor,
        dimensions: meta.dimensions,
        previewImageUrl: uploaded.previewImageUrl,
        printImageUrl: uploaded.imageUrl,
        customText:
          nonEmptyTexts.length > 0 ? nonEmptyTexts.map((t) => t.text.trim()).join(' / ') : null,
        fontFamily: primaryText ? primaryText.fontFamily : null,
        textColor: primaryText ? primaryText.color : null,
        textLayers: nonEmptyTexts.map((t) => ({
          text: t.text.trim(),
          fontFamily: t.fontFamily,
          color: t.color,
          fontSize: t.fontSize,
          rotation: t.rotation,
          strokeColor: t.strokeColor ?? '#ffffff',
          strokeWidth: t.strokeWidth ?? 0,
        })),
      }

      const added = await addItem({
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
      if (!added) {
        await Promise.allSettled(uploadedUrls.map((url) => deleteCustomKeycapImage(url)))
        return
      }
    } catch (err) {
      if (uploadedUrls.length > 0) {
        await Promise.allSettled(uploadedUrls.map((url) => deleteCustomKeycapImage(url)))
      }
      alert(err instanceof Error ? err.message : '커스텀 키캡을 장바구니에 담지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-12">
      <div className="space-y-5">
        <h2 className="text-2xl font-bold tracking-[-0.02em] text-[#18181B]">커스텀 키캡 제작</h2>

        {/* 상단: 좌측 에디터 + 우측 상품 구매 패널 */}
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 max-xl:grid-cols-1">
          {/* 좌측: MONO / STUDIO 커스텀 키캡 에디터 */}
          <div className="rounded-lg border border-[#E4E4E7] bg-white p-6 max-sm:p-4">
            {/* 7종 커스텀 키캡 규격 빠른 전환 */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[#E4E4E7] pb-3.5">
              <span className="mr-3 shrink-0 text-[13px] font-bold text-[#52525B]">규격 전환</span>
              {KEYCAP_VARIANT_LINKS.map((variant) => {
                const isCurrent = String(product.id) === variant.id
                return (
                  <Link
                    className={`inline-flex h-8 items-center justify-center rounded-[4px] border px-3 text-xs transition ${
                      isCurrent
                        ? 'border-[#18181B] bg-[#18181B] font-bold text-white'
                        : 'border-transparent font-medium text-[#18181B] hover:bg-[#F4F4F5]'
                    }`}
                    href={`/products/${variant.id}`}
                    key={variant.id}
                  >
                    {variant.label}
                  </Link>
                )
              })}
            </div>

            {/* 임시저장 복구 배너 */}
            {savedDraft && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-[#E4E4E7] bg-[#F4F4F5] px-3.5 py-2.5 text-xs text-[#18181B]">
                <span>이전에 임시저장한 디자인({savedDraft.savedAt})이 있습니다.</span>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-[4px] bg-[#18181B] px-2.5 py-1 font-semibold text-white hover:bg-zinc-800"
                    onClick={() => handleLoadDraft(savedDraft)}
                    type="button"
                  >
                    불러오기
                  </button>
                  <button
                    className="text-[#52525B] underline hover:text-[#18181B]"
                    onClick={handleClearDraft}
                    type="button"
                  >
                    삭제
                  </button>
                </div>
              </div>
            )}

            {/* 상단 편집 툴바 */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E4E7] py-3">
              <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                <button
                  className="inline-flex h-9 items-center justify-center rounded-[4px] px-3 font-medium text-[#18181B] transition hover:bg-[#F4F4F5] disabled:opacity-40"
                  disabled={undoStack.length === 0}
                  onClick={handleUndo}
                  title="실행 취소 (Ctrl+Z)"
                  type="button"
                >
                  ↶ 실행취소
                </button>
                <button
                  className="inline-flex h-9 items-center justify-center rounded-[4px] px-3 font-medium text-[#18181B] transition hover:bg-[#F4F4F5]"
                  onClick={resetAllDesign}
                  type="button"
                >
                  초기화
                </button>

                <span
                  aria-hidden="true"
                  className="mx-1 h-[18px] w-px bg-[#E4E4E7] max-sm:hidden"
                />

                <button
                  className="inline-flex h-9 items-center justify-center rounded-[4px] px-3 font-medium text-[#18181B] transition hover:bg-[#F4F4F5]"
                  onClick={bringSelectedToFront}
                  type="button"
                >
                  앞으로
                </button>
                <button
                  className="inline-flex h-9 items-center justify-center rounded-[4px] px-3 font-medium text-[#18181B] transition hover:bg-[#F4F4F5]"
                  onClick={() => flipSelected('x')}
                  type="button"
                >
                  좌우반전
                </button>
                <button
                  className="inline-flex h-9 items-center justify-center rounded-[4px] px-3 font-medium text-[#18181B] transition hover:bg-[#F4F4F5]"
                  onClick={() => flipSelected('y')}
                  type="button"
                >
                  상하반전
                </button>
                <button
                  className="inline-flex h-9 items-center justify-center rounded-[4px] px-3 font-medium text-[#18181B] transition hover:bg-[#F4F4F5]"
                  onClick={alignSelectedCenter}
                  type="button"
                >
                  정중앙
                </button>
                <button
                  className="inline-flex h-9 items-center justify-center rounded-[4px] px-3 font-medium text-[#18181B] transition hover:bg-red-50 hover:text-red-600"
                  onClick={deleteSelected}
                  type="button"
                >
                  선택 삭제
                </button>

                <span
                  aria-hidden="true"
                  className="mx-1 h-[18px] w-px bg-[#E4E4E7] max-sm:hidden"
                />

                <button
                  className="inline-flex h-9 items-center justify-center rounded-[4px] bg-[#F4F4F5] px-3.5 font-medium text-[#18181B] transition hover:bg-zinc-200/80"
                  onClick={handleSaveDraft}
                  type="button"
                >
                  임시저장
                </button>
                <button
                  className="inline-flex h-9 items-center justify-center rounded-[4px] bg-[#18181B] px-3.5 font-medium text-white transition hover:bg-zinc-800"
                  onClick={handleDownloadPreviewPng}
                  type="button"
                >
                  PNG 저장
                </button>
              </div>

              <label className="flex cursor-pointer items-center gap-2 select-none">
                <input
                  checked={showGuides}
                  className="sr-only"
                  onChange={(e) => setShowGuides(e.target.checked)}
                  type="checkbox"
                />
                <span
                  aria-hidden="true"
                  className={`flex h-4 w-4 items-center justify-center rounded-[3px] border transition ${
                    showGuides
                      ? 'border-[#18181B] bg-[#18181B] text-white'
                      : 'border-[#D4D4D8] bg-white text-transparent'
                  }`}
                >
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 12 12">
                    <path
                      d="M2.5 6.2L5 8.7L9.5 3.5"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.7"
                    />
                  </svg>
                </span>
                <span className="text-[13px] font-medium text-[#52525B]">가이드선</span>
              </label>
            </div>
            {draftStatusMessage && (
              <p className="mt-2.5 text-xs font-medium text-[#18181B]">{draftStatusMessage}</p>
            )}

            {/* 캔버스 + 우측 속성 패널 */}
            <div className="mt-5 grid grid-cols-[minmax(0,1fr)_288px] gap-6 max-lg:grid-cols-[minmax(0,1fr)_260px] max-md:grid-cols-1">
              <div className="md:border-r md:border-[#E4E4E7] md:pr-6">
                <div
                  className={`flex min-h-[420px] items-center justify-center rounded-[4px] p-6 transition max-sm:min-h-[320px] max-sm:p-4 ${
                    isDraggingFile
                      ? 'bg-zinc-200/80 ring-2 ring-dashed ring-[#18181B]'
                      : 'bg-[#F3F3F4]'
                  }`}
                  onDragLeave={handleCanvasDragLeave}
                  onDragOver={handleCanvasDragOver}
                  onDrop={handleCanvasDrop}
                >
                  <canvas
                    className="max-h-[380px] max-w-full touch-none rounded-[4px]"
                    height={meta.canvasHeight}
                    onPointerCancel={handlePointerUp}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    ref={canvasRef}
                    style={{ cursor: canvasCursor }}
                    width={meta.canvasWidth}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#52525B]">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded-[2px] border border-dashed border-[#A1A1AA]" />
                      윗면 안전 영역
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded-[2px] border border-dashed border-[#3F3F46]" />
                      5면 전체 인쇄
                    </span>
                  </div>
                  <span>이동 · 모서리 크기 · 상단 핸들 회전 · 휠 줌</span>
                </div>
              </div>

              {/* 우측 편집 속성 패널: 이미지 / 다중 텍스트 / 5면 배경색 */}
              <div className="flex flex-col">
                <div className="grid grid-cols-3 border-b border-[#E4E4E7]">
                  <button
                    className={`relative pb-3 pt-1 text-[13px] transition ${
                      activeTool === 'image'
                        ? 'font-bold text-[#18181B]'
                        : 'font-medium text-[#52525B] hover:text-[#18181B]'
                    }`}
                    onClick={() => {
                      setActiveTool('image')
                      setSelection({ kind: 'image' })
                    }}
                    type="button"
                  >
                    이미지
                    {activeTool === 'image' && (
                      <span className="absolute inset-x-0 -bottom-px h-[2px] bg-[#18181B]" />
                    )}
                  </button>
                  <button
                    className={`relative pb-3 pt-1 text-[13px] transition ${
                      activeTool === 'text'
                        ? 'font-bold text-[#18181B]'
                        : 'font-medium text-[#52525B] hover:text-[#18181B]'
                    }`}
                    onClick={() => {
                      setActiveTool('text')
                      if (activeTextLayer) setSelection({ kind: 'text', id: activeTextLayer.id })
                    }}
                    type="button"
                  >
                    텍스트
                    {activeTool === 'text' && (
                      <span className="absolute inset-x-0 -bottom-px h-[2px] bg-[#18181B]" />
                    )}
                  </button>
                  <button
                    className={`relative pb-3 pt-1 text-[13px] transition ${
                      activeTool === 'background'
                        ? 'font-bold text-[#18181B]'
                        : 'font-medium text-[#52525B] hover:text-[#18181B]'
                    }`}
                    onClick={() => setActiveTool('background')}
                    type="button"
                  >
                    배경색
                    {activeTool === 'background' && (
                      <span className="absolute inset-x-0 -bottom-px h-[2px] bg-[#18181B]" />
                    )}
                  </button>
                </div>

                <div className="pt-4">
                  {activeTool === 'image' && (
                    <div className="space-y-4">
                      <div>
                        <input
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={handleFileChange}
                          ref={fileInputRef}
                          type="file"
                        />
                        <button
                          className="flex h-11 w-full items-center justify-center rounded-[6px] border border-[#18181B] bg-[#18181B] px-3 text-[13px] font-semibold text-white transition hover:bg-zinc-800"
                          onClick={() => fileInputRef.current?.click()}
                          type="button"
                        >
                          {imageLayer ? '다른 이미지로 변경' : '+ 내 PC 이미지 업로드'}
                        </button>
                        <p className="mt-2.5 text-xs leading-5 text-[#52525B]">
                          JPG, PNG, WEBP (10MB 이하 / 배경 투명 PNG 권장)
                        </p>
                        {uploadNotice && (
                          <p className="mt-1.5 text-xs font-medium text-red-600">{uploadNotice}</p>
                        )}
                      </div>

                      {imageLayer && (
                        <div className="space-y-4 border-t border-[#E4E4E7] pt-4 text-xs">
                          <div>
                            <div className="mb-3 flex items-center justify-between">
                              <span className="text-[13px] font-medium text-[#18181B]">크기</span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  aria-label="이미지 축소"
                                  className="flex h-[30px] w-[28px] items-center justify-center rounded-[6px] border border-[#E4E4E7] bg-white text-xs font-medium text-[#18181B] hover:bg-[#F4F4F5]"
                                  onClick={() => {
                                    pushUndoSnapshot()
                                    setImageLayer({
                                      ...imageLayer,
                                      scale: clampImageScale(imageLayer.scale - 0.1),
                                    })
                                  }}
                                  type="button"
                                >
                                  −
                                </button>
                                <input
                                  aria-label="이미지 크기 퍼센트"
                                  className="h-[30px] w-[52px] rounded-[6px] border border-[#E4E4E7] bg-white px-1 text-center text-xs font-medium text-[#18181B] outline-none focus:border-[#18181B]"
                                  max={Math.round(MAX_IMAGE_SCALE * 100)}
                                  min={15}
                                  onChange={(e) => {
                                    const parsed = Number(e.target.value)
                                    if (Number.isFinite(parsed)) {
                                      setImageLayer({
                                        ...imageLayer,
                                        scale: clampImageScale(parsed / 100),
                                      })
                                    }
                                  }}
                                  type="number"
                                  value={Math.round(imageLayer.scale * 100)}
                                />
                                <span className="text-xs text-[#52525B]">%</span>
                                <button
                                  aria-label="이미지 확대"
                                  className="flex h-[30px] w-[28px] items-center justify-center rounded-[6px] border border-[#E4E4E7] bg-white text-xs font-medium text-[#18181B] hover:bg-[#F4F4F5]"
                                  onClick={() => {
                                    pushUndoSnapshot()
                                    setImageLayer({
                                      ...imageLayer,
                                      scale: clampImageScale(imageLayer.scale + 0.1),
                                    })
                                  }}
                                  type="button"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            <MonochromeSlider
                              ariaLabel="이미지 크기"
                              max={MAX_IMAGE_SCALE}
                              min={MIN_IMAGE_SCALE}
                              onChange={(val) =>
                                setImageLayer({
                                  ...imageLayer,
                                  scale: clampImageScale(val),
                                })
                              }
                              step={0.01}
                              value={imageLayer.scale}
                            />
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              <button
                                className="h-8 rounded-[4px] bg-[#F4F4F5] text-xs font-medium text-[#18181B] transition hover:bg-zinc-200/80"
                                onClick={applySafeAreaFitScale}
                                type="button"
                              >
                                영역 맞춤
                              </button>
                              <button
                                className="h-8 rounded-[4px] bg-[#F4F4F5] text-xs font-medium text-[#18181B] transition hover:bg-zinc-200/80"
                                onClick={applyCoverScale}
                                type="button"
                              >
                                꽉 채우기
                              </button>
                              <button
                                className="h-8 rounded-[4px] bg-[#F4F4F5] text-xs font-medium text-[#18181B] transition hover:bg-zinc-200/80"
                                onClick={() => {
                                  pushUndoSnapshot()
                                  setImageLayer({ ...imageLayer, scale: 1, x: 0.5, y: 0.5 })
                                }}
                                type="button"
                              >
                                100%
                              </button>
                            </div>
                          </div>

                          <div className="border-t border-[#E4E4E7] pt-4">
                            <div className="mb-2.5 flex items-center justify-between">
                              <span className="text-[13px] font-medium text-[#18181B]">회전</span>
                              <span className="text-xs font-medium text-[#52525B]">
                                {imageLayer.rotation}°
                              </span>
                            </div>
                            <MonochromeSlider
                              ariaLabel="이미지 회전"
                              max={180}
                              min={-180}
                              onChange={(val) => setImageLayer({ ...imageLayer, rotation: val })}
                              step={1}
                              value={imageLayer.rotation}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTool === 'text' && activeTextLayer && (
                    <div className="space-y-3.5 text-xs">
                      {/* 다중 텍스트 레이어 목록 & 추가 */}
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[13px] font-medium text-[#18181B]">
                            텍스트 레이어 ({textLayers.length}/{MAX_TEXT_LAYERS})
                          </span>
                          <button
                            className="h-7 rounded-[4px] bg-[#18181B] px-2.5 text-[11px] font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40"
                            disabled={textLayers.length >= MAX_TEXT_LAYERS}
                            onClick={addNewTextLayer}
                            type="button"
                          >
                            + 문구 추가
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {textLayers.map((layer, idx) => {
                            const active = layer.id === activeTextLayer.id
                            return (
                              <div
                                className={`inline-flex items-center gap-1 rounded-[4px] border px-2.5 py-1 text-[11px] transition ${
                                  active
                                    ? 'border-[#18181B] bg-[#F4F4F5] font-bold text-[#18181B]'
                                    : 'border-[#E4E4E7] bg-white font-medium text-[#52525B]'
                                }`}
                                key={layer.id}
                              >
                                <button
                                  className="max-w-[90px] truncate"
                                  onClick={() => setSelection({ kind: 'text', id: layer.id })}
                                  type="button"
                                >
                                  {layer.text.trim() || `문구 ${idx + 1}`}
                                </button>
                                {textLayers.length > 1 && (
                                  <button
                                    aria-label="문구 삭제"
                                    className="text-zinc-400 hover:text-red-600"
                                    onClick={() => removeTextLayer(layer.id)}
                                    type="button"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <label className="block border-t border-[#E4E4E7] pt-3">
                        <span className="mb-1.5 flex items-center justify-between font-medium text-[#18181B]">
                          <span>문구 입력</span>
                          <span className="text-[11px] font-normal text-[#52525B]">
                            Enter 줄바꿈 · {activeTextLayer.text.length}/60
                          </span>
                        </span>
                        <textarea
                          className="w-full resize-none rounded-[6px] border border-[#E4E4E7] bg-white px-3 py-2 text-sm leading-snug text-[#18181B] outline-none focus:border-[#18181B]"
                          maxLength={60}
                          onChange={(e) => {
                            setSelection({ kind: 'text', id: activeTextLayer.id })
                            updateSelectedText({ text: e.target.value })
                          }}
                          placeholder={'예: ESC\nMY KEY'}
                          rows={2}
                          value={activeTextLayer.text}
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block font-medium text-[#18181B]">폰트</span>
                        <select
                          className="w-full rounded-[6px] border border-[#E4E4E7] bg-white px-2.5 py-2 text-xs text-[#18181B] outline-none focus:border-[#18181B]"
                          onChange={(e) => updateSelectedText({ fontFamily: e.target.value }, true)}
                          value={activeTextLayer.fontFamily}
                        >
                          {FONT_OPTIONS.map((font) => (
                            <option key={font.value} value={font.value}>
                              {font.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[#18181B]">글자 색상</span>
                        <input
                          className="h-8 w-12 cursor-pointer rounded-[6px] border border-[#E4E4E7] bg-white p-0.5"
                          onChange={(e) => updateSelectedText({ color: e.target.value })}
                          type="color"
                          value={activeTextLayer.color}
                        />
                      </div>

                      <div className="space-y-2 rounded-[6px] border border-[#E4E4E7] bg-white p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-[#18181B]">
                            글자 외곽선 (사진 위 가독성)
                          </span>
                          <input
                            aria-label="글자 외곽선 색상"
                            className="h-7 w-10 cursor-pointer rounded-[6px] border border-[#E4E4E7] bg-white p-0.5"
                            onChange={(e) =>
                              updateSelectedText({
                                strokeColor: e.target.value,
                                strokeWidth:
                                  (activeTextLayer.strokeWidth ?? 0) === 0
                                    ? 2
                                    : activeTextLayer.strokeWidth,
                              })
                            }
                            type="color"
                            value={activeTextLayer.strokeColor ?? '#ffffff'}
                          />
                        </div>
                        <div>
                          <div className="mb-2 flex justify-between text-[11px] text-[#52525B]">
                            <span>외곽선 두께</span>
                            <span>
                              {(activeTextLayer.strokeWidth ?? 0) === 0
                                ? '없음'
                                : `${activeTextLayer.strokeWidth}px`}
                            </span>
                          </div>
                          <MonochromeSlider
                            ariaLabel="외곽선 두께"
                            max={6}
                            min={0}
                            onChange={(val) => updateSelectedText({ strokeWidth: val })}
                            step={0.5}
                            value={activeTextLayer.strokeWidth ?? 0}
                          />
                        </div>
                      </div>

                      <div className="border-t border-[#E4E4E7] pt-3">
                        <div className="mb-2 flex justify-between">
                          <span className="font-medium text-[#18181B]">글자 크기</span>
                          <span className="text-[#52525B]">{activeTextLayer.fontSize}px</span>
                        </div>
                        <MonochromeSlider
                          ariaLabel="글자 크기"
                          max={MAX_FONT_SIZE}
                          min={MIN_FONT_SIZE}
                          onChange={(val) => updateSelectedText({ fontSize: val })}
                          value={activeTextLayer.fontSize}
                        />
                      </div>

                      <div className="border-t border-[#E4E4E7] pt-3">
                        <div className="mb-2 flex justify-between">
                          <span className="font-medium text-[#18181B]">회전</span>
                          <span className="text-[#52525B]">{activeTextLayer.rotation}°</span>
                        </div>
                        <MonochromeSlider
                          ariaLabel="텍스트 회전"
                          max={180}
                          min={-180}
                          onChange={(val) => updateSelectedText({ rotation: val })}
                          step={1}
                          value={activeTextLayer.rotation}
                        />
                      </div>
                    </div>
                  )}

                  {activeTool === 'background' && (
                    <div className="space-y-4 text-xs">
                      <p className="rounded-[6px] border border-[#E4E4E7] bg-[#F4F4F5] p-3 text-[11px] leading-4 text-[#52525B]">
                        키캡 실물 원단은 발색이 가장 선명한{' '}
                        <strong className="text-[#18181B]">화이트 PBT</strong>이며, 선택한 색상이{' '}
                        <strong className="text-[#18181B]">5면 전체에 인쇄</strong>
                        됩니다.
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {BACKGROUND_PRESETS.map((preset) => {
                          const active = backgroundColor.toLowerCase() === preset.hex
                          return (
                            <button
                              aria-label={preset.name}
                              className={`flex h-9 w-full items-center justify-center rounded-[6px] border transition ${
                                active
                                  ? 'border-[#18181B] ring-2 ring-[#18181B]/25'
                                  : 'border-[#E4E4E7] hover:border-zinc-400'
                              }`}
                              key={preset.hex}
                              onClick={() => applyBackgroundColor(preset.hex, true)}
                              style={{ backgroundColor: preset.hex }}
                              title={preset.name}
                              type="button"
                            >
                              {active && (
                                <span
                                  className={`text-xs font-bold ${
                                    isDarkHex(preset.hex) ? 'text-white' : 'text-[#18181B]'
                                  }`}
                                >
                                  ✓
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                      <div className="flex items-center justify-between border-t border-[#E4E4E7] pt-3.5">
                        <span className="font-medium text-[#18181B]">직접 색상 선택</span>
                        <div className="flex items-center gap-2">
                          <input
                            className="h-8 w-12 cursor-pointer rounded-[6px] border border-[#E4E4E7] bg-white p-0.5"
                            onChange={(e) => applyBackgroundColor(e.target.value, false)}
                            type="color"
                            value={backgroundColor}
                          />
                          <button
                            className="h-8 rounded-[4px] bg-[#F4F4F5] px-2.5 text-[11px] font-medium text-[#18181B] hover:bg-zinc-200/80"
                            onClick={() => applyBackgroundColor('#ffffff', true)}
                            type="button"
                          >
                            기본 화이트
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* MONO / STUDIO 차별화 기능: 실시간 키보드 장착 미리보기 */}
            <KeyboardMountPreview
              backgroundColor={backgroundColor}
              meta={meta}
              previewDataUrl={mountPreviewUrl}
            />
          </div>

          {/* 우측: 상품 구매 패널 */}
          <div className="rounded-lg border border-[#E4E4E7] bg-white p-6 xl:sticky xl:top-28 xl:self-start max-sm:p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#52525B]">
                {product.brand} · CUSTOM STUDIO
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-[#18181B]">
                {product.name}
              </h1>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-sm text-[#52525B]">1개당</span>
              <p className="text-2xl font-bold tracking-tight text-[#18181B]">
                {formatPrice(product.basePrice)}
              </p>
            </div>

            <div className="mt-5 space-y-3 rounded-[6px] border border-[#E4E4E7] bg-[#F4F4F5] p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#52525B]">규격 / 사이즈</span>
                <span className="text-right font-medium text-[#18181B]">
                  {meta.keySize} ({meta.dimensions})
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#52525B]">소재 / 인쇄 배경</span>
                <span className="text-right font-medium text-[#18181B]">
                  PBT (화이트 원단) · {backgroundColor.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#52525B]">인쇄 방식</span>
                <span className="font-medium text-[#18181B]">5면 풀 컬러 승화전사</span>
              </div>
              <div className="flex items-center justify-between border-t border-[#E4E4E7] pt-3">
                <span className="text-[#52525B]">배송비</span>
                <span className="font-medium text-[#18181B]">3,000원</span>
              </div>
            </div>

            {/* 수량 선택 */}
            <div className="mt-5 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-[#18181B]">수량</span>
                <p className="text-xs text-[#52525B]">1개부터 주문 가능</p>
              </div>
              <div className="flex h-10 items-center rounded-[6px] border border-[#E4E4E7] bg-white">
                <button
                  aria-label="수량 감소"
                  className="h-full px-3 text-[#52525B] hover:text-[#18181B] disabled:opacity-40"
                  disabled={quantity <= 1 || isSoldOut}
                  onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                  type="button"
                >
                  <MinusIcon />
                </button>
                <span className="w-10 text-center text-sm font-medium text-[#18181B]">
                  {quantity}
                </span>
                <button
                  aria-label="수량 증가"
                  className="h-full px-3 text-[#52525B] hover:text-[#18181B] disabled:opacity-40"
                  disabled={quantity >= product.stockQuantity || isSoldOut}
                  onClick={() => setQuantity((prev) => Math.min(product.stockQuantity, prev + 1))}
                  type="button"
                >
                  <PlusIcon />
                </button>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-[#E4E4E7] pt-4 text-sm">
              <span className="text-[#52525B]">총 상품 금액 ({quantity}개)</span>
              <span className="text-xl font-bold text-[#18181B]">
                {formatPrice(product.basePrice * quantity)}
              </span>
            </div>

            <button
              className="mt-4 h-12 w-full rounded-[6px] bg-[#18181B] text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
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
      </div>

      {/* 하단 탭: 스토리 / 상품 정보 / 제작 가이드 / 리뷰 */}
      <div className="border-t border-[#E4E4E7] pt-10">
        <div className="flex flex-wrap gap-2 border-b border-[#E4E4E7] pb-4">
          {[
            { id: 'story' as const, label: '스토리' },
            { id: 'info' as const, label: '상품 정보' },
            { id: 'guide' as const, label: '제작 가이드' },
            { id: 'review' as const, label: '리뷰' },
          ].map((tab) => (
            <button
              className={`rounded-[4px] px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-[#18181B] text-white'
                  : 'bg-[#F4F4F5] text-[#52525B] hover:text-[#18181B]'
              }`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-[#E4E4E7] bg-white p-8 text-sm leading-7 text-zinc-700 max-sm:p-5">
          {activeTab === 'story' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-[#18181B]">
                원하는 이미지와 문구로 완성하는 5면 풀 컬러 키캡
              </h2>
              <p>{product.description}</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  고온·고압 승화전사 방식으로 상단과 4면 측면에 색이 스며들어 각인이 지워지지
                  않습니다.
                </li>
                <li>표준 기계식 십자(+) 스템(Cherry, Gateron, Kailh 등)과 완벽히 호환됩니다.</li>
                <li>불투명 화이트 PBT 소재 특성상 백라이트 LED 투과는 지원하지 않습니다.</li>
              </ul>
            </div>
          )}

          {activeTab === 'info' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-[#18181B]">상품 정보 및 주의사항</h2>
              <div className="grid grid-cols-2 gap-3 rounded-[6px] bg-[#F4F4F5] p-4 max-sm:grid-cols-1">
                <div>소재: 무광 PBT</div>
                <div>기본 원단: 화이트 (5면 배경색 인쇄 지원)</div>
                <div>프로파일: OEM Profile ({meta.keyType})</div>
                <div>크기: {meta.dimensions}</div>
              </div>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>표현 가능한 최소 선 두께는 0.2mm 이상을 권장합니다.</li>
                <li>
                  OEM 프로파일 특성상 체리/SA 프로파일 키캡 옆에 섞어 꽂으면 높이 차이가 날 수
                  있습니다.
                </li>
                <li>
                  RGB 웹 화면과 실제 CMYK 승화전사 인쇄 발색 사이에 미세한 색감 차이가 있을 수
                  있습니다.
                </li>
                <li>
                  측면 경사부에는 인쇄 필름이 늘어나며 흐려짐이 발생할 수 있으며 0.5mm 수준의 위치
                  오차가 생길 수 있습니다.
                </li>
              </ul>
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-[#18181B]">제작 가이드</h2>
              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <div className="rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] p-5">
                  <p className="font-semibold text-[#18181B]">
                    1. 중요 요소 위치 (연회색 점선 안쪽)
                  </p>
                  <p className="mt-1 text-[#52525B]">
                    핵심 텍스트, 로고, 인물 얼굴처럼 잘리면 안 되는 요소는 반드시 윗면 안전 영역
                    점선 안에 배치하세요.
                  </p>
                </div>
                <div className="rounded-lg border border-[#E4E4E7] bg-white p-5">
                  <p className="font-semibold text-[#18181B]">
                    2. 전면 인쇄 (진회색 점선 바깥까지)
                  </p>
                  <p className="mt-1 text-[#52525B]">
                    배경 색이나 패턴을 모서리 여백 없이 꽉 채우고 싶다면 배경색 탭이나 전체 인쇄
                    점선 끝까지 채워주세요.
                  </p>
                </div>
              </div>
              <div className="rounded-[6px] border border-[#E4E4E7] bg-[#F4F4F5] p-4 text-xs text-[#52525B]">
                <strong className="text-[#18181B]">R1~R4 프로파일 선택 팁:</strong> OEM 키캡은
                줄마다 경사/높이가 다릅니다. <code>R1</code>은 ESC·F열·숫자열, <code>R2</code>는
                QWERTY 열, <code>R3</code>는 ASDF 열·Enter, <code>R4</code>는 하단·방향키·Left
                Shift·Space Bar용으로 선택하시면 옆 키캡과 높이가 딱 맞습니다.
              </div>
              <p className="text-xs text-[#52525B]">
                주문 제작 상품은 공정 특성상 제작 시작 이후 단순 변심 교환·환불이 어려우며, 제품
                불량은 수령 후 7일 이내 접수 시 재제작해 드립니다.
              </p>
            </div>
          )}

          {activeTab === 'review' && (
            <div className="py-6 text-center text-[#52525B]">
              실구매 리뷰 기능(3차)이 연결되면 구매 고객의 포토 리뷰와 평점이 이곳에 표시됩니다.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
