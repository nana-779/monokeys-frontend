export interface KeycapSpecMeta {
  keyType: string
  keySize: '1u' | '2.25u' | '6.25u'
  dimensions: string
  canvasWidth: number
  canvasHeight: number
  safeInsetX: number
  safeInsetY: number
}

export interface ImageLayerState {
  src: string
  element: HTMLImageElement
  x: number
  y: number
  scale: number
  rotation: number
  flipX: boolean
  flipY: boolean
}

export interface TextLayerState {
  id: string
  text: string
  fontFamily: string
  color: string
  fontSize: number
  x: number
  y: number
  rotation: number
  flipX: boolean
  flipY: boolean
  strokeColor?: string
  strokeWidth?: number
}

export interface SerializedImageDraft {
  dataUrl: string
  x: number
  y: number
  scale: number
  rotation: number
  flipX: boolean
  flipY: boolean
}

export interface CustomKeycapDesignSnapshot {
  backgroundColor: string
  imageLayer: ImageLayerState | null
  textLayers: TextLayerState[]
  imageOnTop: boolean
}

export interface StoredKeycapDraft {
  savedAt: string
  backgroundColor: string
  image: SerializedImageDraft | null
  textLayers: TextLayerState[]
  imageOnTop: boolean
}

export type ActiveTool = 'image' | 'text' | 'background'
export type SelectionRef = { kind: 'image' } | { kind: 'text'; id: string }
export type InfoTab = 'story' | 'info' | 'guide' | 'review'
export type HandleCorner = 'nw' | 'ne' | 'se' | 'sw'

export interface LayerBox {
  cx: number
  cy: number
  width: number
  height: number
  rotationRad: number
}

export const BLEED_PAD = 24
export const ROTATE_HANDLE_OFFSET = 22
export const MIN_IMAGE_SCALE = 0.15
export const MAX_IMAGE_SCALE = 12.0
export const MIN_FONT_SIZE = 10
export const MAX_FONT_SIZE = 96
export const MAX_TEXT_LAYERS = 8
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const SNAP_THRESHOLD = 0.02
export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export const BACKGROUND_PRESETS = [
  { name: '퓨어 화이트', hex: '#ffffff' },
  { name: '모노 블랙', hex: '#18181b' },
  { name: '크림 베이지', hex: '#f5efe6' },
  { name: '슬레이트 그레이', hex: '#475569' },
  { name: '파스텔 스카이', hex: '#dbeafe' },
  { name: '라벤더 미스트', hex: '#ede9fe' },
  { name: '세이지 민트', hex: '#dcfce7' },
  { name: '소프트 코랄', hex: '#ffe4e6' },
] as const

export const KEYCAP_VARIANT_LINKS = [
  { id: '901', label: 'R1 (1u)' },
  { id: '902', label: 'R2 (1u)' },
  { id: '903', label: 'R3 (1u)' },
  { id: '904', label: 'R4 (1u)' },
  { id: '905', label: 'Enter (2.25u)' },
  { id: '906', label: 'Shift (2.25u)' },
  { id: '907', label: 'Space (6.25u)' },
] as const

export function isDarkHex(hex: string): boolean {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return false
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

export const FONT_OPTIONS = [
  { label: '기본 고딕 (Sans)', value: 'Pretendard, sans-serif' },
  { label: '클래식 명조 (Serif)', value: 'Georgia, serif' },
  { label: '개발자 모노 (Mono)', value: 'ui-monospace, SFMono-Regular, monospace' },
  { label: '임팩트 볼드 (Impact)', value: 'Impact, Charcoal, sans-serif' },
  { label: '라운드 클린 (Trebuchet)', value: '"Trebuchet MS", sans-serif' },
  { label: '세련 모던 (Courier)', value: '"Courier New", monospace' },
] as const

export const clampImageScale = (value: number) =>
  Math.round(Math.min(MAX_IMAGE_SCALE, Math.max(MIN_IMAGE_SCALE, value)) * 100) / 100

export const clampFontSize = (value: number) =>
  Math.round(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value)))

