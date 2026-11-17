import { ApiRequestError, apiRequest } from '@/lib/api-client'
import type { ProductType } from './interface/Product'

export type AddCartItemRequest = {
  productId: string
  quantity: number
}

// 백엔드가 내려주는 장바구니 아이템 응답 타입
export type CartItemResponse = {
  cartItemId: number
  productId: number
  name: string
  price: number
  quantity: number
  thumbnailUrl?: string
}

// 1. 내 장바구니 목록 조회 (GET /api/cart)
export async function getCartApi(): Promise<ProductType[]> {
  try {
    const res = await apiRequest<any>('/api/cart')
    const list = res?.data || res || []
    if (Array.isArray(list)) {
      return list.map((item: any) => ({
        productId: item.productId ?? item.product?.productId ?? item.id,
        name: item.name ?? item.product?.name ?? '',
        price: item.price ?? item.product?.basePrice ?? 0,
        stockQuantity: item.stockQuantity ?? item.product?.stockQuantity ?? 999,
        quantity: item.quantity ?? 1,
        thumbnailUrl: item.thumbnailUrl ?? item.product?.thumbnailURL ?? '',
        partType: item.partType ?? '',
        additionalPrice: item.additionalPrice ?? 0,
        customBuildId: item.customBuildId ?? 0,
        buildName: item.buildName ?? '',
        includeAssembly: item.includeAssembly ?? false,
      }))
    }
    return []
  } catch (error) {
    // 401(비로그인) 시에는 콘솔 에러 없이 조용히 빈 목록 반환 (Next.js 빨간 에러창 방지)
    if (error instanceof ApiRequestError && error.status === 401) {
      return []
    }
    console.error('장바구니 조회 실패:', error)
    return []
  }
}

// 2. 장바구니에 상품 담기 (POST /api/cart)
export async function addCartItemApi(productId: number, quantity: number): Promise<boolean> {
  try {
    await apiRequest('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity }),
    })
    return true
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      alert('로그인이 필요한 서비스입니다.')
      return false
    }
    console.error('장바구니 담기 실패:', error)
    return false
  }
}

// 3. 장바구니 수량 변경 (PATCH /api/cart/{productId})
export async function changeCartItem(productId: number, quantity: number): Promise<boolean> {
  try {
    await apiRequest(`/api/cart/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    })
    return true
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      alert('로그인이 필요한 서비스입니다.')
      return false
    }
    console.warn('수량 DB 동기화 실패:', error)
    return false
  }
}

// 4. 장바구니 단건 삭제 (DELETE /api/cart/{productId})
export async function removeCartItemApi(productId: number): Promise<boolean> {
  try {
    await apiRequest(`/api/cart/${productId}`, {
      method: 'DELETE',
    })
    return true
  } catch (error) {
    console.warn('삭제 DB 동기화 실패:', error)
    return false
  }
}

// 5. 장바구니 전체 비우기 (DELETE /api/cart)
export async function clearCartApi(): Promise<boolean> {
  try {
    await apiRequest('/api/cart', {
      method: 'DELETE',
    })
    return true
  } catch (error) {
    console.warn('비우기 DB 동기화 실패:', error)
    return false
  }
}