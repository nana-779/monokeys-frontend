import { demoProducts } from '@/lib/demo-products'
import type { StoreProduct } from '@/lib/store-shared'

// 화면과 페이지 이동을 확인하기 위한 샘플 상품입니다. 실제 상품 데이터 API로 교체하세요.
export function getPreviewProducts(category?: StoreProduct['category']) {
  return category ? demoProducts.filter((product) => product.category === category) : demoProducts
}

// TODO: 상품 상세 API 구현 후 상품 ID로 조회하도록 교체하세요.
export function getPreviewProduct(productId: string) {
  return demoProducts.find((product) => String(product.id) === productId || product.slug === productId) ?? null
}
