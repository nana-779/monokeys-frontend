import type { StoreProduct } from '@/lib/store-shared'
import { API_BASE_URL } from '@/lib/api-client'

type ApiResponse<T> = {
  success: boolean
  message: string | null
  data: T | null
}

type ProductResponse = {
  productId: number
  categoryName: string
  categoryId: string
  name: string
  basePrice: number
  stockQuantity: number
  thumbnailUrl: string | null
  description: string | null
  active: boolean
  layout: string | null
  housingMaterial: string | null
  supportPins: string | null
  isWireless: boolean | null
  switchPin: number | null
  switchType: string | null
  keycapMaterial: string | null
}

export type AdminProduct = StoreProduct & {
  categoryName: string
  categoryId: string
  thumbnailUrl: string | null
  layout: string | null
  housingMaterial: string | null
  supportPins: string | null
  isWireless: boolean | null
  switchPin: number | null
  switchType: string | null
  keycapMaterial: string | null
}

export type AdminProductUpdateInput = {
  categoryName: string
  name: string
  basePrice: number
  stockQuantity: number
  description: string
  layout: string | null
  housingMaterial: string | null
  supportPins: string | null
  isWireless: boolean | null
  switchPin: number | null
  switchType: string | null
  keycapMaterial: string | null
}

// 등록/삭제 UI는 별도 연결 전까지 기존 TODO 계약을 유지합니다.
export type AdminProductInput = Omit<StoreProduct, 'id'>

export async function createAdminProduct(_input: AdminProductInput): Promise<StoreProduct> {
  throw new Error('TODO: 관리자 상품 등록 API를 연결하세요.')
}

function toAdminProduct(item: ProductResponse): AdminProduct {
  const categories: Record<string, StoreProduct['category']> = {
    housing: 'housing',
    pcb: 'keyboards',
    switches: 'switches',
    keycaps: 'keycaps',
  }
  const category = categories[item.categoryId]
  if (!category) throw new Error(`지원하지 않는 상품 카테고리입니다: ${item.categoryName}`)

  return {
    id: item.productId,
    slug: String(item.productId),
    name: item.name,
    basePrice: item.basePrice,
    category,
    description: item.description ?? '',
    stockQuantity: item.stockQuantity,
    shippingFee: 0,
    brand: '',
    images: item.thumbnailUrl
      ? [{ id: item.productId, url: item.thumbnailUrl, alt: item.name }]
      : [],
    categoryName: item.categoryName,
    categoryId: item.categoryId,
    thumbnailUrl: item.thumbnailUrl,
    layout: item.layout,
    housingMaterial: item.housingMaterial,
    supportPins: item.supportPins,
    isWireless: item.isWireless,
    switchPin: item.switchPin,
    switchType: item.switchType,
    keycapMaterial: item.keycapMaterial,
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  let result: ApiResponse<T>
  try {
    result = (await response.json()) as ApiResponse<T>
  } catch {
    throw new Error('서버 응답을 읽을 수 없습니다. 백엔드 상태를 확인해 주세요.')
  }
  if (!response.ok || !result.success || result.data == null) {
    throw new Error(result.message || '상품 요청을 처리할 수 없습니다.')
  }
  return result.data
}

// 백엔드의 관리자 상품 목록 API가 준비되기 전까지 활성 상품 조회 API를 사용합니다.
export async function getAdminProducts(): Promise<AdminProduct[]> {
  const response = await fetch(`${API_BASE_URL}/api/products`, {
    headers: { Accept: 'application/json' },
  })
  const items = await readResponse<ProductResponse[]>(response)
  return items.map(toAdminProduct)
}

export async function updateAdminProduct(
  productId: string,
  input: AdminProductUpdateInput,
  image?: File,
): Promise<AdminProduct> {
  const body = new FormData()
  body.append('product', new Blob([JSON.stringify(input)], { type: 'application/json' }))
  if (image) body.append('image', image)

  const response = await fetch(
    `${API_BASE_URL}/api/admin/products/${encodeURIComponent(productId)}`,
    { method: 'PATCH', body },
  )
  return toAdminProduct(await readResponse<ProductResponse>(response))
}

export async function deleteAdminProduct(_productId: string): Promise<void> {
  throw new Error('TODO: 관리자 상품 삭제 API를 연결하세요.')
}
