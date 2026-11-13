import type { StoreProduct } from '@/lib/store-shared'
import { API_BASE_URL } from '@/lib/api-client'

type ProductResponse = {
  productId: number
  categoryName: string
  name: string
  basePrice: number
  stockQuantity: number
  thumbnailUrl: string | null
  description: string | null
  active: boolean
}

type ApiResponse<T> = { success: boolean; message: string | null; data: T | null }

function toStoreProduct(item: ProductResponse): StoreProduct {
  const category = ({
    '하우징': 'housing', '기판': 'keyboards', '스위치': 'switches', '키캡': 'keycaps',
    housing: 'housing', pcb: 'keyboards', keyboards: 'keyboards', switches: 'switches', keycaps: 'keycaps',
  } as Record<string, StoreProduct['category']>)[item.categoryName] ?? 'housing'

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
    images: item.thumbnailUrl ? [{ id: item.productId, url: item.thumbnailUrl, alt: item.name }] : [],
  }
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: { Accept: 'application/json' } })
  const result = await response.json() as ApiResponse<T>
  if (!response.ok || !result.success || result.data == null) {
    throw new Error(result.message || '상품 정보를 불러올 수 없습니다.')
  }
  return result.data
}

export async function getProducts(category?: StoreProduct['category']): Promise<StoreProduct[]> {
  const items = await request<ProductResponse[]>('/products')
  return items.map(toStoreProduct).filter((item) => !category || item.category === category)
}

export async function getProductById(productId: string): Promise<StoreProduct> {
  const item = await request<ProductResponse>(`/products/${encodeURIComponent(productId)}`)
  return toStoreProduct(item)
}
