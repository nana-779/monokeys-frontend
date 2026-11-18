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
import { uploadCustomKeycapImages } from '@/features/products/custom-keycap-api'
import { KeyboardMountPreview } from '@/features/products/custom-keycap-preview'
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

export function CustomKeycapEditorView({ product }: CustomKeycapEditorViewProps) {
  const { addItem } = useCart()
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

      const ctx = targetCanvas?.getContext('2d') ?? canvasRef.current?.getContext('2d')
      let textW = textItem.text.length * textItem.fontSize * 0.65
      if (ctx) {
        ctx.save()
        ctx.font = `700 ${textItem.fontSize}px ${textItem.fontFamily}`
        textW = ctx.measureText(textItem.text).width
        ctx.restore()
      }
      return {
        cx: BLEED_PAD + bodyW * textItem.x,
        cy: BLEED_PAD + bodyH * textItem.y,
        width: Math.max(36, textW + 18),
        height: Math.max(28, textItem.fontSize * 1.3),
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
      ctx.fillStyle = '#f4f4f5'
      ctx.fillRect(0, 0, w, h)

      // 1) 키캡 5면 베이스 외곽 + 입체 음영 (선택한 5면 인쇄 배경색 반영)
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.16)'
      ctx.shadowBlur = 18
      ctx.shadowOffsetY = 8
      ctx.fillStyle = backgroundColor
      drawRoundedRectPath(ctx, BLEED_PAD, BLEED_PAD, bodyW, bodyH, 18)
      ctx.fill()
      ctx.restore()

      // 2) 키캡 내부 클리핑 영역에 이미지/다중 텍스트 레이어 렌더
      ctx.save()
      drawRoundedRectPath(ctx, BLEED_PAD, BLEED_PAD, bodyW, bodyH, 18)
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
          ctx.save()
          ctx.translate(BLEED_PAD + bodyW * t.x, BLEED_PAD + bodyH * t.y)
          ctx.rotate((t.rotation * Math.PI) / 180)
          ctx.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1)
          ctx.font = `700 ${t.fontSize}px ${t.fontFamily}`
          ctx.fillStyle = t.color
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(t.text, 0, 0)
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

      // 윗면 경사 입체감 테두리
      ctx.strokeStyle = isDarkHex(backgroundColor)
        ? 'rgba(255, 255, 255, 0.22)'
        : 'rgba(0, 0, 0, 0.08)'
      ctx.lineWidth = 2
      drawRoundedRectPath(
        ctx,
        BLEED_PAD + meta.safeInsetX - 10,
        BLEED_PAD + meta.safeInsetY - 10,
        bodyW - (meta.safeInsetX - 10) * 2,
        bodyH - (meta.safeInsetY - 10) * 2,
        12,
      )
      ctx.stroke()
      ctx.restore()

      // 3) 편집용 가이드선 (검정 블리드선 + 초록 안전영역) & 빈 캔버스 안내 워터마크
      if (includeGuides) {
        ctx.save()
        ctx.setLineDash([6, 4])
        ctx.strokeStyle = '#18181b'
        ctx.lineWidth = 1.5
        drawRoundedRectPath(ctx, BLEED_PAD + 2, BLEED_PAD + 2, bodyW - 4, bodyH - 4, 16)
        ctx.stroke()

        ctx.strokeStyle = '#16a34a'
        ctx.lineWidth = 1.5
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
          ctx.fillStyle = isDarkHex(backgroundColor)
            ? 'rgba(255, 255, 255, 0.45)'
            : 'rgba(113, 113, 122, 0.7)'
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
          ctx.strokeStyle = '#ec4899'
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
          ctx.strokeStyle = '#2563eb'
          ctx.lineWidth = 1.5
          ctx.setLineDash([4, 3])
          ctx.beginPath()
          ctx.moveTo(corners[0].x, corners[0].y)
          ctx.lineTo(corners[1].x, corners[1].y)
          ctx.lineTo(corners[2].x, corners[2].y)
          ctx.lineTo(corners[3].x, corners[3].y)
          ctx.closePath()
          ctx.stroke()

          // 회전 연결선 + 회전 손잡이(↻)
          ctx.setLineDash([])
          ctx.beginPath()
          ctx.moveTo(rotHandle.stemX, rotHandle.stemY)
          ctx.lineTo(rotHandle.knobX, rotHandle.knobY)
          ctx.stroke()

          ctx.fillStyle = '#2563eb'
          ctx.beginPath()
          ctx.arc(rotHandle.knobX, rotHandle.knobY, 7, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2
          ctx.stroke()

          // 4개 모서리 크기 조절 사각 핸들
          for (const corner of corners) {
            ctx.fillStyle = '#ffffff'
            ctx.strokeStyle = '#2563eb'
            ctx.lineWidth = 2
            ctx.fillRect(corner.x - 5, corner.y - 5, 10, 10)
            ctx.strokeRect(corner.x - 5, corner.y - 5, 10, 10)
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
            t.id === target.id
              ? { ...t, fontSize: clampFontSize(t.fontSize + direction * 2) }
              : t,
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
            ? imageLayer?.rotation ?? 0
            : textLayers.find((t) => t.id === selection.id)?.rotation ?? 0
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
      originX: target.kind === 'image' ? imageLayer!.x : targetText?.x ?? 0.5,
      originY: target.kind === 'image' ? imageLayer!.y : targetText?.y ?? 0.5,
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
    setImageLayer({ ...imageLayer, scale: clampImageScale(coverScale), x: 0.5, y: 0.5 })
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
      alert('브라우저 저장 공간이 부족하여 임시저장에 실패했습니다. (사진 크기를 줄여 시도해 주세요)')
    }
  }

  const handleLoadDraft = (draft: StoredKeycapDraft) => {
    pushUndoSnapshot()
    setBackgroundColor(draft.backgroundColor || '#ffffff')
    setTextLayers(
      draft.textLayers.length > 0 ? draft.textLayers : [createTextLayer(0, '')],
    )
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

    setSubmitting(true)
    try {
      const printBlob = await exportCanvasBlob(false)
      const previewBlob = await exportCanvasBlob(false)
      const uploaded = await uploadCustomKeycapImages(printBlob, previewBlob)

      const primaryText = nonEmptyTexts[0] ?? null
      const designPayload = {
        keyType: meta.keyType,
        keySize: meta.keySize,
        baseColor: 'WHITE',
        backgroundColor,
        dimensions: meta.dimensions,
        previewImageUrl: uploaded.previewImageUrl,
        printImageUrl: uploaded.imageUrl,
        customText: nonEmptyTexts.length > 0 ? nonEmptyTexts.map((t) => t.text.trim()).join(' / ') : null,
        fontFamily: primaryText ? primaryText.fontFamily : null,
        textColor: primaryText ? primaryText.color : null,
        textLayers: nonEmptyTexts.map((t) => ({
          text: t.text.trim(),
          fontFamily: t.fontFamily,
          color: t.color,
          fontSize: t.fontSize,
          rotation: t.rotation,
        })),
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
        {/* 좌측: MONO / STUDIO 커스텀 키캡 에디터 */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
          {/* 7종 커스텀 키캡 규격 빠른 전환 */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-zinc-100 pb-3">
            <span className="mr-1 text-[11px] font-semibold text-zinc-400">규격 전환:</span>
            {KEYCAP_VARIANT_LINKS.map((variant) => {
              const isCurrent = String(product.id) === variant.id
              return (
                <Link
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    isCurrent
                      ? 'bg-zinc-950 text-white'
                      : 'border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs text-blue-900">
              <span>이전에 임시저장한 디자인({savedDraft.savedAt})이 있습니다.</span>
              <div className="flex items-center gap-2">
                <button
                  className="rounded bg-blue-600 px-2.5 py-1 font-semibold text-white hover:bg-blue-700"
                  onClick={() => handleLoadDraft(savedDraft)}
                  type="button"
                >
                  불러오기
                </button>
                <button
                  className="text-zinc-500 underline hover:text-zinc-800"
                  onClick={handleClearDraft}
                  type="button"
                >
                  삭제
                </button>
              </div>
            </div>
          )}

          {/* 상단 툴바 */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                className="rounded-md border border-zinc-200 px-2.5 py-1.5 font-medium hover:bg-zinc-50 disabled:opacity-40"
                disabled={undoStack.length === 0}
                onClick={handleUndo}
                title="실행 취소 (Ctrl+Z)"
                type="button"
              >
                ↩ 실행취소
              </button>
              <button
                className="rounded-md border border-zinc-200 px-2.5 py-1.5 font-medium hover:bg-zinc-50"
                onClick={resetAllDesign}
                type="button"
              >
                초기화
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
                onClick={alignSelectedCenter}
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
              <button
                className="rounded-md border border-zinc-300 bg-zinc-50 px-2.5 py-1.5 font-semibold text-zinc-800 hover:bg-zinc-100"
                onClick={handleSaveDraft}
                type="button"
              >
                임시저장
              </button>
              <button
                className="rounded-md border border-zinc-200 px-2.5 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50"
                onClick={handleDownloadPreviewPng}
                type="button"
              >
                PNG 저장
              </button>
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-600">
              <input
                checked={showGuides}
                onChange={(e) => setShowGuides(e.target.checked)}
                type="checkbox"
              />
              가이드선
            </label>
          </div>
          {draftStatusMessage && (
            <p className="mb-2 text-xs font-medium text-blue-600">{draftStatusMessage}</p>
          )}

          {/* 캔버스 + 우측 도구 레일 */}
          <div className="grid grid-cols-[1fr_240px] gap-5 max-md:grid-cols-1">
            <div>
              <div
                className={`flex min-h-[380px] items-center justify-center rounded-xl p-6 transition ${
                  isDraggingFile
                    ? 'bg-blue-50/70 ring-2 ring-dashed ring-blue-500'
                    : 'bg-zinc-100'
                }`}
                onDragLeave={handleCanvasDragLeave}
                onDragOver={handleCanvasDragOver}
                onDrop={handleCanvasDrop}
              >
                <canvas
                  className="max-h-[360px] max-w-full touch-none rounded-lg"
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
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-xs border border-dashed border-green-600" />
                    초록 점선: 윗면 안전 영역
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-xs border border-dashed border-zinc-900" />
                    검정 점선: 5면 전체 인쇄
                  </span>
                </div>
                <span>이동 · 모서리 크기 · 상단 파란점 회전 · 휠 줌</span>
              </div>
            </div>

            {/* 우측 도구 패널: 이미지 / 다중 텍스트 / 5면 배경색 */}
            <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4">
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-200/70 p-1 text-xs font-semibold">
                <button
                  className={`rounded-md py-2 transition ${
                    activeTool === 'image' ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-600'
                  }`}
                  onClick={() => {
                    setActiveTool('image')
                    setSelection({ kind: 'image' })
                  }}
                  type="button"
                >
                  이미지
                </button>
                <button
                  className={`rounded-md py-2 transition ${
                    activeTool === 'text' ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-600'
                  }`}
                  onClick={() => {
                    setActiveTool('text')
                    if (activeTextLayer) setSelection({ kind: 'text', id: activeTextLayer.id })
                  }}
                  type="button"
                >
                  텍스트
                </button>
                <button
                  className={`rounded-md py-2 transition ${
                    activeTool === 'background'
                      ? 'bg-white text-zinc-950 shadow-xs'
                      : 'text-zinc-600'
                  }`}
                  onClick={() => setActiveTool('background')}
                  type="button"
                >
                  배경색
                </button>
              </div>

              {activeTool === 'image' && (
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
                      <div>
                        <div className="mb-1.5 flex items-center justify-between text-zinc-600">
                          <span>크기</span>
                          <div className="flex items-center gap-1">
                            <button
                              aria-label="이미지 축소"
                              className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold hover:bg-zinc-100"
                              onClick={() => {
                                pushUndoSnapshot()
                                setImageLayer({
                                  ...imageLayer,
                                  scale: clampImageScale(imageLayer.scale - 0.1),
                                })
                              }}
                              type="button"
                            >
                              -
                            </button>
                            <input
                              aria-label="이미지 크기 퍼센트"
                              className="w-12 rounded border border-zinc-300 bg-white px-1 py-0.5 text-center text-[11px] font-semibold text-zinc-900"
                              max={300}
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
                            <span className="text-[11px] text-zinc-500">%</span>
                            <button
                              aria-label="이미지 확대"
                              className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold hover:bg-zinc-100"
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
                        <input
                          className="w-full"
                          max={MAX_IMAGE_SCALE}
                          min={MIN_IMAGE_SCALE}
                          onChange={(e) =>
                            setImageLayer({
                              ...imageLayer,
                              scale: clampImageScale(Number(e.target.value)),
                            })
                          }
                          step={0.01}
                          type="range"
                          value={imageLayer.scale}
                        />
                        <div className="mt-2 grid grid-cols-3 gap-1">
                          <button
                            className="rounded border border-zinc-200 bg-white py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                            onClick={applySafeAreaFitScale}
                            type="button"
                          >
                            영역 맞춤
                          </button>
                          <button
                            className="rounded border border-zinc-200 bg-white py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                            onClick={applyCoverScale}
                            type="button"
                          >
                            꽉 채우기
                          </button>
                          <button
                            className="rounded border border-zinc-200 bg-white py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
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
                          step={1}
                          type="range"
                          value={imageLayer.rotation}
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}

              {activeTool === 'text' && activeTextLayer && (
                <div className="space-y-3 text-xs">
                  {/* 다중 텍스트 레이어 목록 & 추가 */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-medium text-zinc-700">
                        텍스트 레이어 ({textLayers.length}/{MAX_TEXT_LAYERS})
                      </span>
                      <button
                        className="rounded bg-zinc-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-zinc-700 disabled:opacity-40"
                        disabled={textLayers.length >= MAX_TEXT_LAYERS}
                        onClick={addNewTextLayer}
                        type="button"
                      >
                        + 문구 추가
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {textLayers.map((layer, idx) => {
                        const active = layer.id === activeTextLayer.id
                        return (
                          <div
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
                              active
                                ? 'border-blue-600 bg-blue-50 font-semibold text-blue-700'
                                : 'border-zinc-200 bg-white text-zinc-600'
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

                  <label className="block">
                    <span className="mb-1 block font-medium text-zinc-700">문구 입력</span>
                    <input
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
                      maxLength={30}
                      onChange={(e) => {
                        setSelection({ kind: 'text', id: activeTextLayer.id })
                        updateSelectedText({ text: e.target.value })
                      }}
                      placeholder="예: ESC, MY KEY"
                      type="text"
                      value={activeTextLayer.text}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block font-medium text-zinc-700">폰트</span>
                    <select
                      className="w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-2 outline-none"
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
                    <span className="font-medium text-zinc-700">글자 색상</span>
                    <input
                      className="h-8 w-12 cursor-pointer rounded border border-zinc-300 bg-white p-0.5"
                      onChange={(e) => updateSelectedText({ color: e.target.value })}
                      type="color"
                      value={activeTextLayer.color}
                    />
                  </div>

                  <label className="block">
                    <span className="mb-1 flex justify-between text-zinc-600">
                      <span>글자 크기</span>
                      <span>{activeTextLayer.fontSize}px</span>
                    </span>
                    <input
                      className="w-full"
                      max={MAX_FONT_SIZE}
                      min={MIN_FONT_SIZE}
                      onChange={(e) => updateSelectedText({ fontSize: Number(e.target.value) })}
                      type="range"
                      value={activeTextLayer.fontSize}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 flex justify-between text-zinc-600">
                      <span>회전</span>
                      <span>{activeTextLayer.rotation}°</span>
                    </span>
                    <input
                      className="w-full"
                      max={180}
                      min={-180}
                      onChange={(e) => updateSelectedText({ rotation: Number(e.target.value) })}
                      step={1}
                      type="range"
                      value={activeTextLayer.rotation}
                    />
                  </label>
                </div>
              )}

              {activeTool === 'background' && (
                <div className="space-y-3 text-xs">
                  <p className="rounded-lg border border-zinc-200 bg-white p-2.5 text-[11px] leading-4 text-zinc-600">
                    키캡 실물 원단은 발색이 가장 선명한 <strong>화이트 PBT</strong>이며, 선택한
                    색상이 <strong>5면 전체에 인쇄</strong>됩니다.
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {BACKGROUND_PRESETS.map((preset) => {
                      const active = backgroundColor.toLowerCase() === preset.hex
                      return (
                        <button
                          aria-label={preset.name}
                          className={`flex h-9 w-full items-center justify-center rounded-lg border transition ${
                            active ? 'border-blue-600 ring-2 ring-blue-300' : 'border-zinc-300'
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
                                isDarkHex(preset.hex) ? 'text-white' : 'text-zinc-900'
                              }`}
                            >
                              ✓
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex items-center justify-between border-t border-zinc-200 pt-3">
                    <span className="font-medium text-zinc-700">직접 색상 선택</span>
                    <div className="flex items-center gap-2">
                      <input
                        className="h-8 w-12 cursor-pointer rounded border border-zinc-300 bg-white p-0.5"
                        onChange={(e) => applyBackgroundColor(e.target.value, false)}
                        type="color"
                        value={backgroundColor}
                      />
                      <button
                        className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] hover:bg-zinc-100"
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

          {/* MONO / STUDIO 차별화 기능: 실시간 키보드 장착 미리보기 */}
          <KeyboardMountPreview
            backgroundColor={backgroundColor}
            meta={meta}
            previewDataUrl={mountPreviewUrl}
          />
        </div>

        {/* 우측: 상품 구매 패널 */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {product.brand} · CUSTOM STUDIO
            </p>
            <h1 className="mt-2 text-3xl font-medium tracking-[-0.04em] text-zinc-950">
              {product.name}
            </h1>
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
              <span className="text-zinc-500">소재 / 인쇄 배경</span>
              <span className="font-medium text-zinc-900">
                PBT (화이트 원단) · {backgroundColor.toUpperCase()}
              </span>
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
                <div>기본 원단: 화이트 (5면 배경색 인쇄 지원)</div>
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
                    배경 색이나 패턴을 모서리 여백 없이 꽉 채우고 싶다면 배경색 탭이나 검정 점선 끝까지 채워주세요.
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
                <strong>R1~R4 프로파일 선택 팁:</strong> OEM 키캡은 줄마다 경사/높이가 다릅니다.{' '}
                <code>R1</code>은 ESC·F열·숫자열, <code>R2</code>는 QWERTY 열, <code>R3</code>는 ASDF 열·Enter,{' '}
                <code>R4</code>는 하단·방향키·Left Shift·Space Bar용으로 선택하시면 옆 키캡과 높이가 딱 맞습니다.
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
