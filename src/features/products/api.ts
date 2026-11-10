import type { StoreProduct } from '@/lib/store-shared'

// TODO(담당 4): 상품 목록/카테고리/상세 API를 구현하고 preview-data.ts를 대체합니다.
export async function getProducts(_category?: StoreProduct['category']): Promise<StoreProduct[]> {
  throw new Error('TODO: 상품 목록 API를 연결하세요.')
}

export async function getProductById(_productId: string): Promise<StoreProduct> {
  throw new Error('TODO: 상품 상세 API를 연결하세요.')
}