export function createTextLayer(index: number, initialText = ''): TextLayerState {
  return {
    id: `txt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: initialText,
    fontFamily: 'Pretendard, sans-serif',
    color: '#111827',
    fontSize: 30,
    x: 0.5,
    y: Math.min(0.78, 0.42 + (index % 3) * 0.14),
    rotation: 0,
    flipX: false,
    flipY: false,
    strokeColor: '#ffffff',
    strokeWidth: 0,
  }
}

export function resolveKeycapMeta(productName: string): KeycapSpecMeta {
  if (productName.includes('Space Bar')) {
    return {
      keyType: 'Space Bar',
      keySize: '6.25u',
      dimensions: '11.8 × 1.78 × 1.16cm',
      canvasWidth: 720,
      canvasHeight: 168,
      safeInsetX: 52,
      safeInsetY: 22,
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

export function drawRoundedRectPath(
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

export function getRotatedBoxCorners(box: LayerBox): Array<{ key: HandleCorner; x: number; y: number }> {
  const hw = box.width / 2
  const hh = box.height / 2
  const cos = Math.cos(box.rotationRad)
  const sin = Math.sin(box.rotationRad)
  const locals: Array<{ key: HandleCorner; lx: number; ly: number }> = [
    { key: 'nw', lx: -hw, ly: -hh },
    { key: 'ne', lx: hw, ly: -hh },
    { key: 'se', lx: hw, ly: hh },
    { key: 'sw', lx: -hw, ly: hh },
  ]
  return locals.map(({ key, lx, ly }) => ({
    key,
    x: box.cx + lx * cos - ly * sin,
    y: box.cy + lx * sin + ly * cos,
  }))
}

export function getRotationHandlePoint(box: LayerBox): {
  stemX: number
  stemY: number
  knobX: number
  knobY: number
} {
  const cos = Math.cos(box.rotationRad)
  const sin = Math.sin(box.rotationRad)
  const topLocalY = -box.height / 2
  const knobLocalY = topLocalY - ROTATE_HANDLE_OFFSET
  return {
    stemX: box.cx - topLocalY * sin,
    stemY: box.cy + topLocalY * cos,
    knobX: box.cx - knobLocalY * sin,
    knobY: box.cy + knobLocalY * cos,
  }
}

export function isPointInsideBox(px: number, py: number, box: LayerBox): boolean {
  const dx = px - box.cx
  const dy = py - box.cy
  const cos = Math.cos(-box.rotationRad)
  const sin = Math.sin(-box.rotationRad)
  const lx = dx * cos - dy * sin
  const ly = dx * sin + dy * cos
  return Math.abs(lx) <= box.width / 2 && Math.abs(ly) <= box.height / 2
}

export function findCornerAt(px: number, py: number, box: LayerBox): HandleCorner | null {
  for (const corner of getRotatedBoxCorners(box)) {
    if (Math.hypot(px - corner.x, py - corner.y) <= 14) {
      return corner.key
    }
  }
  return null
}

export function isPointOnRotateHandle(px: number, py: number, box: LayerBox): boolean {
  const handle = getRotationHandlePoint(box)
  return Math.hypot(px - handle.knobX, py - handle.knobY) <= 15
}

export function snapNormalizedPoint(x: number, y: number): {
  x: number
  y: number
  snappedX: boolean
  snappedY: boolean
} {
  const snappedX = Math.abs(x - 0.5) <= SNAP_THRESHOLD
  const snappedY = Math.abs(y - 0.5) <= SNAP_THRESHOLD
  return {
    x: snappedX ? 0.5 : Math.min(1.15, Math.max(-0.15, x)),
    y: snappedY ? 0.5 : Math.min(1.15, Math.max(-0.15, y)),
    snappedX,
    snappedY,
  }
}

export function snapRotationAngle(degrees: number, forceStepSnap: boolean): number {
  let normalized = Math.round(degrees)
  while (normalized > 180) normalized -= 360
  while (normalized < -180) normalized += 360
  if (forceStepSnap) {
    return Math.round(normalized / 15) * 15
  }
  for (const cardinal of [-180, -90, 0, 90, 180]) {
    if (Math.abs(normalized - cardinal) <= 4) return cardinal
  }
  return normalized
}

export function compressImageForDraft(img: HTMLImageElement): string {
  const maxDim = 640
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return img.src
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

export function getDraftStorageKey(productId: string | number): string {
  return `monokeys_custom_keycap_draft_${String(productId)}`
}
